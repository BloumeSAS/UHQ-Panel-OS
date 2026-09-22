import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { request } from 'undici';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import * as readline from 'readline';
import { SettingsService } from '../../config/settings.service';

interface AsnRange {
  /** IP de départ de la plage, encodée en entier (v4 : 32 bits, v6 : 128 bits). */
  start: bigint;
  end: bigint;
  org: string;
}

const DATA_DIR = path.resolve(process.cwd(), 'data', 'geoip');
const DB_GZ_PATH = path.join(DATA_DIR, 'dbip-asn-lite.csv.gz');

/**
 * DB-IP ne publie pas de flag "VPN" — seulement l'organisation ASN qui
 * détient la plage d'IP (même base que https://github.com/tiagozip/cap
 * utilise pour ses vérifications d'IP). On approxime "IP de VPN" par "IP
 * appartenant à un hébergeur/VPN connu" : un particulier chez un FAI
 * résidentiel (Orange, Free, Comcast, Deutsche Telekom...) n'apparaît
 * jamais dans cette liste, alors qu'un VPN loue systématiquement ses IP
 * chez un hébergeur. Forcément imparfait dans les deux sens (un petit FAI
 * mal classé "hosting" = faux positif ; un VPN passant par de l'IP
 * résidentielle louée = faux négatif) — heuristique, pas une vérité absolue.
 */
const VPN_ASN_KEYWORDS = [
  'vpn', 'proxy', 'hosting', 'hebergement', 'hébergement', 'datacenter', 'data center',
  'dedicated server', 'colocation', 'colo', 'cloud', 'server', 'servers',
  'digitalocean', 'digital ocean', 'ovh', 'hetzner', 'amazon', 'aws',
  'google cloud', 'microsoft azure', 'azure', 'linode', 'akamai', 'vultr',
  'm247', 'choopa', 'leaseweb', 'scaleway', 'contabo', 'oracle cloud',
  'alibaba', 'tencent', 'hostinger', 'hostwinds', 'ionos', 'psychz',
  'nordvpn', 'nord security', 'expressvpn', 'surfshark', 'protonvpn', 'proton ag',
  'mullvad', 'private internet access', 'ipvanish', 'windscribe', 'tunnelbear',
  'cyberghost', 'psiphon', 'hide.me', 'torguard', 'vpn unlimited', 'zenmate',
  'hola', 'perfect privacy', 'privado', 'astrill', 'purevpn', 'ivpn',
];

function isVpnOrg(org: string): boolean {
  const lower = org.toLowerCase();
  return VPN_ASN_KEYWORDS.some((kw) => lower.includes(kw));
}

/** IPv4 dotted → bigint. IPv6 → bigint. Retourne null si invalide. */
function ipToBigInt(ip: string): bigint | null {
  if (ip.includes(':')) {
    // IPv6 — expansion simplifiée (suffisant pour comparer des plages).
    let full = ip;
    if (full.includes('::')) {
      const [head, tail] = full.split('::');
      const headParts = head ? head.split(':') : [];
      const tailParts = tail ? tail.split(':') : [];
      const missing = 8 - headParts.length - tailParts.length;
      if (missing < 0) return null;
      full = [...headParts, ...Array(missing).fill('0'), ...tailParts].join(':');
    }
    const parts = full.split(':');
    if (parts.length !== 8) return null;
    let out = 0n;
    for (const p of parts) {
      const v = parseInt(p || '0', 16);
      if (Number.isNaN(v)) return null;
      out = (out << 16n) | BigInt(v);
    }
    return out;
  }
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return null;
  return BigInt((parts[0] << 24) + (parts[1] << 16) + (parts[2] << 8) + parts[3]) & 0xffffffffn;
}

/** Résultat mis en cache par IP — évite de re-taper l'API à chaque connexion d'un même client. */
const API_CACHE_TTL_MS = 6 * 3600_000;

@Injectable()
export class VpnDetectionService {
  private readonly logger = new Logger(VpnDetectionService.name);
  private ranges: AsnRange[] = [];
  private loaded = false;
  private loadingPromise: Promise<void> | null = null;
  private readonly apiCache = new Map<string, { vpn: boolean; expires: number }>();

  constructor(private readonly settings: SettingsService) {}

  /**
   * true si `ip` est un VPN/proxy. Deux signaux combinés (OR) :
   *  1. proxycheck.io — UNE requête réseau par IP (résultat mis en cache
   *     `API_CACHE_TTL_MS`), service dédié à la détection VPN/proxy en
   *     temps réel, bien plus fiable que l'heuristique ASN seule (repérait
   *     "146.70.55.196" mais ratait "212.119.33.19", un VPN non hébergé
   *     chez un hébergeur reconnaissable par son nom ASN).
   *  2. La base ASN locale DB-IP Lite (`checkAsnRanges`, gratuite, déjà en
   *     mémoire, zéro latence réseau) — gardée en complément : filet de
   *     sécurité si proxycheck.io est indisponible/quota dépassé, et
   *     détecte aussi certains hébergeurs que proxycheck.io ne classe pas
   *     "VPN" à proprement parler.
   * Fail-open sur les deux : si aucun des deux signaux ne peut trancher
   * (API injoignable ET base ASN indisponible), l'IP n'est PAS bloquée.
   */
  async isVpn(ip: string): Promise<boolean> {
    if (await this.checkAsnRanges(ip)) return true;
    const api = await this.checkApi(ip);
    return api === true;
  }

