import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { SettingsService } from '../../config/settings.service';
import { CountryMapper, GeoResolver } from './geo/geo.service';
import { BaseProxyProvider } from './providers/base.provider';
import { GroqAIProvider } from './providers/groq-ai.provider';
import { DynamicProvider } from './providers/dynamic.provider';
import { ProxyItem, urlOf } from './proxy-item';

/**
 * Orchestrateur de scraping. Par défaut, AUCUN provider codé en dur sauf l'IA
 * (Groq, si une clé est configurée). Toutes les autres sources sont définies
 * dans la table `ScraperSource` (URL + regex), éditables depuis le panel admin.
 * Tourne toutes les `scrapeInterval` secondes, dédoublonne par URL, normalise
 * les pays et bulk-upsert en base.
 */
@Injectable()
export class ScraperService implements OnModuleInit {
  private readonly logger = new Logger(ScraperService.name);
  // Intervalles lus dynamiquement depuis la config DB (fallback env).
  private get scrapeIntervalSec(): number {
    return this.settings.getPositiveNumber('scrapeInterval');
  }
  private get geoIntervalSec(): number {
    return this.settings.getPositiveNumber('geoResolveInterval');
  }
  private running = false;
  // Tor SOCKS ports — these "proxies" exit through a random Tor node, so their
  // country is unpredictable and breaks country filtering. Skip them entirely.
  private readonly torPorts = new Set([9050, 9150]);

  constructor(
    private readonly prisma: PrismaService,
    private readonly geo: GeoResolver,
    private readonly settings: SettingsService,
  ) {}

  /**
   * Construit la liste des providers pour un cycle : provider IA (si clé Groq)
   * + un DynamicProvider par source `ScraperSource` activée. Applique le proxy
   * de sortie configuré (fallback résidentiel).
   */
  onModuleInit(): void {
    // Fire & forget background loops — mirrors `asyncio.create_task(...)`
    setTimeout(() => this.startScrapeLoop(), 30_000);
    setTimeout(() => this.startGeoLoop(), 60_000);
  }

  // -------------------- Scrape cycle --------------------

  // Nombre d'échecs consécutifs avant auto-désactivation.
  // Valeur volontairement haute : l'adaptive scaling peut déclencher plusieurs cycles/minute.
  private readonly FAIL_THRESHOLD = 10;
  // Certaines listes publiques "gratuites" renvoient des volumes aberrants
  // (vu : ~1 million d'entrées d'une seule source). Sans plafond, le dédoublonnage
  // synchrone ci-dessous peut bloquer l'event loop pendant plusieurs minutes —
  // y compris le serveur proxy live, qui tourne dans le même process Node.
  private readonly MAX_ITEMS_PER_SOURCE = 50_000;

