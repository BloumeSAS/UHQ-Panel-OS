import { Fragment, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { ClipboardList, ChevronLeft, ChevronRight, ChevronDown, Download, X } from 'lucide-react';
import { Button, Card } from '@/components/ui';

function parseDetails(details: string | null): any {
  if (!details) return null;
  try { return JSON.parse(details); } catch { return null; }
}

interface Filters {
  action: string;
  userEmail: string;
  from: string;
  to: string;
}

const EMPTY_FILTERS: Filters = { action: '', userEmail: '', from: '', to: '' };

export default function AuditPage() {
  const t = useT();
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS);
  const limit = 50;

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const buildParams = (extra: Record<string, string | number> = {}) => {
    const params = new URLSearchParams();
    if (filters.action) params.set('action', filters.action);
    if (filters.userEmail) params.set('userEmail', filters.userEmail);
    if (filters.from) params.set('from', filters.from);
    if (filters.to) params.set('to', filters.to);
    for (const [k, v] of Object.entries(extra)) params.set(k, String(v));
    return params;
  };

  const { data } = useQuery({
    queryKey: ['audit', page, filters],
    queryFn: async () => {
      const params = buildParams({ page, limit });
      const { data } = await api.get(`/audit?${params.toString()}`);
      return data as { items: any[]; total: number; page: number; limit: number };
    },
  });

  const totalPages = Math.ceil((data?.total ?? 0) / limit);

  const applyFilters = () => {
    setFilters(draft);
    setPage(1);
  };

  const clearFilters = () => {
    setDraft(EMPTY_FILTERS);
    setFilters(EMPTY_FILTERS);
    setPage(1);
  };

  const hasActiveFilters = Object.values(filters).some(Boolean);

  const downloadCsv = async () => {
    // Export complet côté serveur (filtré, pas juste la page affichée). Passe
    // par le client axios (pas window.open) pour que le header Authorization
    // Bearer soit envoyé — le endpoint est protégé par JwtAuthGuard.
    const params = buildParams();
    const { data } = await api.get(`/audit/export?${params.toString()}`, { responseType: 'blob' });
    const url = URL.createObjectURL(new Blob([data], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const actionColor = (action: string) => {
    if (action.includes('delete')) return 'text-destructive bg-destructive/10';
    if (action.includes('create')) return 'text-green-600 bg-green-100 dark:bg-green-900/20 dark:text-green-400';
    if (action.includes('update') || action.includes('settings')) return 'text-blue-600 bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400';
    return 'text-muted-foreground bg-muted';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardList className="h-6 w-6 text-primary" />
            {t('audit.title')}
          </h1>
          <p className="text-muted-foreground mt-1">{t('audit.subtitle')}</p>
        </div>
        <Button variant="outline" onClick={downloadCsv}>
          <Download className="h-4 w-4 mr-2" />
          {t('common.download')} CSV
        </Button>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">{t('audit.action')}</label>
            <input
              value={draft.action}
              onChange={(e) => setDraft((d) => ({ ...d, action: e.target.value }))}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm w-40"
              placeholder="settings.update"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">{t('audit.user')}</label>
            <input
              value={draft.userEmail}
              onChange={(e) => setDraft((d) => ({ ...d, userEmail: e.target.value }))}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm w-48"
              placeholder="user@mail.com"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">{t('audit.from')}</label>
            <input
              type="date"
              value={draft.from}
              onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">{t('audit.to')}</label>
            <input
              type="date"
              value={draft.to}
              onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            />
          </div>
          <Button size="sm" onClick={applyFilters}>{t('audit.applyFilters')}</Button>
          {hasActiveFilters && (
            <Button size="sm" variant="outline" onClick={clearFilters}>
              <X className="h-3.5 w-3.5 mr-1" /> {t('audit.clearFilters')}
            </Button>
          )}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium">{t('audit.user')}</th>
                <th className="px-4 py-3 text-left font-medium">{t('audit.action')}</th>
                <th className="px-4 py-3 text-left font-medium">{t('audit.target')}</th>
                <th className="px-4 py-3 text-left font-medium">{t('audit.ip')}</th>
                <th className="px-4 py-3 text-left font-medium">{t('audit.date')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {!data?.items?.length && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    {t('audit.noLogs')}
                  </td>
                </tr>
              )}
              {data?.items?.map((log: any) => {
                const details = parseDetails(log.details);
                const changes = log.action === 'settings.update' ? details?.changes : null;
                const isExpanded = expanded.has(log.id);
                return (
                  <Fragment key={log.id}>
                    <tr
                      className={`hover:bg-muted/30 transition-colors ${changes?.length ? 'cursor-pointer' : ''}`}
                      onClick={() => changes?.length && toggleExpand(log.id)}
                    >
                      <td className="px-4 py-3 font-mono text-xs">{log.userEmail ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${actionColor(log.action)}`}>
                          {t(`audit.actions.${log.action}` as any) !== `audit.actions.${log.action}`
                            ? t(`audit.actions.${log.action}` as any)
                            : log.action}
                        </span>
                        {!!changes?.length && (
                          <ChevronDown className={`inline-block h-3.5 w-3.5 ml-1.5 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{log.target ?? '—'}</td>
                      <td className="px-4 py-3 font-mono text-xs">{log.ip ?? '—'}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                    </tr>
                    {isExpanded && changes?.length > 0 && (
                      <tr key={`${log.id}-diff`} className="bg-muted/20">
                        <td colSpan={5} className="px-4 py-3">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-muted-foreground">
                                <th className="text-left font-medium py-1 pr-4">Clé</th>
                                <th className="text-left font-medium py-1 pr-4">Avant</th>
                                <th className="text-left font-medium py-1">Après</th>
                              </tr>
                            </thead>
                            <tbody>
                              {changes.map((c: any) => (
                                <tr key={c.key}>
                                  <td className="py-1 pr-4 font-mono">{c.key}</td>
                                  <td className="py-1 pr-4 font-mono text-destructive/80 truncate max-w-[220px]">{c.from || '∅'}</td>
                                  <td className="py-1 font-mono text-emerald-600 dark:text-emerald-400 truncate max-w-[220px]">{c.to || '∅'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t px-4 py-3 bg-muted/20">
            <span className="text-sm text-muted-foreground">
              {t('audit.page')} {page} / {totalPages} — {data?.total} {t('audit.entries')}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
