import fr from './fr';
import en from './en';

export interface LanguageMeta {
  code: string;
  name: string;
  nativeName: string;
  flag: string;
}

export interface Language {
  meta: LanguageMeta;
  t: Record<string, string>;
}

// Language Registry - simple for the community to extend by creating an language.ts file and importing it here
export const TRANSLATIONS: Record<string, Language> = {
  fr,
  en,
};

export const DEFAULT_LANG = 'fr';