  async runOnce(): Promise<void> {
    if (this.running) {
      this.logger.warn('Scrape already running; skipping.');
      return;
    }
    this.running = true;
    try {
      this.logger.log('Starting proxy scraping cycle...');

      const groqKey = this.settings.get('groqApiKey');
      const scraperProxy = this.settings.get('scraperProxy');

      let sources: { id: string; name: string; url: string; protocol: string; pattern: string | null; pool: string | null; failCount: number }[] = [];
      try {
        sources = await this.prisma.scraperSource.findMany({ where: { enabled: true } });
      } catch (e) {
        this.logger.warn(`Impossible de charger les sources de scraping: ${e}`);
      }

      if (!groqKey && sources.length === 0) {
        this.logger.warn('Aucune source de scraping configurée (ajoutez-en dans le panel).');
        return;
      }

      const allProxies: ProxyItem[] = [];

      // ── GroqAI provider ────────────────────────────────────────────────────
      if (groqKey) {
        const groq = new GroqAIProvider(groqKey);
        if (scraperProxy) groq.proxy = scraperProxy;
        try {
          const items = await groq.fetch();
          this.logger.log(`[GroqAI] → ${items.length} proxies`);
          allProxies.push(...items);
        } catch (e) {
          this.logger.warn(`[GroqAI] ERREUR: ${e}`);
        }
      }

      // ── Dynamic sources (parallel, per-source tracking) ───────────────────
      await Promise.all(sources.map(async (s) => {
        const provider = new DynamicProvider(s.name, s.url, s.protocol, s.pattern, s.pool);
        if (scraperProxy) provider.proxy = scraperProxy;

        let items: ProxyItem[] = [];
        let fetchError: string | null = null;
        try {
          items = await provider.fetch();
        } catch (e) {
          fetchError = String((e as Error).message ?? e).slice(0, 500);
        }

        if (items.length > 0) {
          if (items.length > this.MAX_ITEMS_PER_SOURCE) {
            this.logger.warn(
              `[${s.name}] ${items.length} proxies → tronqué à ${this.MAX_ITEMS_PER_SOURCE} (source suspecte ? liste anormalement énorme)`,
            );
            items = items.slice(0, this.MAX_ITEMS_PER_SOURCE);
          }
          this.logger.log(`[${s.name}] → ${items.length} proxies`);
          allProxies.push(...items);
          await this.prisma.scraperSource.update({
            where: { id: s.id },
            data: { failCount: 0, lastError: null, lastSuccess: new Date() },
          }).catch(() => undefined);
        } else {
          const msg = fetchError ?? '0 proxies trouvés';
          const newFail = (s.failCount ?? 0) + 1;
          this.logger.warn(`[${s.name}] ÉCHEC: ${msg.slice(0, 120)} (${newFail}/${this.FAIL_THRESHOLD})`);
          const updates: Record<string, unknown> = { failCount: newFail, lastError: msg };
          if (newFail >= this.FAIL_THRESHOLD) {
            updates.enabled = false;
            this.logger.warn(`[${s.name}] Désactivée automatiquement (${this.FAIL_THRESHOLD} échecs consécutifs)`);
          }
          await this.prisma.scraperSource.update({ where: { id: s.id }, data: updates }).catch(() => undefined);
        }
      }));

      // ── Dedup & upsert ─────────────────────────────────────────────────────
      // Boucle volontairement non-bloquante : avec ~150 sources, un cumul de
      // plusieurs millions d'items est possible même avec le plafond par source.
      // On rend la main à l'event loop périodiquement pour ne jamais geler le
      // process (et donc le serveur proxy live, qui tourne dans le même process).
      const dedup = new Map<string, ProxyItem>();
      let torSkipped = 0;
      let urlSkipped = 0;
      const YIELD_EVERY = 50_000;
      for (let i = 0; i < allProxies.length; i++) {
        const p = allProxies[i];
        if (this.torPorts.has(Number(p.port))) { torSkipped++; continue; }
        const url = urlOf(p);
        // Protège l'index btree PostgreSQL (max ~2700 octets) contre les auth trop longs
        if (url.length > 500) { urlSkipped++; continue; }
        if (!dedup.has(url)) dedup.set(url, p);
        if (i > 0 && i % YIELD_EVERY === 0) await new Promise((r) => setImmediate(r));
      }
      if (torSkipped > 0) this.logger.log(`Skipped ${torSkipped} Tor-port proxies`);
      if (urlSkipped > 0) this.logger.warn(`Skipped ${urlSkipped} proxies with oversized URL (auth trop long — données corrompues ?)`);

      const merged = [...dedup.values()];
      for (const p of merged) {
        if (p.country) p.country = CountryMapper.toCode(p.country);
      }
      const dupes = allProxies.length - torSkipped - merged.length;
      this.logger.log(`Collecté ${merged.length} proxies uniques${dupes > 0 ? ` (${dupes} doublons ignorés)` : ''}`);

      await this.bulkUpsert(merged);
      this.backgroundGeo().catch((e) => this.logger.error(`Background geo failed: ${e}`));
    } finally {
      this.running = false;
    }
  }

