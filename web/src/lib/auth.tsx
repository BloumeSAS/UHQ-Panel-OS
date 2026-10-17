import { createContext, useContext, useEffect, useState } from 'react';
import { api, clearToken, getToken, setToken } from './api';

export interface PanelUser {
  id: string;
  email: string;
  role: 'ADMIN' | 'USER' | 'SUPPORT';
  /** true si `require2faForAdmins` est actif et que ce compte admin n'a pas encore activé la 2FA. */
  mustSetup2fa?: boolean;
}

interface LoginResult {
  requires2fa?: boolean;
  tempToken?: string;
}

interface AuthCtx {
  user: PanelUser | null;
  loading: boolean;
  login: (email: string, password: string, captchaToken?: string) => Promise<LoginResult>;
  verify2fa: (tempToken: string, code: string) => Promise<void>;
  register: (email: string, password: string, captchaToken?: string) => Promise<void>;
  applyToken: (token: string, user: PanelUser) => void;
  /** Recharge l'utilisateur courant depuis /auth/me (ex. après activation 2FA, pour effacer mustSetup2fa sans relogin). */
  refreshUser: () => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<AuthCtx | null>(null);

/**
 * Rôle EFFECTIF = celui confirmé par le serveur. `auth/me` / la réponse de connexion peuvent être réécrites dans le navigateur
 * (DevTools) : un compte « staff » doit donc être confirmé par `auth/staff-check` (403 pour un simple utilisateur), sinon il est
 * traité comme USER. Ce n'est qu'un garde-fou d'interface : les routes d'administration vérifient le rôle côté serveur à chaque appel.
 */
async function withVerifiedRole(u: PanelUser): Promise<PanelUser> {
  if (u.role === 'USER') return u;
  try {
    const { data } = await api.get('/auth/staff-check');
    const role = data?.role === 'ADMIN' || data?.role === 'SUPPORT' ? data.role : 'USER';
    return { ...u, role };
  } catch {
    return { ...u, role: 'USER' };
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<PanelUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!getToken()) {
        setLoading(false);
        return;
      }
      try {
        const { data } = await api.get('/auth/me');
        setUser(await withVerifiedRole(data.user));
      } catch {
        clearToken();
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const applyToken = (token: string, u: PanelUser) => {
    setToken(token);
    setUser({ ...u, role: 'USER' }); // provisoire : le rôle staff n'est accordé qu'après confirmation du serveur
    void withVerifiedRole(u).then(setUser);
  };

  const login = async (email: string, password: string, captchaToken?: string): Promise<LoginResult> => {
    const { data } = await api.post('/auth/login', { email, password, captchaToken });
    if (data.requires2fa) return { requires2fa: true, tempToken: data.tempToken };
    applyToken(data.token, data.user);
    return {};
  };

  const verify2fa = async (tempToken: string, code: string) => {
    const { data } = await api.post('/auth/login/2fa', { tempToken, code });
    applyToken(data.token, data.user);
  };

  const register = async (email: string, password: string, captchaToken?: string) => {
    const { data } = await api.post('/auth/register', { email, password, captchaToken });
    applyToken(data.token, data.user);
  };

  const refreshUser = async () => {
    if (!getToken()) return;
    try {
      const { data } = await api.get('/auth/me');
      setUser(await withVerifiedRole(data.user));
    } catch {
      /* non-bloquant — le prochain appel API échouera proprement si le token est mort */
    }
  };

  const logout = () => {
    clearToken();
    setUser(null);
    location.href = '/login';
  };

  return (
    <Ctx.Provider value={{ user, loading, login, verify2fa, register, applyToken, refreshUser, logout }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
