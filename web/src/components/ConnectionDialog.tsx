import { useMemo, useState } from 'react';
import { Check, Copy, Dices } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/dialog';
import { Button, Input, Label } from '@/components/ui';
import { cn } from '@/lib/utils';

export interface ConnectionInfo {
  host: string;
  port: string | number;
  username: string;
  password: string;
  label?: string;
}

const randomSession = () => Math.random().toString(36).slice(2, 10);

/**
 * Générateur de lignes de connexion : un compte → toutes les formes dont un client a besoin (texte brut, URL, curl,
 * Python, Node, Playwright, Puppeteer, navigateur), prêtes à copier. Le moteur parle le protocole proxy HTTP
 * (HTTPS via CONNECT) ; l'option « session » ajoute `-session-<id>` à l'identifiant (IP conservée), sans elle
 * chaque connexion peut obtenir une IP différente (rotation).
 */
export function ConnectionDialog({ info, onClose }: { info: ConnectionInfo | null; onClose: () => void }) {
  const t = useT();
  const [session, setSession] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  const snippets = useMemo(() => {
    if (!info) return [];
    const H = String(info.host);
    const P = String(info.port);
    const U = info.username + (session.trim() ? `-session-${session.trim()}` : '');
    const W = info.password;
    const enc = encodeURIComponent;
    const url = `http://${enc(U)}:${enc(W)}@${H}:${P}`;
    const q = (s: string) => JSON.stringify(s);
    return [
      { id: 'raw', label: 'host:port:user:pass', lang: '', code: `${H}:${P}:${U}:${W}` },
      { id: 'at', label: 'user:pass@host:port', lang: '', code: `${U}:${W}@${H}:${P}` },
      { id: 'url', label: 'URL (http://…)', lang: '', code: url },
      { id: 'curl', label: 'curl', lang: 'bash', code: `curl -x "http://${H}:${P}" --proxy-user ${q(`${U}:${W}`)} https://api.ipify.org` },
      {
        id: 'py',
        label: 'Python (requests)',
        lang: 'python',
        code: `import requests\n\nproxy = ${q(url)}\nr = requests.get("https://api.ipify.org", proxies={"http": proxy, "https": proxy}, timeout=30)\nprint(r.text)`,
      },
      {
        id: 'node',
        label: 'Node.js (undici)',
        lang: 'js',
        code: `import { ProxyAgent, fetch } from 'undici';\n\nconst dispatcher = new ProxyAgent({\n  uri: ${q(`http://${H}:${P}`)},\n  token: 'Basic ' + Buffer.from(${q(`${U}:${W}`)}).toString('base64'),\n});\nconst res = await fetch('https://api.ipify.org', { dispatcher });\nconsole.log(await res.text());`,
      },
      {
        id: 'pw',
        label: 'Playwright',
        lang: 'js',
        code: `import { chromium } from 'playwright';\n\nconst browser = await chromium.launch({\n  proxy: { server: ${q(`http://${H}:${P}`)}, username: ${q(U)}, password: ${q(W)} },\n});\nconst page = await browser.newPage();\nawait page.goto('https://api.ipify.org');\nconsole.log(await page.textContent('body'));\nawait browser.close();`,
      },
      {
        id: 'pp',
        label: 'Puppeteer',
        lang: 'js',
        code: `import puppeteer from 'puppeteer';\n\nconst browser = await puppeteer.launch({ args: [${q(`--proxy-server=http://${H}:${P}`)}] });\nconst page = await browser.newPage();\nawait page.authenticate({ username: ${q(U)}, password: ${q(W)} });\nawait page.goto('https://api.ipify.org');\nconsole.log(await page.evaluate(() => document.body.innerText));\nawait browser.close();`,
      },
      {
        id: 'browser',
        label: t('conn.browser'),
        lang: '',
        code: `${t('conn.browserSteps')}\n\n${t('conn.browserType')} : HTTP\n${t('conn.browserHost')} : ${H}\n${t('conn.browserPort')} : ${P}\n${t('conn.browserUser')} : ${U}\n${t('conn.browserPass')} : ${W}`,
      },
    ];
  }, [info, session, t]);

  const copy = async (id: string, code: string) => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = code;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setCopied(id);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <Dialog open={!!info} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-3xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {t('conn.title')}
            {info?.label ? ` — ${info.label}` : ''}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <p className="text-muted-foreground">{t('conn.intro')}</p>

          <div className="rounded-lg border p-3">
            <Label className="text-xs">{t('conn.session')}</Label>
            <div className="mt-1 flex gap-2">
              <Input
                value={session}
                onChange={(e) => setSession(e.target.value.replace(/[^A-Za-z0-9_]/g, '').slice(0, 24))}
                placeholder={t('conn.sessionPlaceholder')}
                className="max-w-xs"
              />
              <Button type="button" variant="outline" size="icon" onClick={() => setSession(randomSession())} title={t('conn.randomSession')}>
                <Dices className="h-4 w-4" />
              </Button>
              {session && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setSession('')}>
                  {t('conn.noSession')}
                </Button>
              )}
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">{session ? t('conn.sessionOn') : t('conn.sessionOff')}</p>
          </div>

          <div className="space-y-3">
            {snippets.map((sn) => (
              <div key={sn.id} className="rounded-lg border">
                <div className="flex items-center justify-between border-b px-3 py-1.5">
                  <span className="text-xs font-medium">{sn.label}</span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => copy(sn.id, sn.code)} className="h-7 gap-1.5 text-xs">
                    {copied === sn.id ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied === sn.id ? t('common.copied') : t('common.copy')}
                  </Button>
                </div>
                <pre className={cn('overflow-x-auto whitespace-pre-wrap break-all p-3 font-mono text-xs')}>{sn.code}</pre>
              </div>
            ))}
          </div>

          <p className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">{t('conn.note')}</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
