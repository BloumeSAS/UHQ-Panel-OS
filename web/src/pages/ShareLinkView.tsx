import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Copy, Check, ShieldAlert, Clock } from 'lucide-react';
import { api } from '@/lib/api';
import { useSite } from '@/lib/site';
import { Card, CardContent, CardHeader, CardTitle, Button } from '@/components/ui';
import { Footer } from '@/components/Footer';

interface ShareData {
  label: string;
  username: string;
  password: string;
  host: string;
  port: number | string;
  expiresAt: string | null;
}

/** Page publique (aucun login requis) de résolution d'un lien de partage. */
export default function ShareLinkView() {
  const { token } = useParams<{ token: string }>();
  const { status } = useSite();
  const [copied, setCopied] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['share-link', token],
    queryFn: async () => (await api.get(`/share/${token}`)).data.data as ShareData,
    retry: false,
  });

  const copy = (label: string, value: string) => {
    navigator.clipboard.writeText(value);
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-4">
        <div className="flex flex-col items-center gap-2 mb-2">
          <img src={status?.logoUrl || '/static/logo.png'} alt="logo" className="h-10 w-10 rounded" />
          <span className="text-sm font-semibold text-muted-foreground">{status?.siteName || 'UHQ Panel OS'}</span>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Accès proxy partagé</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading && <p className="text-sm text-muted-foreground text-center py-6">Chargement…</p>}

            {!isLoading && error && (
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <ShieldAlert className="h-8 w-8 text-destructive" />
                <p className="text-sm text-muted-foreground">
                  Ce lien est invalide, expiré ou a été révoqué.
                </p>
              </div>
            )}

            {data && (
              <>
                <Row label="Compte" value={data.label} onCopy={copy} />
                <Row label="Host" value={data.host} onCopy={copy} copied={copied} />
                <Row label="Port" value={String(data.port)} onCopy={copy} copied={copied} />
                <Row label="Username" value={data.username} onCopy={copy} copied={copied} />
                <Row label="Password" value={data.password} onCopy={copy} copied={copied} />
                <Button
                  className="w-full"
                  onClick={() => copy('all', `${data.host}:${data.port}:${data.username}:${data.password}`)}
                >
                  {copied === 'all' ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                  Copier host:port:user:pass
                </Button>
                {data.expiresAt && (
                  <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground pt-1">
                    <Clock className="h-3.5 w-3.5" />
                    Expire le {new Date(data.expiresAt).toLocaleString()}
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
      <Footer />
    </div>
  );
}

function Row({
  label,
  value,
  onCopy,
  copied,
}: {
  label: string;
  value: string;
  onCopy: (label: string, value: string) => void;
  copied?: string | null;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="font-mono text-sm truncate">{value}</div>
      </div>
      <button
        onClick={() => onCopy(label, value)}
        className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
      >
        {copied === label ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
      </button>
    </div>
  );
}
