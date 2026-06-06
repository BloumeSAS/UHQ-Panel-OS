import { createContext, useContext, useEffect, useState } from 'react';
import { api, clearToken, getToken, setToken } from './api';

export interface PanelUser {
  id: string;
  email: string;
  role: 'ADMIN' | 'USER';
}

interface AuthCtx {
  user: PanelUser | null;
  loading: boolean;
  login: (email: string, password: string, captchaToken?: string) => Promise<void>;
  register: (email: string, password: string, captchaToken?: string) => Promise<void>;
  applyToken: (token: string, user: PanelUser) => void;
  logout: () => void;
}

const Ctx = createContext<AuthCtx | null>(null);

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
        setUser(data.user);
      } catch {
        clearToken();
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const applyToken = (token: string, u: PanelUser) => {
    setToken(token);
    setUser(u);
  };

  const login = async (email: string, password: string, captchaToken?: string) => {
    const { data } = await api.post('/auth/login', { email, password, captchaToken });
    applyToken(data.token, data.user);
  };

  const register = async (email: string, password: string, captchaToken?: string) => {
    const { data } = await api.post('/auth/register', { email, password, captchaToken });
    applyToken(data.token, data.user);
  };

  const logout = () => {
    clearToken();
    setUser(null);
    location.href = '/login';
  };

  return (
    <Ctx.Provider value={{ user, loading, login, register, applyToken, logout }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
