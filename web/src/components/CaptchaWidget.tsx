import { useEffect, useRef, useCallback, useState } from 'react';

export type CaptchaProvider = 'none' | 'hcaptcha' | 'recaptcha' | 'turnstile' | 'cap';

interface Props {
  provider: CaptchaProvider;
  siteKey: string;
  onVerify: (token: string) => void;
  onExpire?: () => void;
  /** CAP seulement : URL de base de l'instance (ex. https://cap.trycap.dev) */
  capEndpoint?: string;
}

const SCRIPTS: Record<string, string> = {
  hcaptcha: 'https://js.hcaptcha.com/1/api.js',
  recaptcha: 'https://www.google.com/recaptcha/api.js?render=explicit&hl=fr',
  turnstile: 'https://challenges.cloudflare.com/turnstile/v0/api.js',
};

declare global {
  interface Window {
    hcaptcha?: any;
    grecaptcha?: any;
    turnstile?: any;
  }
  namespace JSX {
    interface IntrinsicElements {
      'cap-widget': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
        'data-cap-api-endpoint'?: string;
      }, HTMLElement>;
    }
  }
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src^="${src.split('?')[0]}"]`)) {
      resolve();
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

/**
 * CAP — même approche que uhq.monster (référence sans bug) : le web
 * component `@cap.js/widget` est importé comme un vrai module npm (bundlé,
 * jamais un `<script>` CDN externe) et monté DÉCLARATIVEMENT en JSX, React
 * gérant lui-même le cycle de vie de l'élément. L'ancienne version créait
 * l'élément à la main (`document.createElement`) après avoir chargé un
 * script CDN — CAP retombait alors parfois dans un état "à refaire" que la
 * confirmation React ne parvenait pas à masquer de façon fiable dans tous
 * les cas. Ici, une fois `solve` émis, ce composant est démonté par le
 * parent (`solved` devient true) — il n'y a plus rien à réinitialiser.
 */
function CapWidget({ endpoint, onSolve }: { endpoint: string; onSolve: (token: string) => void }) {
  const [loading, setLoading] = useState(true);
  const widgetRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let mounted = true;
    // @ts-ignore — pas de types officiels pour ce sous-module
    import('@cap.js/widget').then(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (loading) return;
    const widget = widgetRef.current;
    if (!widget) return;
    const handleSolve = (e: Event) => {
      const token = (e as CustomEvent<{ token?: string }>).detail?.token;
      if (token) onSolve(token);
    };
    widget.addEventListener('solve', handleSolve);
    return () => widget.removeEventListener('solve', handleSolve);
  }, [loading, onSolve]);

  if (loading) return null;

  return (
    <div
      style={{
        '--cap-background': 'hsl(var(--background))',
        '--cap-border-color': 'hsl(var(--border))',
        '--cap-border-radius': '10px',
        '--cap-color': 'hsl(var(--foreground))',
        '--cap-checkbox-border': '1px solid hsl(var(--ring))',
        '--cap-checkbox-background': 'hsl(var(--secondary))',
        '--cap-spinner-color': 'hsl(var(--primary))',
        '--cap-spinner-background-color': 'hsl(var(--primary-foreground))',
      } as React.CSSProperties}
    >
      <cap-widget ref={widgetRef as any} data-cap-api-endpoint={endpoint} />
    </div>
  );
}

export function CaptchaWidget({ provider, siteKey, onVerify, onExpire, capEndpoint }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<any>(null);
  const mountedRef = useRef(true);
  const [capSolved, setCapSolved] = useState(false);

  // Repart d'un captcha non résolu si le provider/site key/endpoint change
  // (nouvel écran, nouvelle config) — jamais pendant une résolution en cours.
  useEffect(() => {
    setCapSolved(false);
  }, [provider, siteKey, capEndpoint]);

  const handleCapSolve = useCallback((token: string) => {
    onVerify(token);
    setCapSolved(true);
  }, [onVerify]);

  // ── Autres providers (hCaptcha / reCAPTCHA / Turnstile) ───────────────────
  const renderClassic = useCallback(() => {
    if (!containerRef.current || !mountedRef.current) return;
    const el = containerRef.current;

    if (provider === 'hcaptcha' && window.hcaptcha) {
      widgetIdRef.current = window.hcaptcha.render(el, {
        sitekey: siteKey,
        callback: onVerify,
        'expired-callback': onExpire,
      });
    } else if (provider === 'recaptcha' && window.grecaptcha?.render) {
      widgetIdRef.current = window.grecaptcha.render(el, {
        sitekey: siteKey,
        callback: onVerify,
        'expired-callback': onExpire,
      });
    } else if (provider === 'turnstile' && window.turnstile) {
      widgetIdRef.current = window.turnstile.render(el, {
        sitekey: siteKey,
        callback: onVerify,
        'expired-callback': onExpire,
      });
    }
  }, [provider, siteKey, onVerify, onExpire]);

  const getApi = useCallback(() => {
    if (provider === 'hcaptcha') return window.hcaptcha;
    if (provider === 'recaptcha') return window.grecaptcha?.render ? window.grecaptcha : undefined;
    if (provider === 'turnstile') return window.turnstile;
    return undefined;
  }, [provider]);

  useEffect(() => {
    mountedRef.current = true;
    if (provider === 'none' || !siteKey || provider === 'cap') return;

    const src = SCRIPTS[provider];
    if (!src) return;

    const tryRender = () => {
      if (getApi()) {
        renderClassic();
      } else {
        const interval = setInterval(() => {
          if (!mountedRef.current) { clearInterval(interval); return; }
          if (getApi()) { clearInterval(interval); renderClassic(); }
        }, 100);
      }
    };
    loadScript(src).then(tryRender).catch(console.error);

    return () => {
      mountedRef.current = false;
      try {
        if (provider === 'hcaptcha' && window.hcaptcha && widgetIdRef.current != null)
          window.hcaptcha.reset(widgetIdRef.current);
        else if (provider === 'recaptcha' && window.grecaptcha && widgetIdRef.current != null)
          window.grecaptcha.reset(widgetIdRef.current);
        else if (provider === 'turnstile' && window.turnstile && widgetIdRef.current != null)
          window.turnstile.reset(widgetIdRef.current);
      } catch {}
    };
  }, [provider, siteKey, renderClassic, getApi]);

  if (provider === 'none' || !siteKey) return null;

  if (provider === 'cap') {
    if (capSolved) {
      return (
        <div className="my-2 flex items-center gap-2 rounded-md border border-input bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          ✓ Vérification réussie
        </div>
      );
    }
    const base = (capEndpoint || 'https://cap.trycap.dev').replace(/\/$/, '');
    return (
      <div className="my-2">
        <CapWidget endpoint={`${base}/${siteKey}/`} onSolve={handleCapSolve} />
      </div>
    );
  }

  return <div ref={containerRef} className="my-2" />;
}
