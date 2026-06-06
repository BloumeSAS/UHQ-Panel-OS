# Traductions de l'API (nestjs-i18n)

Messages d'erreur de l'API, gérés par [`nestjs-i18n`](https://nestjs-i18n.com).
Langues fournies : **`fr`** (défaut) et **`en`**. ⭐ Contributions bienvenues.

## Ajouter une langue
1. Copiez le dossier `en/` en `<code>/` (ex. `es/`, `de/`).
2. Traduisez les valeurs de `<code>/messages.json` (gardez les **clés** identiques).
3. PR. Aucune autre modification nécessaire : `nestjs-i18n` charge tous les dossiers.

## Sélection de la langue
Côté requête : `?lang=en`, en-tête `x-lang: en`, ou `Accept-Language`. Le panel envoie
automatiquement `x-lang` selon la langue choisie dans l'interface.

> Le panel React a son propre système de traduction dans `web/src/lib/i18n/` (UI).
> Ici ce sont uniquement les **messages d'API**.
