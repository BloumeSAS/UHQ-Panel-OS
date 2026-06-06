import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import axios from 'axios';

export interface SiteStatus {
  setupCompleted: boolean;
  registrationEnabled: boolean;
  siteName: string;
  logoUrl: string;
  defaultLang: string;
  version: string;
  captchaProvider?: string;
  captchaSiteKey?: string;
  captchaCapEndpoint?: string;
  resetPasswordEnabled?: boolean;
  maintenanceModeEnabled?: boolean;
}

export interface DbStatus {
  configured: boolean;
  source: 'env' | 'file' | 'none';
  bundled: boolean;
}

interface SiteCtx {
  db: DbStatus | null;
  status: SiteStatus | null;
  loading: boolean;
  /** true si le backend est injoignable (affichage dégradé). */
  unreachable: boolean;
  refresh: () => Promise<void>;
}

const Ctx = createContext<SiteCtx | null>(null);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function SiteProvider({ children }: { children: React.ReactNode }) {
  const [db, setDb] = useState<DbStatus | null>(null);
  const [status, setStatus] = useState<SiteStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [unreachable, setUnreachable] = useState(false);

  const refresh = useCallback(async () => {
    // 1) Base configurée ? (l'app tourne sans base). Petit retry : le backend
    //    peut être en train de démarrer.
    let dbStatus: DbStatus | null = null;
    for (let attempt = 0; attempt < 3 && !dbStatus; attempt++) {
      try {
        dbStatus = (await axios.get<{ status: string } & DbStatus>('/api/panel/setup/db-status')).data;
      } catch {
        if (attempt < 2) await sleep(1200);
      }
    }

    if (!dbStatus) {
      // Backend injoignable → on NE suppose PAS « installé ». On dirige vers le
      // flux d'installation (écran base) plutôt que vers /login.
      setUnreachable(true);
      setDb({ configured: false, source: 'none', bundled: false });
      setStatus(null);
      setLoading(false);
      return;
    }

    setUnreachable(false);
    setDb(dbStatus);
    if (!dbStatus.configured) {
      // Rien de configuré → écran de configuration base (puis setup wizard).
      setStatus(null);
      setLoading(false);
      return;
    }

    // 2) Base OK → état du site (setup wizard si pas d'admin, sinon login).
    try {
      const { data } = await axios.get<SiteStatus>('/api/panel/setup/status');
      setStatus(data);
    } catch {
      // Base configurée mais statut illisible → on suppose NON installé → setup.
      setStatus({
        setupCompleted: false,
        registrationEnabled: false,
        siteName: 'UHQ Panel OS',
        logoUrl: '/static/logo.png',
        defaultLang: 'fr',
        version: '',
      });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <Ctx.Provider value={{ db, status, loading, unreachable, refresh }}>{children}</Ctx.Provider>
  );
}

export function useSite() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useSite must be used within SiteProvider');
  return ctx;
}
