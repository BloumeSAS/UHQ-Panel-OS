# UHQ Panel OS

Open Source • Gratuit • By Bloume SAS — https://bloume.fr

Dépôt officiel : https://github.com/BloumeSAS/UHQ-Panel-OS
Documentation en ligne : https://uhq-panel-os-docs.bloume.fr
Dépôt de la documentation : https://github.com/BloumeSAS/UHQ-Panel-OS-Docs

UHQ Panel OS est une plateforme complète pour gérer des proxies et des sous-utilisateurs via un panneau d’administration moderne. Elle combine :

- une API NestJS robuste (`api/`)
- un panneau React/Vite moderne (`web/`)
- un moteur proxy TCP intégré
- une architecture d’addons pour étendre les capacités

Cette solution est développée en open source par Bloume SAS.

---

## 🚀 Vue d’ensemble

UHQ Panel OS fournit un panneau d’administration configurable pour :

- gérer les utilisateurs et sous-utilisateurs
- importer et surveiller des proxys
- activer des scrapers personnalisés
- visualiser le trafic et les journaux en temps réel
- déployer des addons et extensions libres

Le système est conçu pour rester simple à déployer en local, en container ou dans des environnements cloud.

---

## 🎯 Points forts

- Interface panel React moderne + backend NestJS
- Authentification JWT pour le panel et clé API legacy pour les routes `/api/v1/*`
- Architecture feature-based avec modules métier isolés
- Prise en charge des langues (i18n) pour le panel et l’API
- Addons modulaires (`addons/`) pour étendre le système
- Support des scrapers dynamiques et des listes privées par sous-user
- Démarrage possible même sans base de données entièrement connectée

---

## 📦 Structure du dépôt

- `api/` : backend NestJS, Prisma, API REST, moteur proxy
- `web/` : panneau React / Vite / Tailwind
- `addons/` : composants additionnels et extensions (ex. wallet)
- `docs/` : documentation du produit et de l’API
- `static/` : ressources publiques servies par NestJS
- `docker-compose.yml` : déploiement local standard
- `docker-compose.coolify.yml` : déploiement Coolify optimisé
- `Dockerfile` : image Docker unique

---

## ⚙️ Installation locale

### Prérequis

- Node.js 20+ (ou compatible)
- npm
- Docker / docker-compose (optionnel pour déploiement)

### Backend

```bash
cd api
npm install
npm run build
npm run start:dev
```

### Frontend

```bash
cd web
npm install
npm run dev
```

### Déploiement Docker

```bash
docker compose up --build
```

> Le backend NestJS sert le panel React buildé et expose l’API sur `:8000`.

---

## 🧩 Addons

UHQ Panel OS supporte une architecture d’addons open source et gratuite pour enrichir le produit sans modifier le cœur.

- Les addons sont stockés dans `addons/`
- Exemple inclus : `addons/wallet`
- Un addon peut contenir un backend, une interface web, une intégration de widget ou une extension du panel
- Les addons sont conçus pour être partagés, réutilisés et maintenus par la communauté

### Ajouter un addon

1. Créer un dossier dans `addons/`
2. Ajouter le manifest et les fichiers nécessaires
3. Suivre le format des addons existants

### Exemples d’usage

- modules de paiement
- widgets embarqués
- intégrations de source de données
- extensions de monitoring

---

## 🌍 Communauté

UHQ Panel OS est un projet open source. Nous encourageons les contributions, les retours et les développements d’addons.

- Dépôt officiel : https://github.com/BloumeSAS/UHQ-Panel-OS
- Site de la documentation : https://uhq-panel-os-docs.bloume.fr
- Dépôt de la documentation : https://github.com/BloumeSAS/UHQ-Panel-OS-Docs
- Ouvrez une issue pour signaler un bug, proposer une amélioration ou demander une nouvelle fonctionnalité
- Un bug non signalé ne peut pas être corrigé : utilisez les issues GitHub
- Créez une pull request pour ajouter des fonctionnalités, corriger des bogues ou améliorer la documentation
- Partagez vos addons, widgets et intégrations avec la communauté

### Support et reporting

- Bugs et problèmes : ouvrez une issue sur GitHub
- Demandes d’ajout ou questions : ouvrez une issue ou proposez un PR
- Pour les addons : documentez bien l’usage et le format dans `addons/` avant de soumettre
- Mise à jour : vérifiez les releases sur GitHub pour les dernières versions

### Contact et ressources

- Site : https://bloume.fr
- Documentation en ligne : https://uhq-panel-os-docs.bloume.fr
- GitHub principal : https://github.com/BloumeSAS/UHQ-Panel-OS
- GitHub documentation : https://github.com/BloumeSAS/UHQ-Panel-OS-Docs
- Licence : open source

---

## 🌐 Langues et i18n

Le projet est conçu pour être multilingue :

- le panel React utilise le dossier `web/src/lib/i18n/`
- l’API utilise `api/src/i18n/` avec `nestjs-i18n`
- ajouter une langue = copier `api/src/i18n/en/` vers une nouvelle langue + ajouter le fichier UI correspondant dans `web/src/lib/i18n/`

---

## 📚 Documentation

Consultez la [documentation en ligne](https://uhq-panel-os-docs.bloume.fr), le dépôt de documentation [UHQ-Panel-OS-Docs](https://github.com/BloumeSAS/UHQ-Panel-OS-Docs) ou localement dans `docs/` pour :

- l’installation avancée
- les variables d’environnement
- les routes API
- le développement d’addons
- l’architecture du système

---

## 🛡️ Règles importantes

- La configuration doit passer par `SettingsService` dans `api/src/config/settings.service.ts`
- Ne pas exposer les secrets en clair dans l’API
- `apiKey` ne doit pas être modifiée via `PUT /settings`
- Le logo reste toujours `/static/logo.png`
- Le panneau principal `/` appartient au SPA React, ne pas ajouter de route serveur à `/`

---

## 💡 À propos

UHQ Panel OS est construit pour proposer une solution gratuite, libre et extensible aux opérateurs de proxies. Bloume SAS maintient le projet et fournit une base stable pour développer des addons, des intégrations et des interfaces personnalisées.

Merci d’utiliser UHQ Panel OS.
