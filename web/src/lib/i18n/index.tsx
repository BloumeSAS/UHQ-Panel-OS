import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { TRANSLATIONS, DEFAULT_LANG } from './translations';

export type { LanguageMeta, Language } from './translations';

export { TRANSLATIONS as LANGUAGES, DEFAULT_LANG };

const STORAGE_KEY = 'uhq_lang';

interface I18nCtx {
  lang: string;
  setLang: (code: string) => void;
  languages: import('./translations').LanguageMeta[];
  t: (key: string) => string;
  /**
   * Fusionne des traductions d'addons au runtime.
   * Appelé par Layout.tsx quand les addons sont chargés.
   * Format : { "fr": { "addon.wallet.nav": "Mon solde" }, "en": {...} }
   */
  mergeAddonTranslations: (translations: Record<string, Record<string, string>>) => void;
}

const Ctx = createContext<I18nCtx | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<string>(
    () => localStorage.getItem(STORAGE_KEY) || DEFAULT_LANG,
  );

  // Traductions dynamiques des addons, par langue
  const [addonTranslations, setAddonTranslations] = useState<
    Record<string, Record<string, string>>
  >({});

  // Référence stable pour éviter des re-renders inutiles dans useEffect des consommateurs
  const addonRef = useRef(addonTranslations);
  addonRef.current = addonTranslations;

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const mergeAddonTranslations = useCallback(
    (translations: Record<string, Record<string, string>>) => {
      setAddonTranslations(translations);
    },
    [],
  );

  const value = useMemo<I18nCtx>(() => {
    const dict = TRANSLATIONS[lang] ?? TRANSLATIONS[DEFAULT_LANG];
    const addonDict = addonTranslations[lang] ?? {};
    const addonDictDefault = addonTranslations[DEFAULT_LANG] ?? {};

    return {
      lang,
      setLang: (code) => {
        localStorage.setItem(STORAGE_KEY, code);
        setLangState(code);
      },
      languages: Object.values(TRANSLATIONS).map((l) => l.meta),
      // Ordre de résolution : traductions panel → addon (langue courante) → addon (langue par défaut) → clé brute
      t: (key) =>
        dict.t[key] ??
        addonDict[key] ??
        addonDictDefault[key] ??
        TRANSLATIONS[DEFAULT_LANG].t[key] ??
        key,
      mergeAddonTranslations,
    };
  }, [lang, addonTranslations, mergeAddonTranslations]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}

/** Raccourci : hook de traduction. */
export function useT() {
  return useI18n().t;
}
