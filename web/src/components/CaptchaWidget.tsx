import { useEffect, useRef, useCallback } from 'react';

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
  // CAP : web component via jsDelivr
  cap: 'https://cdn.jsdelivr.net/npm/cap-widget/dist/cap-widget.js',
};

declare global {
  interface Window {
    hcaptcha?: any;
    grecaptcha?: any;
    turnstile?: any;
  }
  // Déclaration du web component CAP pour JSX
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

export function CaptchaWidget({ provider, siteKey, onVerify, onExpire, capEndpoint }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<any>(null);
  const mountedRef = useRef(true);
  const capWidgetRef = useRef<HTMLElement | null>(null);

  // ── CAP (web component) ────────────────────────────────────────────────────
  const renderCap = useCallback(() => {
    if (!containerRef.current || !mountedRef.current) return;
    containerRef.current.innerHTML = '';

    const base = (capEndpoint || 'https://cap.trycap.dev').replace(/\/$/, '');
    const endpoint = `${base}/${siteKey}/`;

    const el = document.createElement('cap-widget') as HTMLElement;
    el.setAttribute('data-cap-api-endpoint', endpoint);
    el.addEventListener('solve', (e: any) => {
      const token: string = e.detail?.token ?? '';
      if (token) onVerify(token);
    });
    containerRef.current.appendChild(el);
    capWidgetRef.current = el;
  }, [siteKey, capEndpoint, onVerify]);

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
    if (provider === 'none' || !siteKey) return;

    const src = SCRIPTS[provider];
    if (!src) return;

    if (provider === 'cap') {
      loadScript(src)
        .then(() => {
          if (mountedRef.current) renderCap();
        })
        .catch(console.error);
    } else {
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
    }

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
  }, [provider, siteKey, capEndpoint, renderCap, renderClassic, getApi]);

  if (provider === 'none' || !siteKey) return null;

  return <div ref={containerRef} className="my-2" />;
}
