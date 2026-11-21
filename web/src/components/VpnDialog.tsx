import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Globe2, Loader2, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import { api, apiError } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { toast } from '@/lib/toast';
import { Badge, Button, Input, Label } from '@/components/ui';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/dialog';
import { CountryFlag } from '@/components/CountryFlag';
import { cn } from '@/lib/utils';

interface Status {
  capabilities: {
    openvpn: boolean;
    singbox: boolean;
    maxTunnels: number;
    details: { openvpnBinary: boolean; tunDevice: boolean; netAdmin: boolean; singboxBinary: boolean };
  };
  tunnels: { id: string; kind: string; state: string; error?: string; exitIp?: string; latencyMs?: number }[];
  sources: { id: string; provider?: 'vpngate' | 'url'; url?: string; max?: number; countries: string[]; perCountry: number; pool: string; enabled: boolean }[];
}
interface Country {
  code: string;
  name: string;
  servers: number;
}
interface Server {
  ip: string;
  country: string;
  countryCode: string;
  score: number;
  pingMs: number;
  speedMbps: number;
  sessions: number;
}

const L = {
  fr: {
    button: 'Ajouter des VPN',
    title: 'VPN dans les catégories de proxies',
    intro: 'Chaque VPN devient un proxy de la catégorie choisie (une IP de sortie fixe par VPN). OpenVPN, WireGuard et V2Ray (VLESS, VMess, Trojan, Shadowsocks, Hysteria2) sont pris en charge.',
    tabGate: 'VPNGate (automatique)',
    tabManual: 'Import manuel',
    tabUrl: 'URL / abonnement',
    urlHelp: 'Adresse (https) d’une page, d’un fichier texte ou d’un abonnement qui publie des configurations en clair : liens vless:// vmess:// trojan:// ss:// hy2://, liste encodée en base64, ou une configuration WireGuard / OpenVPN. Les pages protégées par un contrôle anti-robot ou qui créent un compte par visiteur ne peuvent pas être lues automatiquement : utilisez l’import manuel.',
    urlMax: 'Nombre maximum de VPN',
    urlFound: '{n} configuration(s) trouvée(s)',
    urlNone: 'Aucune configuration reconnue à cette adresse.',
    tabState: 'Sources & état',
    openvpnOff: 'OpenVPN indisponible dans ce conteneur',
    openvpnOffHint: 'Ajoutez NET_ADMIN et le périphérique /dev/net/tun à ce service (docker-compose.yml du dépôt, déjà inclus), puis redéployez. WireGuard et V2Ray fonctionnent sans.',
    missing: { openvpnBinary: 'binaire openvpn', tunDevice: '/dev/net/tun', netAdmin: 'capacité NET_ADMIN' },
    pickCountries: 'Pays (aucun = tous)',
    search: 'Rechercher un pays…',
    servers: 'serveurs',
    perCountry: 'Serveurs par pays',
    pool: 'Catégorie (pool)',
    noPool: 'Pool par défaut',
    keep: 'Garder à jour automatiquement (remplace les serveurs morts)',
    expires: 'Expire après (jours, 0 = jamais)',
    expiresHint: 'Retiré automatiquement du pool N jours après l’import — pour une source mise à jour automatiquement, N jours après la dernière publication par la source.',
    maxTunnels: 'Tunnels simultanés maximum',
    maxTunnelsHint: 'Chaque VPN actif est un processus (10 à 30 Mo). Plafond : 100. Les VPN au-delà de cette limite restent dans le pool mais ne démarrent pas (les plus fiables sont démarrés en premier).',
    saved: 'Enregistré.',
    preview: 'Aperçu',
    import: 'Importer',
    imported: '{n} VPN ajouté(s).',
    manualHelp: 'Collez un fichier OpenVPN (.ovpn), une configuration WireGuard (.conf) ou une liste de liens vless:// vmess:// trojan:// ss:// hy2:// (un par ligne).',
    country: 'Pays (code à 2 lettres, facultatif — détecté sinon)',
    sources: 'Sources automatiques',
    noSources: 'Aucune source automatique.',
    sync: 'Synchroniser maintenant',
    synced: '+{a} ajouté(s), -{r} retiré(s).',
    tunnels: 'Tunnels',
    state: { up: 'actif', starting: 'démarrage', down: 'arrêté', error: 'erreur' },
    warn: 'Les VPN gratuits sont publics, instables et souvent bloqués par les sites : adaptés au test ou aux usages non critiques.',
    loading: 'Chargement…',
    score: 'Score',
    ping: 'Ping',
    speed: 'Débit',
  },
  en: {
    button: 'Add VPNs',
    title: 'VPNs in proxy categories',
    intro: 'Each VPN becomes a proxy of the chosen category (one fixed exit IP per VPN). OpenVPN, WireGuard and V2Ray (VLESS, VMess, Trojan, Shadowsocks, Hysteria2) are supported.',
    tabGate: 'VPNGate (automatic)',
    tabManual: 'Manual import',
    tabUrl: 'URL / subscription',
    urlHelp: 'Address (https) of a page, text file or subscription that publishes plain configurations: vless:// vmess:// trojan:// ss:// hy2:// links, a base64 list, or a WireGuard / OpenVPN configuration. Pages behind bot protection or that create one account per visitor cannot be read automatically: use manual import.',
    urlMax: 'Maximum number of VPNs',
    urlFound: '{n} configuration(s) found',
    urlNone: 'No configuration recognised at this address.',
    tabState: 'Sources & status',
    openvpnOff: 'OpenVPN is unavailable in this container',
    openvpnOffHint: 'Add NET_ADMIN and the /dev/net/tun device to this service (the repository docker-compose.yml already does), then redeploy. WireGuard and V2Ray work without it.',
    missing: { openvpnBinary: 'openvpn binary', tunDevice: '/dev/net/tun', netAdmin: 'NET_ADMIN capability' },
    pickCountries: 'Countries (none = all)',
    search: 'Search a country…',
    servers: 'servers',
    perCountry: 'Servers per country',
    pool: 'Category (pool)',
    noPool: 'Default pool',
    keep: 'Keep updated automatically (replaces dead servers)',
    expires: 'Expires after (days, 0 = never)',
    expiresHint: 'Automatically removed from the pool N days after import — for an auto-updated source, N days after the source last published it.',
    maxTunnels: 'Maximum simultaneous tunnels',
    maxTunnelsHint: 'Each active VPN is a process (10-30 MB). Cap: 100. VPNs beyond the limit stay in the pool but do not start (the most reliable start first).',
    saved: 'Saved.',
    preview: 'Preview',
    import: 'Import',
    imported: '{n} VPN(s) added.',
    manualHelp: 'Paste an OpenVPN file (.ovpn), a WireGuard configuration (.conf) or a list of vless:// vmess:// trojan:// ss:// hy2:// links (one per line).',
    country: 'Country (2-letter code, optional — detected otherwise)',
    sources: 'Automatic sources',
    noSources: 'No automatic source.',
    sync: 'Synchronise now',
    synced: '+{a} added, -{r} removed.',
    tunnels: 'Tunnels',
    state: { up: 'up', starting: 'starting', down: 'stopped', error: 'error' },
    warn: 'Free VPNs are public, unstable and often blocked by websites: fine for testing or non-critical use.',
    loading: 'Loading…',
    score: 'Score',
    ping: 'Ping',
    speed: 'Speed',
  },
} as const;