  private async bulkUpsert(items: ProxyItem[]): Promise<void> {
    if (items.length === 0) return;
    const skipDead = this.settings.getBool('skipDeadProxies');
    const maxRetries = this.settings.getNumber('deadProxyMaxRetries');
    const deadSkipClause = skipDead
      ? `WHEN "BackendProxy"."isWorking" = FALSE AND "BackendProxy"."failCount" >= ${maxRetries} THEN FALSE`
      : '';
    const CHUNK = 1000;
    for (let i = 0; i < items.length; i += CHUNK) {
      const slice = items.slice(i, i + CHUNK);
      try {
        await this.prisma.withRetry(async () => {
          const values: string[] = [];
          const params: any[] = [];
          for (const p of slice) {
            const id = randomUUID();
            const base = params.length;
            params.push(
              id,
              urlOf(p),
              p.protocol,
              p.ip,
              p.port,
              p.country || 'Unknown',
              p.provider || 'Scraper',
              true,
              0,
              p.pool ?? null,
            );
            const ph = Array.from({ length: 10 }, (_, k) => `$${base + k + 1}`);
            values.push(
              `(${ph[0]}, ${ph[1]}, ${ph[2]}, ${ph[3]}, ${ph[4]}, ${ph[5]}, ${ph[6]}, ${ph[7]}, CURRENT_TIMESTAMP, ${ph[8]}, ${ph[9]})`,
            );
          }
          const sql = `
            INSERT INTO "BackendProxy" (id, url, protocol, ip, port, country, provider, "isWorking", "lastChecked", "failCount", pool)
            VALUES ${values.join(', ')}
            ON CONFLICT (url) DO UPDATE SET
              "lastChecked" = "BackendProxy"."lastChecked",
              "isWorking"   = CASE WHEN "BackendProxy"."isBlacklisted" = TRUE THEN FALSE
                                   ${deadSkipClause}
                                   ELSE EXCLUDED."isWorking" END,
              "country"     = COALESCE(NULLIF(EXCLUDED."country", 'Unknown'), "BackendProxy"."country"),
              pool          = EXCLUDED.pool
          `;
          await this.prisma.$executeRawUnsafe(sql, ...params);
        });
        await new Promise((r) => setTimeout(r, 200));
      } catch (e) {
        this.logger.error(`Bulk upsert chunk failed: ${e}`);
      }
    }
  }

  private async backgroundGeo(): Promise<void> {
    const missing = await this.prisma.backendProxy.findMany({
      where: { country: 'Unknown' },
      take: 50_000,
    });
    if (missing.length === 0) return;
    this.logger.log(`Background geo: resolving ${missing.length} IPs`);
    const map = await this.geo.resolveBatch(missing.map((p) => p.ip));
    const groups: Record<string, string[]> = {};
    for (const [ip, cc] of Object.entries(map)) {
      if (!groups[cc]) groups[cc] = [];
      groups[cc].push(ip);
    }
    for (const [cc, ips] of Object.entries(groups)) {
      const CHUNK = 500;
      for (let i = 0; i < ips.length; i += CHUNK) {
        await this.prisma.backendProxy.updateMany({
          where: { ip: { in: ips.slice(i, i + CHUNK) }, country: 'Unknown' },
          data: { country: cc },
        });
        await new Promise((r) => setTimeout(r, 100));
      }
    }
  }

  // -------------------- Loops --------------------

  private async startScrapeLoop(): Promise<void> {
    while (true) {
      try {
        await this.runOnce();
        // Adaptive scaling: every minute, check if working pool < seuil configuré -> rescrape
        let accumulated = 0;
        while (accumulated < this.scrapeIntervalSec) {
          await new Promise((r) => setTimeout(r, 60_000));
          accumulated += 60;
          const minPoolSize = this.settings.getPositiveNumber('scraperMinPoolSize');
          const working = await this.prisma.backendProxy.count({ where: { isWorking: true } });
          if (working < minPoolSize) {
            this.logger.warn(`Adaptive scaling: pool=${working}<${minPoolSize}, triggering early rescrape`);
            await this.runOnce();
            accumulated = 0;
          }
        }
      } catch (e) {
        this.logger.error(`Scraper loop error: ${e}`);
        await new Promise((r) => setTimeout(r, 60_000));
      }
    }
  }

  private async startGeoLoop(): Promise<void> {
    while (true) {
      try {
        await this.backgroundGeo();
      } catch (e) {
        this.logger.error(`Geo loop error: ${e}`);
      }
      await new Promise((r) => setTimeout(r, this.geoIntervalSec * 1000));
    }
  }
}
