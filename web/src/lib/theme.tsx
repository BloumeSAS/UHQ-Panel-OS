import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useSite } from '@/lib/site';
import type { ThemeColors } from '@/lib/color';

type Theme = 'light' | 'dark';

interface ThemeCtx {
  theme: Theme;
  toggle: () => void;
  /** Thème custom (color pickers) actuellement appliqué, null = défaut (Claude/tangerine). */
  customColors: ThemeColors | null;
  /** Applique un aperçu local (non persisté) — utilisé par la page Settings. */
  preview: (colors: ThemeColors | null) => void;
  /** Persiste le thème custom en base (admin). */
  save: (colors: ThemeColors) => Promise<void>;
  /** Réinitialise au thème par défaut. */
  reset: () => Promise<void>;
}

const Ctx = createContext<ThemeCtx | null>(null);

function injectCustomTheme(colors: ThemeColors | null) {
  const styleId = 'uhq-custom-theme';
  let el = document.getElementById(styleId) as HTMLStyleElement | null;
  if (!colors) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement('style');
    el.id = styleId;
    document.head.appendChild(el);
  }
  const toVars = (obj: Partial<Record<string, string>>) =>
    Object.entries(obj)
      .map(([k, v]) => `--${k}: ${v};`)
      .join('\n');
  el.textContent = `:root {\n${toVars(colors.light)}\n}\n.dark {\n${toVars(colors.dark)}\n}`;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { status } = useSite();
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem('uhq_theme') as Theme) || 'light',
  );
  const [customColors, setCustomColors] = useState<ThemeColors | null>(null);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('uhq_theme', theme);
  }, [theme]);

  // Charge le thème custom depuis le statut public dès qu'il est disponible.
  useEffect(() => {
    const raw = (status as any)?.themeColors;
    if (raw) {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      setCustomColors(parsed);
      injectCustomTheme(parsed);
    }
  }, [status]);

  const value = useMemo<ThemeCtx>(
    () => ({
      theme,
      toggle: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')),
      customColors,
      preview: (colors) => {
        setCustomColors(colors);
        injectCustomTheme(colors);
      },
      save: async (colors) => {
        await api.put('/settings/theme', colors);
        setCustomColors(colors);
        injectCustomTheme(colors);
      },
      reset: async () => {
        await api.post('/settings/theme/reset');
        setCustomColors(null);
        injectCustomTheme(null);
      },
    }),
    [theme, customColors],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