export function VpnDialog({ onDone }: { onDone: () => void }) {
  const { lang } = useI18n();
  const l: 'fr' | 'en' = lang === 'fr' ? 'fr' : 'en';
  const T = L[l];
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'gate' | 'manual' | 'url' | 'state'>('gate');

  const { data: status, refetch: refetchStatus } = useQuery({
    queryKey: ['vpn-status'],
    queryFn: async () => (await api.get('/vpn/status')).data as Status,
    enabled: open,
    refetchInterval: open ? 10_000 : false,
  });
  const { data: pools } = useQuery({
    queryKey: ['proxy-pools'],
    queryFn: async () => (await api.get('/proxy-pools')).data.data as { id: string; name: string }[],
    enabled: open,
  });

  const caps = status?.capabilities;
  const missing = caps ? (Object.entries(caps.details) as [string, boolean][]).filter(([k, v]) => !v && k in T.missing).map(([k]) => T.missing[k as keyof typeof T.missing]) : [];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="h-9 gap-1.5">
          <ShieldCheck className="h-4 w-4" /> {T.button}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{T.title}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{T.intro}</p>

        {caps && !caps.openvpn && (
          <div className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <div>
              <p className="font-medium">{T.openvpnOff}{missing.length ? ` (${missing.join(', ')})` : ''}</p>
              <p className="text-muted-foreground">{T.openvpnOffHint}</p>
            </div>
          </div>
        )}
        <p className="text-xs text-muted-foreground">{T.warn}</p>

        <div className="inline-flex rounded-lg border p-1">
          {([['gate', T.tabGate], ['url', T.tabUrl], ['manual', T.tabManual], ['state', T.tabState]] as const).map(([k, label]) => (
            <button key={k} type="button" onClick={() => setTab(k)} className={cn('rounded-md px-3 py-1.5 text-sm font-medium transition', tab === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>
              {label}
            </button>
          ))}
        </div>

        {tab === 'gate' && <GateTab T={T} pools={pools ?? []} onDone={() => { onDone(); void refetchStatus(); qc.invalidateQueries({ queryKey: ['vpn-status'] }); }} />}
        {tab === 'url' && <UrlTab T={T} pools={pools ?? []} onDone={() => { onDone(); void refetchStatus(); }} />}
        {tab === 'manual' && <ManualTab T={T} pools={pools ?? []} onDone={() => { onDone(); void refetchStatus(); }} />}
        {tab === 'state' && <StateTab T={T} status={status} onChanged={() => void refetchStatus()} />}
      </DialogContent>
    </Dialog>
  );
}

type Dict = (typeof L)['fr'] | (typeof L)['en'];
const ExpiresField = ({ T, value, onChange }: { T: Dict; value: number; onChange: (v: number) => void }) => (
  <div className="space-y-1.5">
    <Label>{T.expires}</Label>
    <Input type="number" min={0} max={3650} value={value} onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))} />
    <p className="text-[11px] text-muted-foreground">{T.expiresHint}</p>
  </div>
);
const PoolSelect = ({ T, pools, value, onChange }: { T: Dict; pools: { id: string; name: string }[]; value: string; onChange: (v: string) => void }) => (
  <div className="space-y-1.5">
    <Label>{T.pool}</Label>
    <select value={value} onChange={(e) => onChange(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
      <option value="">{T.noPool}</option>
      {pools.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
    </select>
  </div>
);

function GateTab({ T, pools, onDone }: { T: Dict; pools: { id: string; name: string }[]; onDone: () => void }) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const [perCountry, setPerCountry] = useState(3);
  const [pool, setPool] = useState('');
  const [keep, setKeep] = useState(false);
  const [expiresDays, setExpiresDays] = useState(0);
  const [busy, setBusy] = useState(false);
  const [servers, setServers] = useState<Server[] | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['vpngate-countries'],
    queryFn: async () => (await api.get('/vpn/vpngate/countries')).data as { total: number; countries: Country[] },
    staleTime: 5 * 60_000,
    retry: false,
  });
  const list = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (data?.countries ?? []).filter((c) => !n || c.name.toLowerCase().includes(n) || c.code.toLowerCase() === n);
  }, [data, q]);

  const toggle = (code: string) => {
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(code)) n.delete(code);
      else n.add(code);
      return n;
    });
    setServers(null);
  };
  const body = { countries: [...picked], perCountry, pool: pool || undefined, keepUpdated: keep, expiresDays };

  const preview = async () => {
    setBusy(true);
    try {
      setServers(((await api.post('/vpn/vpngate/preview', body)).data.servers as Server[]) ?? []);
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setBusy(false);
    }
  };
  const doImport = async () => {
    setBusy(true);
    try {
      const { data: r } = await api.post('/vpn/vpngate/import', body);
      toast.success(T.imported.replace('{n}', String(r.imported)));
      onDone();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>{T.pickCountries} {picked.size > 0 && <Badge variant="secondary">{picked.size}</Badge>}</Label>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={T.search} />
        {isLoading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{T.loading}</p>
        ) : error ? (
          <p className="text-sm text-destructive">{apiError(error)}</p>
        ) : (
          <div className="grid max-h-56 grid-cols-2 gap-1.5 overflow-y-auto rounded-md border p-2 sm:grid-cols-3">
            {list.map((c) => (
              <button key={c.code} type="button" onClick={() => toggle(c.code)} className={cn('flex items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs transition', picked.has(c.code) ? 'border-primary bg-primary/10' : 'hover:bg-accent')}>
                <CountryFlag code={c.code} />
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                <span className="text-muted-foreground">{c.servers}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>{T.perCountry}</Label>
          <Input type="number" min={1} max={20} value={perCountry} onChange={(e) => { setPerCountry(Number(e.target.value) || 1); setServers(null); }} />
        </div>
        <PoolSelect T={T} pools={pools} value={pool} onChange={setPool} />
      </div>
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} /> {T.keep}
      </label>
      <ExpiresField T={T} value={expiresDays} onChange={setExpiresDays} />
      {servers && (
        <div className="max-h-44 overflow-auto rounded-md border text-xs">
          <table className="w-full">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr><th className="p-1.5 text-left">IP</th><th className="p-1.5 text-left"><Globe2 className="inline h-3 w-3" /></th><th className="p-1.5">{T.score}</th><th className="p-1.5">{T.ping}</th><th className="p-1.5">{T.speed}</th></tr>
            </thead>
            <tbody>
              {servers.map((s) => (
                <tr key={s.ip} className="border-t">
                  <td className="p-1.5 font-mono">{s.ip}</td>
                  <td className="p-1.5">{s.countryCode}</td>
                  <td className="p-1.5 text-center">{s.score.toLocaleString()}</td>
                  <td className="p-1.5 text-center">{s.pingMs} ms</td>
                  <td className="p-1.5 text-center">{s.speedMbps} Mb/s</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" disabled={busy} onClick={preview}>{T.preview}</Button>
        <Button type="button" disabled={busy} onClick={doImport}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : T.import}</Button>
      </div>
    </div>
  );
}

function UrlTab({ T, pools, onDone }: { T: Dict; pools: { id: string; name: string }[]; onDone: () => void }) {
  const [url, setUrl] = useState('');
  const [pool, setPool] = useState('');
  const [max, setMax] = useState(20);
  const [keep, setKeep] = useState(true);
  const [expiresDays, setExpiresDays] = useState(0);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState('');
  const preview = async () => {
    setBusy(true);
    setInfo('');
    try {
      const { data: r } = await api.post('/vpn/url/preview', { url });
      setInfo(r.total ? `${T.urlFound.replace('{n}', String(r.total))} — ${Object.entries(r.byKind as Record<string, number>).map(([k, n]) => `${k}: ${n}`).join(', ')}` : T.urlNone);
    } catch (e) {
      setInfo(apiError(e));
    } finally {
      setBusy(false);
    }
  };
  const doImport = async () => {
    setBusy(true);
    try {
      const { data: r } = await api.post('/vpn/url/import', { url, pool: pool || undefined, max, keepUpdated: keep, expiresDays });
      toast.success(T.imported.replace('{n}', String(r.imported)));
      onDone();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{T.urlHelp}</p>
      <Input value={url} onChange={(e) => { setUrl(e.target.value); setInfo(''); }} placeholder="https://…" className="font-mono text-xs" />
      <div className="grid gap-3 sm:grid-cols-2">
        <PoolSelect T={T} pools={pools} value={pool} onChange={setPool} />
        <div className="space-y-1.5">
          <Label>{T.urlMax}</Label>
          <Input type="number" min={1} max={200} value={max} onChange={(e) => setMax(Number(e.target.value) || 1)} />
        </div>
      </div>
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} /> {T.keep}
      </label>
      <ExpiresField T={T} value={expiresDays} onChange={setExpiresDays} />
      {info && <p className="rounded-md border bg-muted/30 p-2 text-xs">{info}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" disabled={busy || !url.trim()} onClick={preview}>{T.preview}</Button>
        <Button type="button" disabled={busy || !url.trim()} onClick={doImport}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : T.import}</Button>
      </div>
    </div>
  );
}

function ManualTab({ T, pools, onDone }: { T: Dict; pools: { id: string; name: string }[]; onDone: () => void }) {
  const [text, setText] = useState('');
  const [pool, setPool] = useState('');
  const [country, setCountry] = useState('');
  const [expiresDays, setExpiresDays] = useState(0);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      const { data: r } = await api.post('/vpn/import', { text, pool: pool || undefined, country: country || undefined, expiresDays });
      toast.success(T.imported.replace('{n}', String(r.imported)));
      setText('');
      onDone();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{T.manualHelp}</p>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} spellCheck={false} className="w-full rounded-md border border-input bg-background p-2 font-mono text-xs" placeholder="vless://…&#10;vmess://…&#10;[Interface]&#10;PrivateKey = …" />
      <div className="grid gap-3 sm:grid-cols-2">
        <PoolSelect T={T} pools={pools} value={pool} onChange={setPool} />
        <div className="space-y-1.5">
          <Label>{T.country}</Label>
          <Input value={country} maxLength={2} onChange={(e) => setCountry(e.target.value.toUpperCase())} placeholder="FR" />
        </div>
      </div>
      <ExpiresField T={T} value={expiresDays} onChange={setExpiresDays} />
      <div className="flex justify-end">
        <Button type="button" disabled={busy || !text.trim()} onClick={submit}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : T.import}</Button>
      </div>
    </div>
  );
}

function StateTab({ T, status, onChanged }: { T: Dict; status?: Status; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const save = async (sources: Status['sources']) => {
    try {
      await api.put('/vpn/sources', { sources });
      onChanged();
    } catch (e) {
      toast.error(apiError(e));
    }
  };
  const sync = async () => {
    setBusy(true);
    try {
      const { data: r } = await api.post('/vpn/sources/sync');
      toast.success(T.synced.replace('{a}', String(r.added)).replace('{r}', String(r.removed)));
      onChanged();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setBusy(false);
    }
  };
  const tunnels = status?.tunnels ?? [];
  const [maxT, setMaxT] = useState<number | null>(null);
  const shownMax = maxT ?? status?.capabilities.maxTunnels ?? 15;
  const saveMax = async () => {
    try {
      await api.put('/vpn/settings', { maxTunnels: shownMax });
      toast.success(T.saved);
      onChanged();
    } catch (e) {
      toast.error(apiError(e));
    }
  };
  return (
    <div className="space-y-4">
      <div className="rounded-md border p-3">
        <Label>{T.maxTunnels}</Label>
        <div className="mt-1.5 flex items-center gap-2">
          <Input type="number" min={1} max={100} value={shownMax} onChange={(e) => setMaxT(Number(e.target.value) || 1)} className="w-24" />
          <Button type="button" size="sm" variant="outline" onClick={saveMax}>OK</Button>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">{T.maxTunnelsHint}</p>
      </div>
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <p className="text-sm font-medium">{T.sources}</p>
          <Button type="button" size="sm" variant="outline" disabled={busy || !(status?.sources.length)} onClick={sync}>
            <RefreshCw className={cn('mr-1.5 h-3.5 w-3.5', busy && 'animate-spin')} /> {T.sync}
          </Button>
        </div>
        {!status?.sources.length ? (
          <p className="text-sm text-muted-foreground">{T.noSources}</p>
        ) : (
          <ul className="space-y-1.5">
            {status.sources.map((s) => (
              <li key={s.id} className="flex items-center gap-2 rounded-md border p-2 text-xs">
                <input type="checkbox" checked={s.enabled} onChange={(e) => save(status.sources.map((x) => (x.id === s.id ? { ...x, enabled: e.target.checked } : x)))} />
                <span className="min-w-0 flex-1">
                  {s.provider === 'url' ? (
                    <><b>URL</b> · <span className="font-mono">{(s.url ?? '').replace(/^https:\/\//, '').slice(0, 48)}</span> · max {s.max ?? 20} · {s.pool || T.noPool}</>
                  ) : (
                    <><b>VPNGate</b> · {s.countries.length ? s.countries.join(', ') : '*'} · {s.perCountry}/{T.perCountry.toLowerCase()} · {s.pool || T.noPool}</>
                  )}
                </span>
                <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => save(status.sources.filter((x) => x.id !== s.id))} aria-label="delete"><Trash2 className="h-3.5 w-3.5" /></button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <p className="mb-1.5 text-sm font-medium">{T.tunnels} ({tunnels.filter((t) => t.state === 'up').length}/{tunnels.length} · max {status?.capabilities.maxTunnels})</p>
        <ul className="max-h-48 space-y-1 overflow-y-auto">
          {tunnels.map((t) => (
            <li key={t.id} className="flex items-center gap-2 rounded border px-2 py-1 text-xs">
              {t.state === 'up' ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : t.state === 'starting' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
              <Badge variant="secondary">{t.kind}</Badge>
              <span className="font-mono">{t.exitIp ?? t.id.slice(0, 8)}</span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{t.state === 'up' ? `${t.latencyMs} ms` : t.error ?? T.state[t.state as keyof typeof T.state]}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
