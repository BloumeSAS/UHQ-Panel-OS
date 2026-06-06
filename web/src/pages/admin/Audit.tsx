import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { ClipboardList, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { Button, Card } from '@/components/ui';

export default function AuditPage() {
  const t = useT();
  const [page, setPage] = useState(1);
  const limit = 50;

  const { data } = useQuery({
    queryKey: ['audit', page],
    queryFn: async () => {
      const { data } = await api.get(`/audit?page=${page}&limit=${limit}`);
      return data as { items: any[]; total: number; page: number; limit: number };
    },
  });

  const totalPages = Math.ceil((data?.total ?? 0) / limit);

  const downloadCsv = () => {
    const rows = (data?.items ?? []).map((l: any) =>
      [l.id, l.userEmail ?? '', l.action, l.target ?? '', l.ip ?? '', new Date(l.createdAt).toISOString()].join(',')
    );
    const csv = ['id,user_email,action,target,ip,created_at', ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'audit-log.csv';
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
              {data?.items?.map((log: any) => (
                <tr key={log.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs">{log.userEmail ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${actionColor(log.action)}`}>
                      {log.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{log.target ?? '—'}</td>
                  <td className="px-4 py-3 font-mono text-xs">{log.ip ?? '—'}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(log.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
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