  /** Vérifie via proxycheck.io (gratuit sans clé, quota plus large avec une clé — réglage `vpnCheckApiKey`). */
  private async checkApi(ip: string): Promise<boolean | null> {
    const cached = this.apiCache.get(ip);
    if (cached && cached.expires > Date.now()) return cached.vpn;

    try {
      const apiKey = this.settings.get('vpnCheckApiKey');
      const url = `https://proxycheck.io/v2/${encodeURIComponent(ip)}?vpn=1&asn=0${apiKey ? `&key=${encodeURIComponent(apiKey)}` : ''}`;
      const { statusCode, body } = await request(url, {
        method: 'GET',
        headersTimeout: 5000,
        bodyTimeout: 5000,
      });
      if (statusCode < 200 || statusCode >= 300) return null;
      const json: any = await body.json();
      if (json?.status !== 'ok') return null;
      const entry = json[ip];
      const vpn = entry?.proxy === 'yes';
      this.apiCache.set(ip, { vpn, expires: Date.now() + API_CACHE_TTL_MS });
      return vpn;
    } catch (e) {
      this.logger.debug(`Vérification proxycheck.io indisponible pour ${ip} : ${e}`);
      return null;
    }
  }

  /**
   * true si `ip` appartient à une plage identifiée hébergeur/VPN dans la
   * base ASN locale. Charge la base au premier appel (fichier déjà présent
   * sur disque → quasi instantané ; sinon télécharge — voir `ensureLoaded`).
   * Fail-open : une base absente/corrompue => "non VPN", jamais bloquant.
   */
  private async checkAsnRanges(ip: string): Promise<boolean> {
    try {
      await this.ensureLoaded();
    } catch (e) {
      this.logger.warn(`Base ASN indisponible, vérification locale ignorée pour cette requête : ${e}`);
      return false;
    }
    if (!this.ranges.length) return false;
    const target = ipToBigInt(ip);
    if (target == null) return false;

    // Recherche binaire — `ranges` est trié par `start` au chargement.
    let lo = 0;
    let hi = this.ranges.length - 1;
    let candidate: AsnRange | null = null;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (this.ranges[mid].start <= target) {
        candidate = this.ranges[mid];
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    if (!candidate || target > candidate.end) return false;
    return isVpnOrg(candidate.org);
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    if (!this.loadingPromise) this.loadingPromise = this.loadOrDownload();
    await this.loadingPromise;
  }

  /** Rafraîchit la base une fois par mois — DB-IP republie un nouveau fichier chaque mois. */
  @Cron(CronExpression.EVERY_1ST_DAY_OF_MONTH_AT_MIDNIGHT)
  async monthlyRefresh(): Promise<void> {
    try {
      await this.download();
      await this.parseFile();
      this.logger.log(`Base ASN (anti-VPN) rafraîchie : ${this.ranges.length} plages chargées.`);
    } catch (e) {
      this.logger.error(`Échec du rafraîchissement mensuel de la base ASN anti-VPN : ${e}`);
    }
  }

  private async loadOrDownload(): Promise<void> {
    try {
      if (!fs.existsSync(DB_GZ_PATH)) {
        await this.download();
      }
      await this.parseFile();
      this.loaded = true;
      this.logger.log(`Base ASN (anti-VPN) chargée : ${this.ranges.length} plages.`);
    } catch (e) {
      this.loadingPromise = null; // permet de retenter au prochain appel
      throw e;
    }
  }

  /** Essaie le mois courant, puis le mois précédent (DB-IP publie en début de mois). */
  private async download(): Promise<void> {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const now = new Date();
    const candidates = [0, 1, 2].map((back) => {
      const d = new Date(now.getFullYear(), now.getMonth() - back, 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    });
    let lastErr: unknown;
    for (const ym of candidates) {
      const url = `https://download.db-ip.com/free/dbip-asn-lite-${ym}.csv.gz`;
      try {
        const { statusCode, body } = await request(url, { method: 'GET' });
        if (statusCode < 200 || statusCode >= 300) throw new Error(`HTTP ${statusCode}`);
        const tmpPath = `${DB_GZ_PATH}.tmp`;
        const fileStream = fs.createWriteStream(tmpPath);
        await new Promise<void>((resolve, reject) => {
          body.pipe(fileStream);
          fileStream.on('finish', () => resolve());
          fileStream.on('error', reject);
          body.on('error', reject);
        });
        fs.renameSync(tmpPath, DB_GZ_PATH);
        this.logger.log(`Base ASN anti-VPN téléchargée (${ym}).`);
        return;
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr ?? new Error('Téléchargement DB-IP échoué (aucun mois candidat disponible)');
  }

  private async parseFile(): Promise<void> {
    const ranges: AsnRange[] = [];
    const gunzip = zlib.createGunzip();
    const fileStream = fs.createReadStream(DB_GZ_PATH);
    const rl = readline.createInterface({ input: fileStream.pipe(gunzip), crlfDelay: Infinity });
    for await (const line of rl) {
      if (!line.trim()) continue;
      // Format DB-IP ASN Lite : "ip_start","ip_end","asn","as_name"
      // `as_name` peut contenir des virgules (ex. "ACME HOSTING, INC") — on
      // ne split que les 3 premiers champs et on rejoint le reste tel quel
      // plutôt que d'utiliser un vrai parseur CSV (overkill ici : seuls les
      // mots-clés de `as_name` comptent, un découpage imparfait sur une
      // virgule interne ne fait perdre qu'un peu de texte, jamais l'IP).
      const fields = line.split(',').map((f) => f.trim().replace(/^"|"$/g, ''));
      if (fields.length < 4) continue;
      const startIp = fields[0];
      const endIp = fields[1];
      const org = fields.slice(3).join(', ');
      const start = ipToBigInt(startIp);
      const end = ipToBigInt(endIp);
      if (start == null || end == null || !org) continue;
      ranges.push({ start, end, org });
    }
    ranges.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
    this.ranges = ranges;
  }
}
