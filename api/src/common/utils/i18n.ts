import { Injectable, NestMiddleware, BadRequestException } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';
import { ValidationError } from 'class-validator';
import fr from './fr';
import en from './en';

// AsyncLocalStorage context to propagate request language context
export const i18nStorage = new AsyncLocalStorage<string>();

export const BACKEND_TRANSLATIONS: Record<string, any> = {
  fr,
  en,
};

/**
 * Traduit une clé via la langue stockée dans le contexte i18n de la requête courante.
 * Fallback sur 'fr'.
 */
export function t(key: string): string {
  const lang = i18nStorage.getStore() || 'fr';
  const dict = BACKEND_TRANSLATIONS[lang] || BACKEND_TRANSLATIONS['fr'];

  // Nettoie le préfixe facultatif de namespace
  let cleanKey = key;
  if (cleanKey.startsWith('messages.')) {
    cleanKey = cleanKey.substring(9);
  }

  const parts = cleanKey.split('.');
  let val: any = dict;
  for (const part of parts) {
    if (val && typeof val === 'object') {
      val = val[part];
    } else {
      return key;
    }
  }

  return typeof val === 'string' ? val : key;
}

/** Résout la langue depuis la requête (x-lang → ?lang → Accept-Language → fr). */
export function resolveLang(req: any): string {
  const raw = (
    req?.headers?.['x-lang'] ||
    req?.query?.lang ||
    (req?.headers?.['accept-language'] ?? '').toString().split(',')[0] ||
    'fr'
  )
    .toString()
    .slice(0, 2)
    .toLowerCase();
  return raw === 'en' ? 'en' : 'fr';
}

/**
 * Version de compatibilité pour les guards et le reste du code.
 * Le paramètre `i18n` (I18nService) est conservé dans la signature mais ignoré.
 */
export function tReq(i18n: any, req: any, key: string): string {
  return t(key);
}

/**
 * Middleware NestJS pour intercepter la locale et l'injecter dans le thread local context.
 */
@Injectable()
export class I18nMiddleware implements NestMiddleware {
  use(req: any, res: any, next: () => void) {
    const lang = resolveLang(req);
    i18nStorage.run(lang, () => {
      next();
    });
  }
}

/**
 * Traduit les erreurs de validation class-validator à la volée.
 */
export function translateValidationErrors(errors: ValidationError[]): BadRequestException {
  const lang = i18nStorage.getStore() || 'fr';

  const flattenErrors = (validationErrors: ValidationError[]): string[] => {
    const messages: string[] = [];
    for (const error of validationErrors) {
      if (error.constraints) {
        messages.push(...Object.values(error.constraints));
      }
      if (error.children && error.children.length > 0) {
        messages.push(...flattenErrors(error.children));
      }
    }
    return messages;
  };

  const rawMessages = flattenErrors(errors);
  const translatedMessages = rawMessages.map((msg) => {
    if (lang !== 'fr') return msg;

    if (msg.endsWith('must be a boolean value')) {
      const prop = msg.replace(' must be a boolean value', '');
      return `${prop} doit être un booléen`;
    }
    if (msg.endsWith('must be a string')) {
      const prop = msg.replace(' must be a string', '');
      return `${prop} doit être une chaîne de caractères`;
    }
    if (msg.endsWith('must be an email')) {
      const prop = msg.replace(' must be an email', '');
      return `${prop} doit être un e-mail valide`;
    }
    if (msg.includes('must be longer than or equal to')) {
      const prop = msg.split(' must be longer than or equal to')[0];
      const match = msg.match(/must be longer than or equal to (\d+) characters/);
      const chars = match ? match[1] : '8';
      return `${prop} doit contenir au moins ${chars} caractères`;
    }
    if (msg.endsWith('should not be empty')) {
      const prop = msg.replace(' should not be empty', '');
      return `${prop} ne doit pas être vide`;
    }
    if (msg.endsWith('must be a number')) {
      const prop = msg.replace(' must be a number', '');
      return `${prop} doit être un nombre`;
    }
    if (msg.endsWith('must be an integer number')) {
      const prop = msg.replace(' must be an integer number', '');
      return `${prop} doit être un entier`;
    }
    if (msg.includes('must be one of the following values:')) {
      const prop = msg.split(' must be one of the following values:')[0];
      const list = msg.split(' must be one of the following values:')[1];
      return `${prop} doit être l'une des valeurs suivantes :${list}`;
    }
    return msg;
  });

  return new BadRequestException({
    statusCode: 400,
    message: translatedMessages,
    error: 'Bad Request',
  });
}

