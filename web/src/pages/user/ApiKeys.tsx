import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { KeyRound, Plus, Trash2, Eye, EyeOff, Copy, Check, Shield } from 'lucide-react';
import { Button, Input, Card } from '@/components/ui';
import { toast } from '@/lib/toast';

const ALL_SCOPES = [
  'read:proxies',
  'write:proxies',
  'read:stats',
  'read:users',
  'write:users',
  'read:pool',
];

export default function ApiKeysPage() {
  const t = useT();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [keyName, setKeyName] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<string[]>([]);
  const [expiresAt, setExpiresAt] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { data: keys, refetch } = useQuery({
    queryKey: ['api-keys'],
    queryFn: async () => {
      const { data } = await api.get('/api-keys');
      return data.data as any[];
    },
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.post('/api-keys', {
        name: keyName,
        scopes: selectedScopes,
        expiresAt: expiresAt || undefined,
      }),
    onSuccess: ({ data }) => {
      setNewKey(data.key);
      setKeyName('');
      setSelectedScopes([]);
      setExpiresAt('');
      setShowCreate(false);
      refetch();
      toast.success(t('apiKeys.created'));
    },
    onError: (e: any) => toast.error(e.response?.data?.message || t('common.error')),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.patch(`/api-keys/${id}`, { isActive }),
    onSuccess: () => refetch(),
    onError: (e: any) => toast.error(e.response?.data?.message || t('common.error')),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api-keys/${id}`),
    onSuccess: () => {
      refetch();
      toast.success(t('apiKeys.deleted'));
    },
    onError: (e: any) => toast.error(e.response?.data?.message || t('common.error')),
  });

  const copyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    setCopiedId(key);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleScope = (scope: string) => {
    setSelectedScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope],
    );
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <KeyRound className="h-6 w-6 text-primary" />
            {t('apiKeys.title')}
          </h1>
          <p className="text-muted-foreground mt-1">{t('apiKeys.subtitle')}</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-2" />
          {t('apiKeys.create')}
        </Button>
      </div>

      {/* New key created — show only once */}
      {newKey && (
        <Card className="p-4 border-green-500/50 bg-green-50 dark:bg-green-950/30 space-y-3">
          <p className="text-sm font-semibold text-green-700 dark:text-green-400">
            ⚠️ {t('apiKeys.saveWarning')}
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-background border rounded px-3 py-2 font-mono break-all">{newKey}</code>
            <Button variant="ghost" size="icon" onClick={() => copyKey(newKey)}>
              {copiedId === newKey ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <Button size="sm" variant="outline" onClick={() => setNewKey(null)}>
            {t('common.close')}
          </Button>
        </Card>
      )}

      {/* Create form */}
      {showCreate && (
        <Card className="p-5 space-y-4">
          <h2 className="text-base font-semibold">{t('apiKeys.newKey')}</h2>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">{t('apiKeys.name')}</label>
              <Input
                value={keyName}
                onChange={(e) => setKeyName(e.target.value)}
                placeholder={t('apiKeys.namePlaceholder')}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">{t('apiKeys.scopes')}</label>
              <div className="mt-1 flex flex-wrap gap-2">
                {ALL_SCOPES.map((scope) => (
                  <button
                    key={scope}
                    type="button"
                    onClick={() => toggleScope(scope)}
                    className={`px-2 py-1 rounded-full text-xs font-medium border transition-colors ${
                      selectedScopes.includes(scope)
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'border-border text-muted-foreground hover:border-primary hover:text-foreground'
                    }`}
                  >
                    {scope}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">{t('apiKeys.expiresAt')}</label>
              <Input
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value ? new Date(e.target.value).toISOString() : '')}
                className="mt-1 max-w-[200px]"
              />
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <Button onClick={() => createMutation.mutate()} disabled={!keyName || createMutation.isPending}>
              {t('apiKeys.generate')}
            </Button>
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              {t('common.cancel')}
            </Button>
          </div>
        </Card>
      )}

      {/* Keys list */}
      <div className="space-y-3">
        {!keys?.length && (
          <Card className="p-8 text-center text-muted-foreground">
            <KeyRound className="h-10 w-10 mx-auto mb-3 opacity-30" />
            {t('apiKeys.none')}
          </Card>
        )}
        {keys?.map((key: any) => (
          <Card key={key.id} className={`p-4 flex items-center gap-3 ${!key.isActive ? 'opacity-50' : ''}`}>
            <Shield className={`h-5 w-5 flex-shrink-0 ${key.isActive ? 'text-green-500' : 'text-muted-foreground'}`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{key.name}</span>
                {!key.isActive && (
                  <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
                    {t('apiKeys.revoked')}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 font-mono">{key.keyPrefix}…</p>
              <div className="flex flex-wrap gap-1 mt-1">
                {(key.scopes ?? []).map((s: string) => (
                  <span key={s} className="text-[10px] bg-accent px-1.5 py-0.5 rounded font-mono">{s}</span>
                ))}
                {!key.scopes?.length && <span className="text-xs text-muted-foreground">{t('apiKeys.noScopes')}</span>}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {t('apiKeys.created')}: {new Date(key.createdAt).toLocaleDateString()}
                {key.expiresAt && ` · ${t('apiKeys.expires')}: ${new Date(key.expiresAt).toLocaleDateString()}`}
                {key.lastUsed && ` · ${t('apiKeys.lastUsed')}: ${new Date(key.lastUsed).toLocaleDateString()}`}
              </p>
            </div>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                title={key.isActive ? t('apiKeys.revoke') : t('apiKeys.reactivate')}
                onClick={() => toggleActiveMutation.mutate({ id: key.id, isActive: !key.isActive })}
              >
                {key.isActive ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="text-destructive hover:bg-destructive/10"
                onClick={() => deleteMutation.mutate(key.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
