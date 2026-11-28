/**
 * Addon Sécurité (empreinte d'appareil BloumeID / ThumbmarkJS / FingerprintJS) : quand il est actif et protège une action,
 * on charge son SDK (/addon-proxy/security/sdk.js, même origine) et on joint un jeton à usage unique à la requête.
 * Échec du SDK : pas de jeton — c'est l'addon qui décide (politique « jeton obligatoire »).
 */
export type SecurityAction = 'login' | 'register' | 'forgot';
export interface SecurityConfig { login: boolean; register: boolean; forgot: boolean; badge: boolean }

let config: SecurityConfig | null = null;
let sdk: Promise<any> | null = null;

export function setSecurityConfig(c: SecurityConfig | null | undefined): void {
  config = c ?? null;
  // Préchargement : le premier calcul d'empreinte prend ~300 ms, autant le lancer pendant la saisie.
  if (config && (config.login || config.register || config.forgot)) void loadSdk();
}

function loadSdk(): Promise<any> {
  const w = window as any;
  if (w.UHQSecurity) return Promise.resolve(w.UHQSecurity);
  sdk ??= new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = '/addon-proxy/security/sdk.js';
    s.async = true;
    s.onload = () => resolve(w.UHQSecurity ?? null);
    s.onerror = () => { sdk = null; resolve(null); };
    document.head.appendChild(s);
  });
  return sdk;
}

export async function securityToken(action: SecurityAction): Promise<string | undefined> {
  if (!config?.[action]) return undefined;
  try {
    const s = await loadSdk();
    return s ? await s.token(action) : undefined;
  } catch {
    return undefined;
  }
}

export function securityBadge(): boolean {
  return !!config?.badge && !!(config.login || config.register || config.forgot);
}
