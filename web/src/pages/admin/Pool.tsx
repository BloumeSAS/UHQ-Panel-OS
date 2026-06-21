import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Upload,
  Trash2,
  Search,
  Activity,
  Database,
  Network,
  Copy,
  Check,
  RefreshCw,
  RotateCcw,
  AlertTriangle,
  Ban,
  Download,
  ChevronLeft,
  ChevronRight,
  Gauge,
} from 'lucide-react';
import { api, apiError } from '@/lib/api';
import { useT } from '@/lib/i18n';
import {
  Badge,
  Button,
  Card,
  CardContent,
  Input,
  Label,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '@/components/ui';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/dialog';

interface Proxy {
  id: string;
  ip: string;
  port: number;
  protocol: string;
  country: string | null;
  provider: string | null;
  is_working: boolean;
  is_blacklisted: boolean;
  fail_count: number;
  latency: number | null;
  url?: string;
  pool?: string | null;
}

type StatusFilter = 'all' | 'working' | 'dead' | 'permanent';

export default function Pool() {
  const t = useT();
  const qc = useQueryClient();
  const [country, setCountry] = useState('');
  const [protocol, setProtocol] = useState('');
  const [poolFilter, setPoolFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [cleaning, setCleaning] = useState(false);
  const [revivedAll, setRevivedAll] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { data: settings } = useQuery({
    queryKey: ['settings-dead'],
    queryFn: async () => (await api.get('/settings')).data.data as Record<string, any>,
  });
  const { data: pools } = useQuery({
    queryKey: ['proxy-pools'],
    queryFn: async () => (await api.get('/proxy-pools')).data.data as { id: string; name: string; color: string | null }[],
  });
  const maxRetries = parseInt(settings?.deadProxyMaxRetries ?? '3', 10) || 3;
  const skipDead = settings?.skipDeadProxies === true || settings?.skipDeadProxies === 'true';

  const PAGE_SIZE = 100;
  const [page, setPage] = useState(0);

  // Réinitialise la page quand un filtre change
  useEffect(() => { setPage(0); }, [country, protocol, poolFilter, statusFilter]);

  const workingParam =
    statusFilter === 'working' ? 'true' :
    statusFilter === 'dead' || statusFilter === 'permanent' ? 'false' : '';

  const key = ['pool-proxies', country, protocol, poolFilter, workingParam, page];
  const { data: proxyResponse, isFetching } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), page: String(page) });
      if (country) params.set('country', country);
      if (protocol) params.set('protocol', protocol);
      if (poolFilter) params.set('pool', poolFilter);
      if (workingParam) params.set('working', workingParam);
      const res = await api.get(`/monitoring/proxies?${params}`);
      return res.data as { status: string; total: number; pages: number; page: number; count: number; data: Proxy[] };
    },
    refetchInterval: 30000,
  });

  const data = proxyResponse?.data;
  const totalCount = proxyResponse?.total ?? 0;
  const totalPages = proxyResponse?.pages ?? 1;

  const { data: liveRaw, isFetching: isFetchingLive } = useQuery({
    queryKey: ['monitoring-live-pool'],
    queryFn: async () => (await api.get('/monitoring/live')).data.live as any,
    refetchInterval: 10000,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['pool-proxies'] });
    qc.invalidateQueries({ queryKey: ['monitoring-live-pool'] });
  };

  const del = async (id: string) => {
    await api.delete(`/monitoring/proxies/${id}`);
    invalidate();
  };

  const revive = async (id: string) => {
    await api.patch(`/monitoring/proxies/${id}/revive`);
    invalidate();
  };

  const blacklist = async (id: string, value: boolean) => {
    await api.patch(`/monitoring/proxies/${id}/blacklist`, { blacklisted: value });
    invalidate();
  };

  const [testingIds, setTestingIds] = useState<Set<string>>(new Set());
  const testProxy = async (id: string) => {
    setTestingIds((s) => new Set(s).add(id));
    try {
      await api.post(`/checker/proxies/${id}/check`);
      invalidate();
    } catch (err) {
      alert(apiError(err));
    } finally {
      setTestingIds((s) => {
        const next = new Set(s);
        next.delete(id);
        return next;
      });
    }
  };

  const [exporting, setExporting] = useState(false);
  const exportProxies = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams({ format: 'standard' });
      if (country) params.set('country', country);
      if (protocol) params.set('protocol', protocol);
      if (statusFilter === 'working') params.set('working', 'true');
      else if (statusFilter === 'dead' || statusFilter === 'permanent') params.set('working', 'false');
      const { data: res } = await api.get(`/monitoring/proxies/export?${params}`);
      const blob = new Blob([res.text ?? ''], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'proxies.txt';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(apiError(err));
    } finally {
      setExporting(false);
    }
  };

  const clearDead = async () => {
    if (!window.confirm(t('pool.clearDeadConfirm') || 'Voulez-vous supprimer tous les proxies non fonctionnels (KO) ?')) return;
    setCleaning(true);
    try {
      await api.delete('/monitoring/proxies?working=false');
      invalidate();
    } catch (err) {
      alert(apiError(err));
    } finally {
      setCleaning(false);
    }
  };

  const reviveAllDead = async () => {
    if (!window.confirm(t('pool.reviveDeadConfirm') || 'Réinitialiser tous les proxies morts (failCount → 0, isWorking → true) ?')) return;
    setRevivedAll(true);
    try {
      await api.post('/monitoring/proxies/revive-dead');
      invalidate();
    } catch (err) {
      alert(apiError(err));
    } finally {
      setRevivedAll(false);
    }
  };

  const getCredentials = (proxyUrl?: string) => {
    if (!proxyUrl) return '';
    try {
      const u = new URL(proxyUrl);
      return u.username ? `${decodeURIComponent(u.username)}:${decodeURIComponent(u.password)}` : '';
    } catch { return ''; }
  };

  const formatAsStandard = (p: Proxy) => {
    if (p.url) {
      try {
        const u = new URL(p.url);
        const creds = u.username ? `${decodeURIComponent(u.username)}:${decodeURIComponent(u.password)}` : '';
        return creds ? `${u.hostname}:${u.port}:${creds}` : `${u.hostname}:${u.port}`;
      } catch { return `${p.ip}:${p.port}`; }
    }
    return `${p.ip}:${p.port}`;
  };

  const getFlagEmoji = (countryCode: string | null) => {
    if (!countryCode || countryCode === '—' || countryCode === 'Unknown') return '🌐';
    const codePoints = countryCode.toUpperCase().split('').map((c) => 127397 + c.charCodeAt(0));
    try { return String.fromCodePoint(...codePoints); } catch { return '🌐'; }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const isPermanentDead = (p: Proxy) => !p.is_working && !p.is_blacklisted && p.fail_count >= maxRetries;

  // pool, working/dead et pool sont filtrés côté serveur.
  // Ici : recherche texte + distinction permanent (sous-filtre client des résultats dead).
  const filteredData = data?.filter((p) => {
    if (statusFilter === 'permanent' && !isPermanentDead(p)) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    const creds = getCredentials(p.url).toLowerCase();
    return (
      p.ip.toLowerCase().includes(s) ||
      p.port.toString().includes(s) ||
      (p.country || '').toLowerCase().includes(s) ||
      (p.provider || '').toLowerCase().includes(s) ||
      creds.includes(s)
    );
  });

  const totalPool = liveRaw?.pool?.total ?? 0;
  const workingPool = liveRaw?.pool?.working ?? 0;
  const bannedPool = liveRaw?.pool?.banned ?? 0;
  const activeThreads = liveRaw?.active_threads ?? 0;
  const activeSessions = liveRaw?.active_sessions ?? 0;
  const workingPercent = totalPool ? Math.round((workingPool / totalPool) * 100) : 0;

  const permanentDeadCount = data?.filter(isPermanentDead).length ?? 0;
  // Compte global des morts depuis liveRaw (indépendant de la page courante)
  const deadCount = Math.max(0, totalPool - workingPool);

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="relative overflow-hidden border border-border bg-background/50 backdrop-blur-md">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Pool</p>
                <h3 className="text-2xl font-bold font-mono tracking-tight">{totalPool}</h3>
              </div>
              <div className="rounded-full bg-primary/10 p-2.5 text-primary">
                <Database className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-3 text-xs text-muted-foreground">
              Total des proxies enregistrés en base.
            </div>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden border border-border bg-background/50 backdrop-blur-md">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Actifs / En ligne</p>
                <h3 className="text-2xl font-bold font-mono tracking-tight text-emerald-500">
                  {workingPool} <span className="text-sm font-normal text-muted-foreground">({workingPercent}%)</span>
                </h3>
              </div>
              <div className="rounded-full bg-emerald-500/10 p-2.5 text-emerald-500">
                <Activity className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className={`h-2 w-2 rounded-full ${workingPercent > 70 ? 'bg-emerald-500' : 'bg-amber-500 animate-ping'}`} />
              Statut du pool global
            </div>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden border border-border bg-background/50 backdrop-blur-md">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Moteur Live</p>
                <h3 className="text-2xl font-bold font-mono tracking-tight text-blue-500">
                  {activeThreads} <span className="text-sm font-normal text-muted-foreground">/ {activeSessions}</span>
                </h3>
              </div>
              <div className="rounded-full bg-blue-500/10 p-2.5 text-blue-500">
                <Network className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-3 text-xs text-muted-foreground">
              Fils d'exécution / Sessions actives.
            </div>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden border border-border bg-background/50 backdrop-blur-md">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {t('pool.dead')}
                </p>
                <h3 className="text-2xl font-bold font-mono tracking-tight text-destructive">
                  {deadCount}
                  {permanentDeadCount > 0 && (
                    <span className="ml-1.5 text-sm font-normal text-amber-500">({permanentDeadCount} {t('pool.permanent')})</span>
                  )}
                </h3>
              </div>
              <div className="rounded-full bg-destructive/10 p-2.5 text-destructive">
                <AlertTriangle className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <button
                disabled={cleaning || deadCount === 0}
                onClick={clearDead}
                className="font-medium text-destructive hover:underline disabled:opacity-50 disabled:no-underline"
              >
                {t('pool.deleteDead')}
              </button>
              {deadCount > 0 && (
                <button
                  disabled={revivedAll}
                  onClick={reviveAllDead}
                  className="font-medium text-emerald-500 hover:underline disabled:opacity-50 disabled:no-underline"
                >
                  {t('pool.reviveAll')}
                </button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Header and Controls */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between bg-card/40 p-4 rounded-xl border border-border/80">
        <div className="space-y-1">
          <h1 className="text-xl font-bold tracking-tight">{t('nav.pool')}</h1>
          <p className="text-xs text-muted-foreground">Visualisez et gérez l'ensemble des proxys du pool en temps réel.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => qc.invalidateQueries()} className="h-9 gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching || isFetchingLive ? 'animate-spin' : ''}`} />
            Actualiser
          </Button>
          <Button variant="outline" size="sm" onClick={exportProxies} disabled={exporting} className="h-9 gap-1.5">
            <Download className="h-3.5 w-3.5" />
            {t('pool.export')}
          </Button>
          <ImportDialog onDone={invalidate} />
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64 sm:flex-initial">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground/70" />
            <Input
              className="pl-9 h-9"
              placeholder="Rechercher..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Input
            className="max-w-[120px] h-9 text-xs"
            placeholder={t('pool.countryPlaceholder')}
            value={country}
            onChange={(e) => setCountry(e.target.value)}
          />
          <select
            value={protocol}
            onChange={(e) => setProtocol(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:ring-1 focus:ring-ring"
          >
            <option value="">{t('logs.all')}</option>
            <option value="http">http</option>
            <option value="socks4">socks4</option>
            <option value="socks5">socks5</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:ring-1 focus:ring-ring"
          >
            <option value="all">{t('pool.statusAll')}</option>
            <option value="working">{t('pool.statusWorking')}</option>
            <option value="dead">{t('pool.statusDead')}</option>
            {skipDead && <option value="permanent">{t('pool.statusPermanent')}</option>}
          </select>
          <select
            value={poolFilter}
            onChange={(e) => setPoolFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:ring-1 focus:ring-ring"
          >
            <option value="">{t('pools.noPool')} (global)</option>
            {pools?.map((p) => (
              <option key={p.id} value={p.name}>{p.name}</option>
            ))}
          </select>
        </div>
        <div className="text-xs text-muted-foreground font-mono">
          {filteredData?.length ?? 0} affichés — {totalCount} total
        </div>
      </div>

      {/* Main Table */}
      <Card className="border border-border/80 bg-background/30 backdrop-blur-sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <TR>
                  <TH className="w-10"></TH>
                  <TH>Hôte (Host/IP)</TH>
                  <TH>Port</TH>
                  <TH>User:Pass</TH>
                  <TH>{t('scraper.protocol')}</TH>
                  <TH>{t('reports.country')}</TH>
                  <TH>{t('reports.provider')}</TH>
                  <TH>{t('reports.status')}</TH>
                  <TH>{t('pool.failCount')}</TH>
                  <TH>{t('reports.latency')}</TH>
                  <TH className="text-right w-20">{t('common.actions')}</TH>
                </TR>
              </THead>
              <TBody>
                {filteredData?.map((p) => {
                  const creds = getCredentials(p.url);
                  const proxyStr = formatAsStandard(p);
                  const permDead = isPermanentDead(p);
                  return (
                    <TR key={p.id} className={`hover:bg-muted/30 transition-colors ${permDead ? 'opacity-60' : ''}`}>
                      <TD>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 rounded-md hover:bg-muted"
                          title="Copier host:port:user:pass"
                          onClick={() => copyToClipboard(proxyStr, `${p.id}-std`)}
                        >
                          {copiedId === `${p.id}-std` ? (
                            <Check className="h-3 w-3 text-emerald-500" />
                          ) : (
                            <Copy className="h-3 w-3 text-muted-foreground/75" />
                          )}
                        </Button>
                      </TD>
                      <TD className="font-mono text-xs font-medium">{p.ip}</TD>
                      <TD className="font-mono text-xs">{p.port}</TD>
                      <TD>
                        {creds ? (
                          <Badge variant="outline" className="font-mono text-[10px] bg-background/50 hover:bg-background border-dashed">
                            {creds}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground/50">—</span>
                        )}
                      </TD>
                      <TD>
                        <Badge variant="secondary" className="uppercase font-semibold text-[10px] py-0.5">
                          {p.protocol}
                        </Badge>
                      </TD>
                      <TD className="text-sm">
                        <span className="mr-1.5" title={p.country || 'Unknown'}>
                          {getFlagEmoji(p.country)}
                        </span>
                        <span className="font-mono text-xs font-semibold">{p.country || '—'}</span>
                      </TD>
                      <TD className="text-xs">
                        {p.provider === 'Manual' ? (
                          <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">{p.provider}</Badge>
                        ) : (
                          <span className="text-muted-foreground">{p.provider || '—'}</span>
                        )}
                      </TD>
                      <TD>
                        {p.is_blacklisted ? (
                          <Badge variant="destructive" className="text-[10px] px-2 py-0.5 rounded-full">BAN</Badge>
                        ) : permDead ? (
                          <Badge className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20">
                            {t('pool.statusPermanent')}
                          </Badge>
                        ) : (
                          <Badge
                            variant={p.is_working ? 'default' : 'destructive'}
                            className={`text-[10px] px-2 py-0.5 rounded-full ${p.is_working ? 'bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/15 border-emerald-500/20' : ''}`}
                          >
                            {p.is_working ? 'OK' : 'KO'}
                          </Badge>
                        )}
                      </TD>
                      <TD className="font-mono text-xs">
                        {p.fail_count > 0 ? (
                          <span className={p.fail_count >= maxRetries ? 'text-amber-500 font-semibold' : 'text-muted-foreground'}>
                            {p.fail_count}/{maxRetries}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/40">0</span>
                        )}
                      </TD>
                      <TD className="font-mono text-xs font-semibold">
                        {p.latency ? (
                          <span className={p.latency < 500 ? 'text-emerald-500' : p.latency < 1500 ? 'text-amber-500' : 'text-rose-500'}>
                            {Math.round(p.latency)} ms
                          </span>
                        ) : (
                          <span className="text-muted-foreground/55">—</span>
                        )}
                      </TD>
                      <TD className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => testProxy(p.id)}
                            disabled={testingIds.has(p.id)}
                            title={t('pool.testNow')}
                            className="h-7 w-7 rounded-md hover:bg-blue-500/10 text-muted-foreground hover:text-blue-500 transition-colors disabled:opacity-50"
                          >
                            <Gauge className={`h-3.5 w-3.5 ${testingIds.has(p.id) ? 'animate-pulse' : ''}`} />
                          </Button>
                          {!p.is_working && !p.is_blacklisted && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => revive(p.id)}
                              title={t('pool.revive')}
                              className="h-7 w-7 rounded-md hover:bg-emerald-500/10 text-muted-foreground hover:text-emerald-500 transition-colors"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => blacklist(p.id, !p.is_blacklisted)}
                            title={t(p.is_blacklisted ? 'pool.unblacklist' : 'pool.blacklist')}
                            className={`h-7 w-7 rounded-md transition-colors hover:bg-amber-500/10 hover:text-amber-500 ${p.is_blacklisted ? 'text-amber-500' : 'text-muted-foreground'}`}
                          >
                            <Ban className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => del(p.id)}
                            className="h-7 w-7 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TD>
                    </TR>
                  );
                })}
                {!filteredData?.length && (
                  <TR>
                    <TD colSpan={11} className="py-12 text-center text-muted-foreground">
                      {t('common.none')}
                    </TD>
                  </TR>
                )}
              </TBody>
            </Table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t px-4 py-3">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0 || isFetching}
                onClick={() => setPage((p) => p - 1)}
                className="h-8 gap-1"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Précédent
              </Button>
              <span className="text-xs text-muted-foreground">
                Page <span className="font-semibold">{page + 1}</span> / {totalPages}
                <span className="ml-2 text-muted-foreground/60">({totalCount} proxies)</span>
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages - 1 || isFetching}
                onClick={() => setPage((p) => p + 1)}
                className="h-8 gap-1"
              >
                Suivant <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ImportDialog({ onDone }: { onDone: () => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [protocol, setProtocol] = useState('');
  const [pool, setPool] = useState('');
  const [result, setResult] = useState('');
  const [busy, setBusy] = useState(false);

  const { data: pools } = useQuery({
    queryKey: ['proxy-pools'],
    queryFn: async () => (await api.get('/proxy-pools')).data.data as { id: string; name: string; color: string | null }[],
    enabled: open,
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setResult('');
    try {
      const { data } = await api.post('/monitoring/proxies/import', {
        text,
        protocol: protocol || undefined,
        pool: pool || undefined,
      });
      setResult(data.message);
      setText('');
      setTimeout(() => { setOpen(false); setResult(''); }, 1500);
      onDone();
    } catch (err) {
      setResult(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-1.5 h-9">
          <Upload className="h-4 w-4" /> {t('pool.import')}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t('pool.import')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4 pt-2">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">
              Formats supportés : <code>ip:port</code>, <code>host:port</code>, <code>host:port:user:pass</code>, <code>user:pass@host:port</code> (un par ligne).
            </p>
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            required
            placeholder={'proxy.example.com:8080\n185.220.101.4:8080:monuser:monpass\nsocks5://user:pass@12.34.56.78:1080'}
            className="w-full rounded-md border border-input bg-background/50 px-3 py-2 font-mono text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus:border-primary/50 transition-colors"
          />
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">{t('pool.forceProtocol')}</Label>
            <select
              value={protocol}
              onChange={(e) => setProtocol(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:ring-1 focus:ring-ring"
            >
              <option value="">— Détection auto (ou HTTP par défaut)</option>
              <option value="http">http</option>
              <option value="socks4">socks4</option>
              <option value="socks5">socks5</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">{t('pools.assign')}</Label>
            <select
              value={pool}
              onChange={(e) => setPool(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:ring-1 focus:ring-ring"
            >
              <option value="">{t('pools.noPool')}</option>
              {pools?.map((p) => (
                <option key={p.id} value={p.name}>{p.name}</option>
              ))}
            </select>
          </div>
          {result && (
            <div className={`p-2.5 rounded-md text-xs font-semibold ${result.toLowerCase().includes('erreur') ? 'bg-destructive/10 text-destructive' : 'bg-emerald-500/10 text-emerald-500'}`}>
              {result}
            </div>
          )}
          <DialogFooter className="pt-2 border-t border-border">
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)} disabled={busy}>
              Annuler
            </Button>
            <Button type="submit" size="sm" disabled={busy}>
              {t('pool.import')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
