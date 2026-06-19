# Traductions de l'API

> ⚠️ Ce dossier (`messages.json`) n'est **plus chargé par rien** : `nestjs-i18n` est une
> dépendance du projet mais n'est jamais enregistré via `I18nModule` dans `app.module.ts`.
> Les messages d'erreur réels viennent de `api/src/common/utils/{fr,en}.ts`, lus par le
> helper `t()` / `tReq()` dans `api/src/common/utils/i18n.ts` (langue résolue via une
> `AsyncLocalStorage` remplie par `I18nMiddleware`). Pour ajouter ou traduire une clé,
> éditez `common/utils/{fr,en}.ts` — pas les fichiers de ce dossier.

## Sélection de la langue
Côté requête : `?lang=en`, en-tête `x-lang: en`, ou `Accept-Language`. Le panel envoie
automatiquement `x-lang` selon la langue choisie dans l'interface.

> Le panel React a son propre système de traduction dans `web/src/lib/i18n/` (UI).
> Ici ce sont uniquement les **messages d'API**.
