# Changelog

All notable changes to UHQ Panel OS are listed here (release notes are written in French). Full notes for every version: [GitHub Releases](https://github.com/BloumeSAS/UHQ-Panel-OS/releases) · [online changelog](https://uhq-panel-os-docs.bloume.fr/changelog).

## v2.15.x

### v2.15.2 — Dépôt professionnel et image Docker Hub
- Image Docker publiée aussi sur Docker Hub : `bloumesas/uhq-panel-os` (amd64 + arm64).
- Dépôt GitHub : README anglais + français, licence MIT, politique de sécurité, changelog, guide de contribution.
- [UHQ Panel OS v2.15.2](https://github.com/BloumeSAS/UHQ-Panel-OS/releases/tag/v2.15.2)

### v2.15.1 — IP bannies : liste blanche
- **IP bannies : liste blanche** — les IP autorisées (ex. le serveur de votre site) ne sont jamais bannies (auto-ban, anti-VPN, ban manuel).
- [UHQ Panel OS v2.15.1](https://github.com/BloumeSAS/UHQ-Panel-OS/releases/tag/v2.15.1)

### v2.15.0 — Addons Tickets, Parrainage et Statut
- **3 nouveaux addons officiels** : Tickets (support client), Parrainage (affiliation sur le Wallet) et Statut (page de statut publique avec détection automatique des pannes et redéploiements).
- La page publique `/status` du panel reprend l'addon « État des services » lorsqu'il est activé.
- `/health` expose `uptimeSec` ; 10 nouveaux modèles d'e-mails ; Orders 1.6.0.
- [UHQ Panel OS v2.15.0](https://github.com/BloumeSAS/UHQ-Panel-OS/releases/tag/v2.15.0)

## v2.14.x

### v2.14.2 — Pool de connexions BDD : 9 → 40
- **Panel indisponible sous forte charge** : pool de connexions à la base porté de 9 à 40 (variables `DB_POOL_SIZE` / `DB_POOL_TIMEOUT`).
- [UHQ Panel OS v2.14.2](https://github.com/BloumeSAS/UHQ-Panel-OS/releases/tag/v2.14.2)

### v2.14.1 — Import VPN : lignes invalides ignorées
- **Import de sources VPN** : les liens sans port ou hôte valide sont ignorés au lieu de faire échouer tout l'import.
- [UHQ Panel OS v2.14.1](https://github.com/BloumeSAS/UHQ-Panel-OS/releases/tag/v2.14.1)

### v2.14.0 — VPN : imports illimités
- VPN : imports sans limite (0 = tout importer), import par lots (10 850 configurations en 3 s).
- [UHQ Panel OS v2.14.0](https://github.com/BloumeSAS/UHQ-Panel-OS/releases/tag/v2.14.0)

## v2.13.x

### v2.13.0 — Sécurité : NestJS 11, Express 5, React Router 7 (0 vulnérabilité)
- Sécurité : migration vers NestJS 11 / Express 5 et React Router 7 ; `npm audit` des dépendances de production = 0 vulnérabilité (API et web).
- [UHQ Panel OS v2.13.0](https://github.com/BloumeSAS/UHQ-Panel-OS/releases/tag/v2.13.0)

## v2.12.x

### v2.12.1 — Sécurité : dépendances mises à jour
- Sécurité : dépendances mises à jour (API 23 → 3 vulnérabilités de production, web corrigé) ; reste NestJS 11 / react-router 7 (migrations majeures).
- [UHQ Panel OS v2.12.1](https://github.com/BloumeSAS/UHQ-Panel-OS/releases/tag/v2.12.1)

### v2.12.0 — VPN : rotation sur tout le pool, réglages dans Paramètres
- VPN : rotation des tunnels pour utiliser tout le pool (même des milliers de VPN), découverte rapide des vivants, réglages dans Paramètres → Scraper → VPN.
- [UHQ Panel OS v2.12.0](https://github.com/BloumeSAS/UHQ-Panel-OS/releases/tag/v2.12.0)

## v2.11.x

### v2.11.1 — VPN : sources suggérées et renouvellement automatique
- VPN : sources suggérées (listes publiques GitHub) en un clic et renouvellement automatique par tirage au hasard ; la durée de vie ne concerne que les VPN de la source.
- [UHQ Panel OS v2.11.1](https://github.com/BloumeSAS/UHQ-Panel-OS/releases/tag/v2.11.1)

### v2.11.0 — VPN : expiration, plafond réglable, SSH et TUIC
- VPN : durée de vie (expiration automatique), nombre maximum de tunnels réglable (1 à 100), protocoles SSH et TUIC.
- [UHQ Panel OS v2.11.0](https://github.com/BloumeSAS/UHQ-Panel-OS/releases/tag/v2.11.0)

## v2.10.x

### v2.10.0 — VPN : source URL / abonnement, protocole réel affiché
- VPN : nouvelle source « URL / abonnement » (liens V2Ray, listes base64, WireGuard, OpenVPN) avec mise à jour automatique ; le Pool affiche le vrai protocole (openvpn, wireguard, vless…).
- [UHQ Panel OS v2.10.0](https://github.com/BloumeSAS/UHQ-Panel-OS/releases/tag/v2.10.0)

## v2.9.x

### v2.9.2 — Correctif de build : aide VPN publiée
- Correctif de build (Coolify) : le fichier de l'aide VPN n'était pas publié ; il l'est maintenant.
- [UHQ Panel OS v2.9.2](https://github.com/BloumeSAS/UHQ-Panel-OS/releases/tag/v2.9.2)

### v2.9.1 — Sécurité VPN : liste blanche des directives OpenVPN
- Sécurité VPN : configurations OpenVPN filtrées par liste blanche (côté panel ET dans l'aide privilégiée) — mise à jour recommandée si vous utilisez la 2.9.0.
- [UHQ Panel OS v2.9.1](https://github.com/BloumeSAS/UHQ-Panel-OS/releases/tag/v2.9.1)

### v2.9.0 — VPN dans les catégories de proxies (VPNGate, OpenVPN, WireGuard, V2Ray)
- Nouveau : **VPN dans les catégories de proxies** — OpenVPN, WireGuard et V2Ray (VLESS, VMess, Trojan, Shadowsocks, Hysteria2), source automatique VPNGate avec choix du pays, import manuel. Chaque VPN est un proxy de la catégorie (IP fixe par VPN).
- [UHQ Panel OS v2.9.0](https://github.com/BloumeSAS/UHQ-Panel-OS/releases/tag/v2.9.0)

## v2.8.x

### v2.8.5 — Sauvegardes automatiques : planification fiabilisée
- Correctif : les sauvegardes automatiques sont reprogrammées toutes seules si la base n'était pas prête au démarrage (chien de garde de 60 s).
- [UHQ Panel OS v2.8.5](https://github.com/BloumeSAS/UHQ-Panel-OS/releases/tag/v2.8.5)

### v2.8.4 — Pays dans le username des proxies d'une catégorie (passerelles dc-{country})
- Catégorie « passerelle » : nouvelle case « Appliquer ce format aux proxies de la catégorie » — le pays du compte est injecté dans le username (ex. `dc-{country}` → `dc-fr`) au lieu d'un pays aléatoire.
- [UHQ Panel OS v2.8.4](https://github.com/BloumeSAS/UHQ-Panel-OS/releases/tag/v2.8.4)

### v2.8.3 — Codes d'erreur : codes HTTP des sites expliqués
- Page Codes d'erreur : nouvel onglet « Codes HTTP des sites » (303, 403, 429, Cloudflare…) avec explications et réponses prêtes pour les clients ; règle X-UHQ-Error présent = panel, absent = site.
- [UHQ Panel OS v2.8.3](https://github.com/BloumeSAS/UHQ-Panel-OS/releases/tag/v2.8.3)

### v2.8.2 — Vitrine : admin thémée et aperçu intégré
- Vitrine 1.2.0 : page d'administration synchronisée avec le thème du panel ; aperçu intégré ordinateur / mobile.
- [UHQ Panel OS v2.8.2](https://github.com/BloumeSAS/UHQ-Panel-OS/releases/tag/v2.8.2)

### v2.8.1 — Correctif page blanche, vitrine thémée et animée
- Correctif : page blanche après un clic depuis la vitrine (navigation confondue avec un appel d'addon) ; Vitrine 1.1.1 : thème du panel respecté + animations modernes.
- [UHQ Panel OS v2.8.1](https://github.com/BloumeSAS/UHQ-Panel-OS/releases/tag/v2.8.1)

### v2.8.0 — Addon Vitrine (page d'accueil publique)
- Nouvel addon officiel **Vitrine** (v1.0.0) : page d'accueil publique pour les visiteurs non connectés — catalogue par catégorie (Orders), pays disponibles, simulateur de prix, FAQ et contacts. Orders 1.5.1.
- [UHQ Panel OS v2.8.0](https://github.com/BloumeSAS/UHQ-Panel-OS/releases/tag/v2.8.0)

## v2.7.x

### v2.7.1 — Logo externe, diagnostic DNS, sections repliables
- Logo/icône du panel externes (CDN) enfin affichés ; nom + icône utilisés pour l'onglet du navigateur et /status (footer et À propos inchangés).
- Diagnostic : « Relancer » met à jour le DNS immédiatement (résolution sans cache).
- Pastille « mise à jour en cours » en bas à droite.
- Paramètres et Extensions : sections repliables (clic pour afficher les champs) ; Wallet 1.4.1 : recharge repliable.
- [UHQ Panel OS v2.7.1](https://github.com/BloumeSAS/UHQ-Panel-OS/releases/tag/v2.7.1)

### v2.7.0 — Rôle vérifié par le serveur, visite par catégorie, nouveaux guides d'hébergement
- Sécurité : rôle administrateur confirmé par le serveur (`/auth/staff-check`), pages d'administration chargées à la demande ; `GET /setup/db-probe` ne divulgue plus l'URL de la base une fois installé.
- Visite guidée **par catégorie** : relisez uniquement le pool de proxies, les paramètres, etc. depuis le bouton ? ou la page Aide.
- Documentation : nouveau design, guides d'hébergement (Coolify Docker Compose, Dokploy, VPS, Portainer, CapRover, Railway, pourquoi pas Vercel/Netlify/Heroku).
- [UHQ Panel OS v2.7.0](https://github.com/BloumeSAS/UHQ-Panel-OS/releases/tag/v2.7.0)

## v2.6.x

### v2.6.0 — Codes promo, recharge du solde, vente au Go, assistant d'installation
- Nouvel addon **Codes promo** (codes cadeau, bonus de recharge, réductions boutique) ; **Wallet 1.4** : recharge en ligne (offres, min/max, bonus par palier) ; **Orders 1.5** : vente au Go et codes promo dans le panier.
- Modèles d'e-mails utilisés par les addons (boutique, solde, codes promo) ; envoi réservé à la clé API maître.
- Documentation : assistant « Commencer l'installation », page E-mails, FAQ du jeton d'installation.
- [UHQ Panel OS v2.6.0](https://github.com/BloumeSAS/UHQ-Panel-OS/releases/tag/v2.6.0)

## v2.5.x

### v2.5.0 — E-mails complets, statut addons, diagnostic DNS, mises à jour multi-plateformes
- E-mails : 21 modèles activables, prévisualisables, testables et personnalisables (FR/EN) ; en-tête = nom + logo du site ; envoi par les addons via /api/v1/mail/send.
- Page /status : état des addons et des ports.
- Diagnostic : enregistrement DNS à créer (IP, type, nom) pour le domaine principal et ceux des catégories.
- Mise à jour automatique : préconfigurations Coolify, Dokploy, CapRover, Portainer, Watchtower, Render, Railway, Heroku, Vercel, Netlify, Pterodactyl.
- Sécurité : vraie IP du visiteur derrière Cloudflare dans « Sessions actives ».
- Audit : actions manquantes journalisées et traduites.
- [UHQ Panel OS v2.5.0](https://github.com/BloumeSAS/UHQ-Panel-OS/releases/tag/v2.5.0)

## v2.4.x

### v2.4.99 — Suivi de mise à jour en pastille
- Mise à jour du panel : « Masquer » réduit le suivi en pastille en bas à gauche (clic pour rouvrir) ; le suivi persiste après fermeture de l'onglet.
- [UHQ Panel OS v2.4.99](https://github.com/BloumeSAS/UHQ-Panel-OS/releases/tag/v2.4.99)

### v2.4.98 — Orders 1.4 : validation, renouvellement, PayPal F&F, factures PDF
- **Orders 1.4.0** : validation manuelle des commandes, renouvellement automatique (solde Wallet), paiement PayPal Amis & Famille (IPN), factures et reçus PDF, caractéristiques des produits en boutique.
- **Mes proxies** refait (statistiques, bande passante, expiration, commandes en attente de validation).
- Aide « aucun refus » : port réel du compte.
- [UHQ Panel OS v2.4.98](https://github.com/BloumeSAS/UHQ-Panel-OS/releases/tag/v2.4.98)

### v2.4.97 — Les proxies achetés apparaissent dans Mes proxies
- Boutique : le compte proxy livré est rattaché à l'acheteur (visible dans « Mes proxies »), avec réparation automatique des livraisons précédentes ; API v1 : owner_id
- [UHQ Panel OS v2.4.97](https://github.com/BloumeSAS/UHQ-Panel-OS/releases/tag/v2.4.97)

### v2.4.96 — Sécurité Wallet/Orders et interface pro
- Sécurité : Wallet et Orders vérifient désormais les jetons auprès du panel (v1.3.0) — mise à jour recommandée ; correctif de création de produit avec catégorie ; nouvelle interface Wallet et Boutique
- [UHQ Panel OS v2.4.96](https://github.com/BloumeSAS/UHQ-Panel-OS/releases/tag/v2.4.96)

### v2.4.95 — Reseller : clés API uhq_ et UHQ- acceptées
- Addon Reseller : les clés API commençant par uhq_ ou UHQ- sont acceptées (v1.2.1)
- [UHQ Panel OS v2.4.95](https://github.com/BloumeSAS/UHQ-Panel-OS/releases/tag/v2.4.95)

### v2.4.94 — Pool : Go et mot de passe UHQ.Monster en un clic
- Page Pool : fenêtre UHQ.Monster par proxy (ajouter/retirer des Go, réinitialiser le mot de passe) ; addon Reseller 1.2.0
- [UHQ Panel OS v2.4.94](https://github.com/BloumeSAS/UHQ-Panel-OS/releases/tag/v2.4.94)

### v2.4.93 — Clé API du Reseller dans Paramètres → Extensions
- Addon UHQ.Monster Reseller : la clé API se règle dans Paramètres → Extensions du panel
- [UHQ Panel OS v2.4.93](https://github.com/BloumeSAS/UHQ-Panel-OS/releases/tag/v2.4.93)

### v2.4.92 — Nouvel addon UHQ.Monster Reseller
- Nouvel addon officiel UHQ.Monster Reseller (achat de proxies, ajout/retrait de Go, import automatique dans une catégorie) ; la page Pool accueille les widgets d'addons
- [UHQ Panel OS v2.4.92](https://github.com/BloumeSAS/UHQ-Panel-OS/releases/tag/v2.4.92)

### v2.4.91 — Fallback par catégorie dans les paramètres (plus de fallback global)
- Fallback global retiré : fallback réglé par catégorie dans Paramètres → Scraper ; l'ancien réglage devient « Proxy sortant du scraper »
- [UHQ Panel OS v2.4.91](https://github.com/BloumeSAS/UHQ-Panel-OS/releases/tag/v2.4.91)

### v2.4.90 — Fallback par catégorie, erreurs JSON, fiche des codes d'erreur
- Fallback propre ou désactivé par catégorie ; erreurs JSON uniformes (l'erreur réelle d'un proxy amont n'est jamais montrée) ; fiche « Codes d'erreur » dans le panel
- [UHQ Panel OS v2.4.90](https://github.com/BloumeSAS/UHQ-Panel-OS/releases/tag/v2.4.90)

### v2.4.89 — Afficher le jeton du webhook de mise à jour
- Paramètres : le jeton d'API du webhook de mise à jour peut de nouveau être affiché
- [UHQ Panel OS v2.4.89](https://github.com/BloumeSAS/UHQ-Panel-OS/releases/tag/v2.4.89)

### v2.4.88 — Mise à jour auto : jeton de webhook invalide
- Mise à jour automatique : jeton d'API nettoyé et vérifié, messages clairs pour un jeton ou une URL de webhook invalide
- [UHQ Panel OS v2.4.88](https://github.com/BloumeSAS/UHQ-Panel-OS/releases/tag/v2.4.88)

### v2.4.87 — Outils clients, support et installation guidée
- Générateur de lignes de connexion (host:port:user:pass, curl, Python, Node, Playwright…) pour les admins et les clients
- « Pourquoi ça ne marche pas ? » : journal des refus de connexion par compte, avec la cause et la solution
- Alertes e-mail aux clients (quota 80 %/100 %, expiration) ; infos de support sans secret ; fenêtre « Nouveautés » ; mode démo ; page Aide
- Installation guidée (vérification domaine/port 990/Cloudflare) et vérification d'une sauvegarde avant restauration
- [UHQ Panel OS v2.4.87](https://github.com/BloumeSAS/UHQ-Panel-OS/releases/tag/v2.4.87)

### v2.4.86 — Mise à jour automatique : plus de coupure Cloudflare (tâche de fond)
- Mise à jour automatique : le déclenchement (sauvegarde + webhook) est une tâche de fond suivie à l'écran, ce qui évite les coupures Cloudflare (520/524) sur les grosses bases
- [UHQ Panel OS v2.4.86](https://github.com/BloumeSAS/UHQ-Panel-OS/releases/tag/v2.4.86)

### v2.4.85 — Tableau de bord synchronisé, alertes de surveillance, durcissement du moteur
- Tableau de bord : un seul instantané cohérent pour toutes les valeurs en direct, indicateur d'état, détection de flux figé, secours HTTP
- Surveillance : alertes moteur/base/disque/sauvegardes (cloche, Discord/Slack/BloumeChat, e-mail) et heartbeat externe
- Moteur proxy : plafond de connexions non authentifiées, en-têtes bornés, amonts internes refusés (ALLOW_PRIVATE_UPSTREAMS)
- [UHQ Panel OS v2.4.85](https://github.com/BloumeSAS/UHQ-Panel-OS/releases/tag/v2.4.85)

### v2.4.84 — Test de connexion : bon port et diagnostic précis
- Test de connexion : utilise le port dédié du compte ou de sa catégorie, diagnostique les comptes bloqués/expirés/quota/IP autorisées
- Moteur : les connexions du serveur lui-même (test) ne sont plus auto-bannies
- [UHQ Panel OS v2.4.84](https://github.com/BloumeSAS/UHQ-Panel-OS/releases/tag/v2.4.84)

### v2.4.83 — Mise à jour automatique depuis À propos (progression et reconnexion)
- Bouton « Mettre à jour maintenant » dans À propos : déclenche le webhook de déploiement (Coolify), progression et reconnexion automatique
- Réglages Paramètres → Général → Mise à jour automatique ; sauvegarde avant mise à jour en option ; /health expose la version
- [UHQ Panel OS v2.4.83](https://github.com/BloumeSAS/UHQ-Panel-OS/releases/tag/v2.4.83)

### v2.4.82 — Sécurité : jeton d'installation aussi si l'état est inconnu
- Sécurité : le jeton d'installation est aussi généré quand l'état de l'installation ne peut pas être vérifié au démarrage (base injoignable)
- [UHQ Panel OS v2.4.82](https://github.com/BloumeSAS/UHQ-Panel-OS/releases/tag/v2.4.82)

### v2.4.81 — Jeton d'installation généré automatiquement
- Jeton d'installation généré automatiquement et affiché dans les logs (TOKEN D'INSTALLATION) ; supprimé après l'installation
- Un panel déjà installé n'est pas concerné ; SETUP_TOKEN impose une valeur, SETUP_TOKEN=off désactive
- [UHQ Panel OS v2.4.81](https://github.com/BloumeSAS/UHQ-Panel-OS/releases/tag/v2.4.81)

### v2.4.80 — Mise en service : checklist, diagnostic, test de connexion, page d'état, jeton d'installation
- Mise en service : checklist « Premiers pas », bandeau de sauvegarde, diagnostic (DNS/Cloudflare, ports, HTTPS…), test de connexion d'un compte
- Page d'état publique /status et jeton d'installation SETUP_TOKEN pour protéger /setup
- Sécurité : liens e-mail construits depuis la configuration (URL publique du panel), limites de débit sur l'inscription et la réinitialisation
- [UHQ Panel OS v2.4.80](https://github.com/BloumeSAS/UHQ-Panel-OS/releases/tag/v2.4.80)

### v2.4.79 — Visite guidée du panel (tutoriel de A à Z)
- Visite guidée interactive du panel (≈45 étapes), lancée à la fin de l'installation et relançable via l'icône ?
- Couvre l'installation, l'architecture, les ports, chaque page et chaque onglet des Paramètres (FR/EN, mobile, clavier)
- [UHQ Panel OS v2.4.79](https://github.com/BloumeSAS/UHQ-Panel-OS/releases/tag/v2.4.79)

### v2.4.78 — Restauration JSON depuis /setup + import de tous les réglages
- Restauration depuis /setup : acceptation des sauvegardes JSON du panel (en plus du .tar.gz PostgreSQL 16)
- Import de réglages : tous les réglages (secrets et clé API compris), formats plat / export / sauvegarde complète
- Restauration d'un fichier partiel : seules les tables présentes sont remplacées
- [UHQ Panel OS v2.4.78](https://github.com/BloumeSAS/UHQ-Panel-OS/releases/tag/v2.4.78)

### v2.4.77 — Redémarrage serveur : attente de la base (thème, clé API, addons conservés)
- Démarrage : le panel attend que PostgreSQL soit prêt (fini le thème/clé API/addons perdus après un redémarrage du serveur)
- La clé API n'est jamais régénérée si les réglages n'ont pas pu être lus
- Identifiants des proxys masqués dans les alertes « proxy mort »
- [UHQ Panel OS v2.4.77](https://github.com/BloumeSAS/UHQ-Panel-OS/releases/tag/v2.4.77)

### v2.4.76 — Restauration d'une sauvegarde depuis /setup
- Restauration d'une sauvegarde complète (.tar.gz PostgreSQL 16) directement depuis la page `/setup`
- Envoi par morceaux avec reprise, restauration atomique, verrouillée après l'installation
- [UHQ Panel OS v2.4.76](https://github.com/BloumeSAS/UHQ-Panel-OS/releases/tag/v2.4.76)

### v2.4.75 — Durcissement de sécurité d'Analytics et synchro du thème vérifiée
- **Sécurité des statistiques** : un utilisateur SUPPORT ne voit plus les e-mails des propriétaires de comptes ni les IP bannies (réservés aux ADMIN), et ne peut plus les sonder par la recherche.
- **Addon Analytics 1.1.1** : cache indexé par l'empreinte du jeton complet (un jeton forgé ne peut plus lire les réponses d'un autre utilisateur), jeton refusé en query string, CORS désactivé, conteneur non-root. Audit vérifié par 36 contrôles automatisés.
- Synchronisation du thème panel / addon vérifiée (clair, sombre, bascule en direct, couleurs personnalisées).
- [UHQ Panel OS v2.4.75](https://github.com/BloumeSAS/UHQ-Panel-OS/releases/tag/v2.4.75)

### v2.4.74 — Analytics 1.1.0 : navigation façon Paramètres et traduction complète
- **Addon Analytics 1.1.0** : navigation reprenant la structure de la page Paramètres (menu latéral groupé, chapeau de section) et traduction complète français / anglais, y compris les valeurs renvoyées par le panel (pays, motifs d'erreur, motifs de bannissement).
- L'API de statistiques du panel ne renvoie plus de libellés en français dans ses données.
- [UHQ Panel OS v2.4.74](https://github.com/BloumeSAS/UHQ-Panel-OS/releases/tag/v2.4.74)

### v2.4.73 — Nouvel addon officiel Analytics (70+ graphiques)
- **Nouvel addon officiel : Analytics** (gratuit), embarqué dans l'image : **Extensions → Analytics → Activer**. Plus de 70 graphiques, 8 sections d'analyse, heures et jours les plus actifs, constats automatiques, page « Mon activité » pour chaque utilisateur. Voir [la page de l'addon](/addons/official/analytics).
- L'API de statistiques du panel (`/api/panel/analytics/*`) est enrichie : comparaison avec la période précédente, chronologie horaire, répartitions, hausses et baisses, tranches de la journée, semaine / week-end.
- [UHQ Panel OS v2.4.73](https://github.com/BloumeSAS/UHQ-Panel-OS/releases/tag/v2.4.73)

### v2.4.72 — Base de l'addon Analytics : historique horaire et API de statistiques
- **Base de l'addon Analytics** : le panel enregistre désormais la consommation de chaque compte **par heure** (heure de pointe, jours les plus actifs, fenêtre la plus calme) et l'**historique des cycles** du checker et du scraper. Rétention de 90 jours, purge automatique.
- **Nouvelle API de statistiques en lecture seule** : `/api/panel/analytics/*` (rôles ADMIN et SUPPORT) et `/api/panel/me/proxies/:id/activity` (un utilisateur ne voit que ses propres comptes).
- L'historique horaire se constitue à partir de cette version ; les jours de la semaine et la tendance journalière couvrent déjà tout l'historique.
- [UHQ Panel OS v2.4.72](https://github.com/BloumeSAS/UHQ-Panel-OS/releases/tag/v2.4.72)

### v2.4.71 — Version corrective (numéro de version) + script de publication
- Version corrective : la v2.4.70 affichait encore « v2.4.69 » dans le pied de page (numéro de version non mis à jour). Contenu identique à la v2.4.70, avec la version 2.4.71 partout.
- Nouveau script de publication `npm run release` : versions, commit, push, tag, release GitHub et changelog de la doc en une seule commande, avec vérification finale.
- [UHQ Panel OS v2.4.71](https://github.com/BloumeSAS/UHQ-Panel-OS/releases/tag/v2.4.71)

## v2.4.x

### v2.4.70 — Captcha CAP : instrumentation débloquée (unsafe-eval)
- Le défi d'instrumentation de CAP évalue du JavaScript dans une iframe qui hérite de la CSP du panel : il était bloqué (« Instrumentation timeout », puis 429 sur `/redeem`). `'unsafe-eval'` est ajouté à `script-src` **uniquement quand le captcha actif est CAP** ; avec les autres captchas ou sans captcha, la CSP reste stricte.
- ⚠ Cette version affichait encore « v2.4.69 » dans le pied de page (numéro de version non mis à jour) : utiliser la v2.4.71, qui contient le même correctif.
- [UHQ Panel OS v2.4.70](https://github.com/BloumeSAS/UHQ-Panel-OS/releases/tag/v2.4.70)

### v2.4.69 — Captcha CAP : fin du blocage sur « Verifying… »
- Le script de vérification exécuté par CAP dans une iframe isolée était bloqué par la CSP, faute de nonce. Chaque page du panel reçoit maintenant le nonce CSP de la réponse (`<meta name="csp-nonce">`), que le widget transmet à CAP (`window.CAP_SCRIPT_NONCE`). Les scripts inline sans nonce restent bloqués.
- [UHQ Panel OS v2.4.69](https://github.com/BloumeSAS/UHQ-Panel-OS/releases/tag/v2.4.69)

### v2.4.68 — Captcha CAP de nouveau fonctionnel
- Depuis le durcissement des en-têtes de sécurité (v2.4.60), la CSP bloquait le captcha CAP : instance auto-hébergée refusée, Web Worker `blob:` bloqué, WebAssembly bloqué.
- L'URL de l'instance CAP configurée dans Paramètres est désormais autorisée automatiquement ; ajout de `worker-src 'self' blob:` et `'wasm-unsafe-eval'` (WebAssembly uniquement : le `eval()` JavaScript reste bloqué).
- [UHQ Panel OS v2.4.68](https://github.com/BloumeSAS/UHQ-Panel-OS/releases/tag/v2.4.68)

### v2.4.67 — Multiplicateur de consommation par catégorie
- Nouvelle option **Multiplicateur de consommation** dans Catégories proxies : chaque octet des comptes de la catégorie compte ×N (conso, quota, historique). Exemple ×2 : 500 Mo réels = 1 Go consommé.
- Défaut ×1 ; décimales acceptées ; une valeur inférieure à 1 fait une remise. Le graphique global de bande passante reste en trafic réel.
- [UHQ Panel OS v2.4.67](https://github.com/BloumeSAS/UHQ-Panel-OS/releases/tag/v2.4.67)

### v2.4.66 — Tableau des soldes retiré de la page Comptes proxy
- L'extension Wallet (v1.2.3) n'affiche plus le tableau « Soldes des comptes » sur la page Comptes proxy. Les soldes restent gérables depuis « Gestion des soldes ».
- Les extensions embarquées rechargent leur manifest au démarrage du panel : une mise à jour d'extension s'applique immédiatement, et non plus après l'actualisation horaire.
- [UHQ Panel OS v2.4.66](https://github.com/BloumeSAS/UHQ-Panel-OS/releases/tag/v2.4.66)

### v2.4.65 — Connexion ~5× plus rapide, Go décimal sans changer l'affichage
- **Connexion plus rapide** : le choix du proxy lisait la latence (en millisecondes) comme des secondes. Les proxies fraîchement scrapés, souvent morts, passaient donc devant les proxies éprouvés, et chaque connexion perdait ~1,5 s. C'est corrigé, avec en plus : course continue (remplacement immédiat + renforts toutes les 300 ms), proxy en échec retiré tout de suite, latence apprise en direct, cache DNS, protocole mémorisé pour les listes privées. En local : tunnel prêt en 0,30 s (médiane) au lieu de ~1,5-2 s.
- **Proxies qui interceptent le HTTPS** (faux certificat) : détectés, mis hors service, puis blacklistés.
- **Go décimal partout** (1 Go = 10⁹ octets, comme les resellers), **sans changer aucun chiffre affiché** : conversion unique des données existantes, et seul le nouveau trafic est compté en Go décimaux.
- [UHQ Panel OS v2.4.65](https://github.com/BloumeSAS/UHQ-Panel-OS/releases/tag/v2.4.65)

### v2.4.64 — Consommation alignée sur la facturation du reseller
- Les octets d'un compte sont mesurés sur la connexion avec le proxy upstream, là où le reseller mesure. Négociation CONNECT/SOCKS et tentatives échouées incluses. Vérifié contre un reseller simulé : **écart 0 octet** en HTTP, en tunnel HTTPS et en parallèle.
- La limite de débit (`bandwidthLimit`) s'applique au compte entier, plus à chaque connexion.
- HTTP non chiffré : une requête par connexion (attribution par domaine exacte, blocage de domaines non contournable).
- Le graphique global du trafic ne perd plus de données après un reset ou la suppression d'un compte.
- [UHQ Panel OS v2.4.64](https://github.com/BloumeSAS/UHQ-Panel-OS/releases/tag/v2.4.64)

### v2.4.63 — Comptage de bande passante exact par compte, quota appliqué en direct
- **Facturation à la livraison** : un octet n'est compté qu'une fois réellement transmis au client (contrôle de flux + fermeture propre). Avant, un client lent pouvait recevoir 0,5 Mo d'un fichier de 8 Mo (téléchargement tronqué) tout en étant facturé 8 Mo, et un téléchargement annulé était facturé en entier.
- **Octets jusqu'ici non comptés** : en-têtes de la requête proxy et réponse `200 Connection established` des tunnels HTTPS.
- **Quota en temps réel** : vérifié à la connexion et à chaque paquet ; les tunnels ouverts d'un compte sont coupés dès que son quota est atteint, ou qu'il est bloqué, expiré ou supprimé (avant : contrôle uniquement à la connexion, sur un cache vieux de jusqu'à 60 s).
- **Plus de trafic perdu** : retry en cas de raté de la base, écriture atomique par compte, écriture finale à l'arrêt/redéploiement ; chaque octet est daté du jour où il a été consommé.
- Débit live sur une vraie fenêtre glissante ; le reset n'ajoute plus le trafic pré-reset ; Rapports sans décalage d'un jour ; « Mes proxies » agrégé sur toute la période ; threads des sessions statiques comptés sur le vrai compte.
- Vérifié de bout en bout : compteurs en base identiques à l'octet près aux octets échangés par le client.
- [UHQ Panel OS v2.4.63](https://github.com/BloumeSAS/UHQ-Panel-OS/releases/tag/v2.4.63)

### v2.4.62 — Fix régression : les addons embarqués étaient cassés depuis la v2.4.60
- Le durcissement des en-têtes de sécurité (v2.4.60) posait `Referrer-Policy: no-referrer`, qui supprimait l'en-tête `Referer` sur toutes les requêtes — y compris les appels API internes des addons embarqués (Wallet, Orders), dont le routage (`AddonProxyMiddleware`) repose entièrement sur cet en-tête. Résultat : "Cannot GET /api/wallet/all" et équivalent pour Orders, addons inutilisables.
- Corrigé avec `strict-origin-when-cross-origin` (valeur par défaut moderne des navigateurs) — envoie l'URL complète en same-origin (ce dont le proxy a besoin), rien de plus en cross-origin.
- Vérifié en direct : Wallet et Orders s'affichent de nouveau correctement.
- [UHQ Panel OS v2.4.62](https://github.com/BloumeSAS/UHQ-Panel-OS/releases/tag/v2.4.62)

### v2.4.61 — CSP durcie (0 finding nuclei), fix définitif bouton Arrêter Checker/Scraper
- **CSP** : `script-src` sans `'unsafe-inline'` (nonce par requête pour `/docs`), `Cross-Origin-Embedder-Policy: credentialless`, ajout de `Permissions-Policy`. Vérifié avec nuclei : 11 → 3 → **0** finding.
- **Checker / Scraper** : confirmé en direct que le scraper pouvait afficher "Arrêter" en rouge avec `running: false` (aucun cycle en cours, juste en attente du prochain cycle planifié). Remplacé le bouton Démarrer/Arrêter par un toggle explicite "Boucle automatique", séparé de l'indicateur "cycle en cours" — élimine l'ambiguïté.
- [UHQ Panel OS v2.4.61](https://github.com/BloumeSAS/UHQ-Panel-OS/releases/tag/v2.4.61)

### v2.4.60 — Sécurité : en-têtes HTTP (CSP, X-Frame-Options, HSTS…)
- Ajout des en-têtes de sécurité HTTP manquants (signalés par un scan nuclei, sévérité "info") : `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy`, `Strict-Transport-Security`, `X-Permitted-Cross-Domain-Policies`.
- CSP configurée sur mesure (autorise `/docs`, les fournisseurs captcha, flagcdn.com — bloque le reste).
- [UHQ Panel OS v2.4.60](https://github.com/BloumeSAS/UHQ-Panel-OS/releases/tag/v2.4.60)

### v2.4.59 — Réglage démarrage auto scraper, fix traductions Journal d'audit, note setup local
- **Scraper** : nouveau réglage "Démarrage automatique au boot" (pendant du réglage Checker) — jusqu'ici la boucle démarrait toujours 30s après le boot sans possibilité de l'en empêcher.
- **Assistant de configuration** : note ajoutée — un environnement local permet de tester l'interface, mais le moteur proxy nécessite un vrai domaine (DNS) pour fonctionner en dehors des tests locaux.
- **Journal d'audit** : le tableau de détail (Clé/Avant/Après) était du texte français figé, jamais traduit — corrigé.
- [UHQ Panel OS v2.4.59](https://github.com/BloumeSAS/UHQ-Panel-OS/releases/tag/v2.4.59)

### v2.4.58 — Sécurité : validation stricte des couleurs de thème sur /docs
- Le sync de thème de `/docs` (v2.4.57) interpolait les valeurs HSL du thème custom sans validation dans un littéral JS — corrigé, chaque composant est désormais strictement validé avant interpolation.
- [UHQ Panel OS v2.4.58](https://github.com/BloumeSAS/UHQ-Panel-OS/releases/tag/v2.4.58)

### v2.4.57 — Fix boutons Démarrer/Arrêter, thème /docs synchronisé, exemples de réponse API
- **Checker / Scraper** : le bouton "Arrêter" pouvait s'afficher avant même que la boucle automatique ait réellement démarré (état désiré vs état réel confondus). Corrigé.
- **`/docs`** ne suivait pas le thème custom du panel (palette tangerine figée en dur) — même bug déjà corrigé côté addons. Corrigé.
- **Documentation API `/api/v1`** : exemples de réponse ajoutés sur tous les endpoints (sub-user, me, user, stats, common) — remplace le "No Body" affiché jusqu'ici.
- [UHQ Panel OS v2.4.57](https://github.com/BloumeSAS/UHQ-Panel-OS/releases/tag/v2.4.57)

### v2.4.56 / Wallet v1.2.2 — Extensions au tableau de bord, scraper stop/live, captcha CAP réécrit
- **Tableau de bord** : les widgets d'addon ne s'affichent plus sous "Comptes actifs" — nouvel onglet **Extensions** dédié.
- **Scraper** : boutons Démarrer/Arrêter pour la boucle automatique + modale "Stats en direct" (progression du cycle en cours).
- **Logs → Historique fichiers** : recherche, compteur fichiers/taille, bouton rafraîchir, bandeau expliquant le besoin d'un volume Docker persistant.
- **Captcha CAP réécrit** pour correspondre à l'implémentation de référence (uhq.monster) : `@cap.js/widget` en vraie dépendance npm montée déclarativement, au lieu d'un `<script>` CDN + DOM manuel.
- **Modale "Historique des versions"** : élargie, texte qui revient à la ligne.
- **Page Checker** : la carte de statut ne chevauche plus ses boutons sur écran étroit.
- **Wallet** : "Voir l'historique" en modale paginée, tableau des comptes paginé.
- [UHQ Panel OS v2.4.56](https://github.com/BloumeSAS/UHQ-Panel-OS/releases/tag/v2.4.56) · [UHQ-Addon-Wallet v1.2.2](https://github.com/BloumeSAS/UHQ-Addon-Wallet/releases/tag/v1.2.2)

### v2.4.55 / Wallet v1.2.1 / Orders v1.2.7 — Fin des boîtes de dialogue navigateur natives
- **Dernières confirmations "brutes" du navigateur remplacées par des modales thémées**, dans le panel et les deux addons officiels : Catégories proxies (vider/supprimer — le dialogue signalé par capture d'écran), Extensions, Pool, Sources scraper, Utilisateurs, Paramètres (restaurer/supprimer sauvegarde, régénérer clé API), Boutique (suppression produit), Wallet (suppression transaction/historique).
- Le panel et les addons n'affichent plus aucune fenêtre `window.confirm()` — tout passe désormais par une modale cohérente avec le thème (clair/sombre).
- [UHQ Panel OS v2.4.55](https://github.com/BloumeSAS/UHQ-Panel-OS/releases/tag/v2.4.55) · [UHQ-Addon-Wallet v1.2.1](https://github.com/BloumeSAS/UHQ-Addon-Wallet/releases/tag/v1.2.1) · [UHQ-Addon-Orders v1.2.7](https://github.com/BloumeSAS/UHQ-Addon-Orders/releases/tag/v1.2.7)

### v2.4.54 — Sécurité : confiance en l'en-tête Cloudflare désormais explicite
- Le fix "tracking IP Cloudflare" de la v2.4.53 faisait confiance à `CF-Connecting-IP` sans condition — falsifiable si l'origine reste joignable en direct. Nouveau réglage **"Faire confiance à l'en-tête Cloudflare"** (Paramètres → Sécurité), désactivé par défaut ; à n'activer que si l'origine est strictement fermée à Cloudflare.
- [UHQ Panel OS v2.4.54](https://github.com/BloumeSAS/UHQ-Panel-OS/releases/tag/v2.4.54)

### v2.4.53 — Markdown changelog, scrollbars thématisées, checker start/stop, fix IP Cloudflare
- **Changelog en Markdown** : la modale "Historique des versions" (À propos) rend désormais les notes de version GitHub en vrai Markdown au lieu de texte brut.
- **Scrollbars fines et thématisées** partout sur le site (verticales et horizontales).
- **Sidebar admin réorganisée** : "Gestion" séparée en "Gestion" (comptes/pools) et "Collecte & sécurité" (scraper/checker/IP bannies).
- **IP bannies** et **sources scraper** : recherche + pagination.
- **Checker** : réglages "Démarrage automatique au boot" et "Prioriser les pays inconnus" ; la boucle automatique peut être arrêtée/redémarrée depuis la page Checker.
- **Fix** : le suivi des IP de connexion ne distinguait pas les visiteurs derrière Cloudflare (toutes les connexions semblaient venir d'IP Cloudflare). Priorité désormais à l'en-tête `CF-Connecting-IP`.
- [UHQ Panel OS v2.4.53](https://github.com/BloumeSAS/UHQ-Panel-OS/releases/tag/v2.4.53)

### v2.4.52 — Sécurité : clés API à portée réduite pouvaient accéder à tous les comptes proxy
- **Important** : une clé API auto-générée par un compte utilisateur standard (page "Clés API") pouvait lire/modifier **tous** les comptes proxy du panel — y compris les identifiants en clair — via `/api/v1/sub-user/*`, route censée être réservée à la clé maître admin. Corrigé : ces routes (ainsi que `/api/v1/user/balance` et `/api/v1/stats/*`, hors agrégats globaux) exigent désormais explicitement la clé maître.
- `/api/v1/me/*` (l'équivalent sûr, filtré par propriétaire) gagne les actions d'écriture légitimes pour un utilisateur sur ses propres comptes : IPs autorisées, domaines bloqués.
- La page Clés API n'affiche plus aux comptes non-admin que les scopes réellement sûrs et utiles, avec une nouvelle documentation intégrée expliquant chaque scope.
- Correction rétroactive : les clés déjà créées restent utilisables mais ne peuvent plus atteindre les routes globales, sans action requise.
- [UHQ Panel OS v2.4.52](https://github.com/BloumeSAS/UHQ-Panel-OS/releases/tag/v2.4.52)

### v2.4.51 — Fix : onglet Extensions toujours vide malgré Boutique activée
- **Paramètres → Extensions n'affichait jamais rien**, même avec l'addon Boutique (Orders) activé : la détection comparait l'identifiant interne (UUID Prisma) de l'addon à la chaîne `"orders"`, qui ne correspond jamais — le panneau de réglages Stripe/NOWPayments ne pouvait donc jamais apparaître. Corrigé : la détection se fait désormais sur l'URL interne de l'addon, fixée de façon fiable par le panel lui-même à l'activation.
- [UHQ Panel OS v2.4.51](https://github.com/BloumeSAS/UHQ-Panel-OS/releases/tag/v2.4.51)

### v2.4.50 — Fix : widgets d'addon vides + captcha CAP qui semblait se réinitialiser
- **Widgets d'addon vides** sur le tableau de bord (ex. "Soldes des comptes" et "Commandes" sous l'onglet Comptes actifs) : `AddonPageBar`/`AddonWidgetSlot` lisaient le JWT depuis la mauvaise clé de `localStorage` (`token` au lieu de `uhq_token`), donc l'iframe du widget se chargeait sans authentification et restait vide. Corrigé — les widgets d'addon embarqués s'affichent maintenant correctement partout.
- **Captcha CAP page de connexion** : le widget CAP réaffiche parfois sa case à cocher juste après l'avoir validée, comme si rien n'avait été résolu (le jeton déjà capturé restait pourtant valide en interne). La confirmation "Vérification réussie" est désormais pilotée par l'état React plutôt qu'une manipulation du DOM, qu'un re-rendu pouvait écraser.
- [UHQ Panel OS v2.4.50](https://github.com/BloumeSAS/UHQ-Panel-OS/releases/tag/v2.4.50)

### v2.4.49 — Page À propos : lien GitHub + historique des versions
- La page **À propos** affiche désormais le lien officiel vers le dépôt GitHub, avec une courte présentation du projet (open-source, maintenu par Bloume SAS).
- Nouveau bouton **"Voir tous les changelogs"** : ouvre une timeline de toutes les versions publiées (GitHub Releases), avec date et notes de version pour chacune. Nouvel endpoint `GET /api/panel/about/releases`, mis en cache 5 minutes côté serveur.
- [UHQ Panel OS v2.4.49](https://github.com/BloumeSAS/UHQ-Panel-OS/releases/tag/v2.4.49)

### Addon Wallet v1.2.0 — refonte "Gestion des soldes" : email, recherche, graphiques, historique
- **"Gestion des soldes" (admin)** : colonne email (résolue depuis le panel), barre de recherche (email ou ID), stats en un coup d'œil (total des soldes, comptes actifs, solde moyen), et un mini graphique "Top comptes".
- **Historique par compte** : dérouler l'historique complet, supprimer une transaction individuellement, en sélectionner plusieurs pour une suppression groupée, ou vider tout l'historique (confirmation requise). Ne touche jamais au solde — nettoyage de l'affichage, pas une correction comptable.
- **"Mon solde" (utilisateur)** : graphique d'évolution du solde reconstruit depuis l'historique, sans dépendance ajoutée.
- [UHQ-Addon-Wallet v1.2.0](https://github.com/BloumeSAS/UHQ-Addon-Wallet/releases/tag/v1.2.0)

### v2.4.48 / Addon Orders v1.2.6 — produit en modal + catégorie de livraison
- **Ajouter/modifier un produit** (Orders) s'ouvre désormais dans un modal (fermeture au clic hors modal, Échap, ou bouton ✕) au lieu d'un formulaire poussé dans le flux de la page.
- **Livraison : sélection de catégorie** — un produit peut restreindre le compte proxy livré à une catégorie (pool) précise du panel plutôt que tout le pool partagé. Ignoré si une liste de proxies privés est renseignée (même précédence que côté panel).
- **Nouvel endpoint API legacy `GET /api/v1/common/pools`** (scope `read:pool`) : liste les catégories déclarées, pour toute intégration API-key — pas seulement Orders.
- [UHQ Panel OS v2.4.48](https://github.com/BloumeSAS/UHQ-Panel-OS/releases/tag/v2.4.48) · [UHQ-Addon-Orders v1.2.6](https://github.com/BloumeSAS/UHQ-Addon-Orders/releases/tag/v1.2.6)

### v2.4.47 / Addon Orders v1.2.5 — passerelles de paiement déplacées dans le panel
- **Nouvel onglet "Extensions" dans Paramètres** : réglages spécifiques aux addons embarqués actifs. La Boutique (Orders) y expose ses passerelles de paiement (Stripe, NOWPayments), à la place du panneau qui vivait sur la page admin de l'addon lui-même — cohérent avec le reste du panel (un seul endroit pour la config).
- Les secrets (clés API, clés webhook) suivent le même mécanisme que le reste de Paramètres : masqués, révélables uniquement après confirmation du mot de passe du compte admin courant. Techniquement : le panel vérifie le mot de passe puis relaie l'appel server-to-server vers le port interne de l'addon (jamais exposé publiquement).
- [UHQ Panel OS v2.4.47](https://github.com/BloumeSAS/UHQ-Panel-OS/releases/tag/v2.4.47) · [UHQ-Addon-Orders v1.2.5](https://github.com/BloumeSAS/UHQ-Addon-Orders/releases/tag/v1.2.5)

### v2.4.46 / Addon Orders v1.2.4 — lien Boutique épinglé dans "Mes proxies"
- **Nouveau** : une page d'addon peut désormais se marquer `"primary": true` dans son manifeste (`pages[]`) pour être épinglée directement sous "Mes proxies" dans la barre latérale, côté utilisateur standard uniquement — au lieu d'apparaître dans la section générique "Extensions". Mécanisme générique, réutilisable par n'importe quel addon.
- **Orders v1.2.4** utilise cette option pour sa page Boutique (`/`).
- [UHQ Panel OS v2.4.46](https://github.com/BloumeSAS/UHQ-Panel-OS/releases/tag/v2.4.46) · [UHQ-Addon-Orders v1.2.4](https://github.com/BloumeSAS/UHQ-Addon-Orders/releases/tag/v1.2.4)

### Addons Wallet v1.1.5 / Orders v1.2.3 — fix critique thème custom
- **Le thème custom du panel n'avait en réalité jamais d'effet** — `themeColors` revient de `/api/panel/setup/status` comme une chaîne JSON, jamais parsée côté addon, donc toujours `undefined` en silence. Corrigé dans les deux.
- **Orders** : les indices de configuration webhook Stripe/NOWPayments affichent maintenant l'URL réelle et copiable, calculée automatiquement, au lieu d'un modèle générique.

### Addons Wallet v1.1.4 / Orders v1.2.2 — accessibilité
- **Focus clavier visible** sur boutons/champs/liens (`:focus-visible`) dans les deux addons.
- **Labels correctement associés** aux champs de formulaire (`htmlFor`/`id`) — crédit/débit Wallet, réglages de paiement Orders.
- **Contrôles auparavant sans nom accessible** (glyphes seuls type "+"/"−") : `aria-label` explicite sur les steppers de quantité, les boutons crédit/débit par ligne, et le bouton "Copier" ; les changements d'état (quantité, confirmation de copie) sont désormais annoncés via `aria-live`.

### Addon Orders v1.2.1 — paiement par carte (Stripe) et crypto (NOWPayments)
- **Nouveau : paiement par carte et crypto** en plus du solde Wallet — panneau de réglages repliable sur la page admin (Gestion boutique), clés API stockées comme secrets (masquées, jamais écrasées par une valeur vide). Le panier propose un choix de méthode de paiement dès qu'une passerelle externe est activée.
- Une commande payée par carte/crypto reste `pending` (jamais débitée, jamais livrée) tant que le paiement n'est pas confirmé par un webhook signé — voir [UHQ-Addon-Orders v1.2.0](https://github.com/BloumeSAS/UHQ-Addon-Orders/releases/tag/v1.2.0) pour le détail de l'intégration.
- **Fix sécurité (v1.2.1)** : comparaison timing-safe de la signature du callback IPN NOWPayments.
- Aucune donnée bancaire ne transite par l'addon — géré entièrement par Stripe/NOWPayments.

### Addons Wallet/Orders v1.1.3 — thème custom + comptes manquants
- **Wallet et Orders suivent désormais le thème custom du panel** (Paramètres → Thème) via un nouvel endpoint `GET /api/theme` sur chacun — relais serveur-à-serveur (fonctionne embarqué comme en déploiement externe, pas de souci CORS). Repli automatique sur la palette tangerine par défaut si aucun thème custom.
- **Fix Wallet : "Gestion des soldes" n'affichait pas tous les comptes** — un wallet n'était créé qu'à la première visite de "Mon solde" ou au premier crédit manuel, donc tout compte n'ayant fait ni l'un ni l'autre restait invisible dans la liste admin. Corrigé : la liste fusionne désormais avec tous les comptes panel connus (0€ pour ceux sans wallet).
- [UHQ-Addon-Wallet v1.1.3](https://github.com/BloumeSAS/UHQ-Addon-Wallet/releases/tag/v1.1.3) · [UHQ-Addon-Orders v1.1.3](https://github.com/BloumeSAS/UHQ-Addon-Orders/releases/tag/v1.1.3) — redéployez le panel pour les récupérer (rebuild automatique depuis GitHub).

### v2.4.45 — Logs des addons embarqués nettoyés, versions synchronisées
- **Fix : logs pollués de codes ANSI bruts** (`[32m[Nest] 2379...[39m`) pour tout addon embarqué actif dans le journal du panel — découpés ligne par ligne et nettoyés des codes couleur ; `NO_COLOR=1` injecté dans l'environnement de l'addon pour qu'il arrête d'en émettre.
- **Versions synchronisées** : le registre `addons/addons.json` affichait encore v1.1.0 pour Wallet/Orders. Bump des deux addons en **v1.1.2** ([Wallet](https://github.com/BloumeSAS/UHQ-Addon-Wallet/releases/tag/v1.1.2), [Orders](https://github.com/BloumeSAS/UHQ-Addon-Orders/releases/tag/v1.1.2)) et registre mis à jour.

### Fix complémentaire (addons Wallet/Orders) — page toujours blanche après v2.4.44
Après le fix v2.4.44 ci-dessous, les assets/CSS chargaient bien (bon MIME, 200), mais la page restait **quand même blanche, sans erreur JS**. Cause réelle, cette fois dans le code des addons eux-mêmes (pas dans le panel) : `<BrowserRouter>` (React Router) n'avait pas de `basename` — `<Routes>` matche le **pathname complet**, donc la route `"/admin"` ne matchait jamais le vrai chemin `"/addon-proxy/wallet/admin"`, et `<Routes>` ne rendait rien du tout.

**Corrigé dans [UHQ-Addon-Wallet](https://github.com/BloumeSAS/UHQ-Addon-Wallet) et [UHQ-Addon-Orders](https://github.com/BloumeSAS/UHQ-Addon-Orders)** : `<BrowserRouter basename={import.meta.env.BASE_URL}>` — cette valeur suit automatiquement le `--base` passé à `vite build` (v2.4.44), et vaut `"/"` par défaut donc **aucun changement pour un déploiement externe classique** à la racine de son propre domaine. Un `web/src/vite-env.d.ts` manquant (types Vite pour `import.meta.env`) a aussi été ajouté dans les deux repos, sans quoi le build `tsc` échoue.

::: tip Aucune nouvelle version du panel nécessaire
`build-bundled.sh` clone les addons officiels depuis leur dépôt GitHub à chaque build Docker — un simple `docker compose build` (ou redéploiement Coolify) du panel récupère automatiquement ces correctifs, sans changement côté UHQ Panel OS lui-même.
:::

### v2.4.44 — Fix : page blanche sur un addon embarqué (assets + appels API en chemin absolu)
- **Fix** : après v2.4.43, la page d'un addon embarqué activé chargeait mais restait blanche (`Failed to load module script... MIME type "text/html"`). Les addons officiels sont conçus pour être déployés à la racine de leur propre domaine — leurs assets et leurs appels API (`fetch('/api/x')`) utilisent des chemins absolus, qui atterrissaient à la racine du panel une fois embarqués (404 / fallback SPA) au lieu de passer par `/addon-proxy/<slug>/`.
- Corrigé côté panel : le build embarqué passe `--base=/addon-proxy/<slug>/` à Vite (assets), et le proxy interne détecte aussi les appels API absolus via l'en-tête `Referer` (repli, sans élargir la portée au-delà d'un addon réellement embarqué). *(Insuffisant à lui seul — voir le fix complémentaire ci-dessus.)*

### v2.4.43 — Fix critique : le proxy des addons embarqués (v2.4.42) ne répondait jamais
- **Fix : `Cannot GET /addon-proxy/<slug>/...`** sur toute page d'un addon embarqué activé — le reverse-proxy enregistré via le mécanisme standard NestJS (`MiddlewareConsumer`) n'était jamais invoqué (cause précise non identifiée, contournée). Monté désormais directement en Express natif dans `main.ts`, avant les autres middlewares — vérifié fonctionnel (chemins imbriqués, query string, slug inconnu → 404 propre).
- Mettez à jour et relancez votre instance pour appliquer le correctif si vous étiez déjà passé en v2.4.42.

### v2.4.42 — Addons officiels embarqués dans l'image (activation 1 clic)
- **Nouveau : les addons officiels (Wallet, Orders) sont désormais build directement dans l'image Docker du panel** (nouveau stage `addons-builder`, clone+build automatique depuis `addons/addons.json`) mais ne tournent pas tant qu'on n'a pas cliqué **Activer** sur leur carte (page Extensions → catalogue officiel).
- **Aucun VPS séparé, aucun accès `docker.sock`** — chaque addon tourne comme un simple processus enfant du panel (port interne jamais publié), atteint depuis le navigateur via un reverse-proxy interne (`/addon-proxy/<slug>/...`) qui passe par le port déjà exposé. Activer démarre le processus (quelques secondes) et le connecte automatiquement, sans redémarrage du panel. Désactiver l'arrête proprement (refusé si un autre addon en dépend). L'état survit aux redémarrages (relance auto au boot).
- **Futurs addons officiels automatiques** : ajouter une entrée avec `bundlePort` + `repository` dans `addons/addons.json` suffit — le build Docker et le catalogue du panel les prennent en compte sans autre modification.
- **Fix** : `AddonIframe`/`AddonWidgetSlot`/`AddonPageBar` construisaient l'URL d'un addon avec `new URL(path, baseUrl)`, qui remplace (au lieu d'ajouter) le chemin de `baseUrl` quand `path` commence par `/` — invisible pour un addon externe, aurait cassé le préfixe `/addon-proxy/<slug>` d'un addon embarqué. Corrigé.

::: warning Build Docker non vérifié en conditions réelles
Introduit sans accès à un démon Docker actif pour valider le build complet — lancez `docker compose build` après mise à jour pour confirmer, et signalez tout souci.
:::

### v2.4.41 — Retrait de la page "Modules" (v2.4.40)
- La page **Système → Modules** et son exemple "Export Prometheus" (v2.4.40) sont retirés — mauvaise approche (nouvelle page séparée + module inventé plutôt que de s'appuyer sur les addons déjà existants dans **Extensions**). Retour propre à l'état v2.4.39 sur ce point.

### ~~v2.4.40 — Modules internes activables/désactivables~~ (retiré en v2.4.41, voir ci-dessus)

### v2.4.39 — Refonte de la navigation des Paramètres
- **Nouvelle navigation en sidebar dédiée** — les onglets de Paramètres (Général, Sécurité, Thème, Proxy, Scraper, SMTP, Captcha, Webhooks, Sauvegardes, Clé API...) ne sont plus une barre horizontale mais une deuxième sidebar verticale propre à la page, regroupée par thème (Aperçu / Général / Sécurité / Moteur proxy / Communications / Système), avec une courte description sous chaque libellé.
- **Chapeau de section** (icône + titre + description) en tête de chaque panneau, pour donner plus de contexte avant les champs. Aucun changement fonctionnel sur les réglages eux-mêmes.

### v2.4.38 — Fix critique : fuite mémoire (cache anti-VPN)
- **Fix critique : fuite mémoire, heap passant de ~60 Mo à ~700 Mo en une journée** — le cache des résultats proxycheck.io ajouté en v2.4.37 (`VpnDetectionService.apiCache`) n'était jamais purgé : chaque IP cliente distincte vue sur une pool anti-VPN y ajoutait une entrée permanente, avec un pire cas particulièrement probable (un abus automatisé tournant via des IP de VPN/proxy en rotation — exactement ce que la fonctionnalité cible). Purge périodique (10 min) + plafond dur de 20 000 entrées ajoutés. Un corps de réponse HTTP non consommé sur erreur proxycheck.io (fuite mineure côté undici) est aussi corrigé.
- **Fix : `proxyDeadCache` (alertes "proxy hors ligne") non purgé** — pré-existant, sans lien avec la v2.4.37, repéré pendant l'audit des caches mémoire suite à l'incident ci-dessus. Même correctif (purge périodique).

::: tip Redémarrage recommandé
Si votre instance tournait déjà sur v2.4.37, redéployez pour repartir sur une mémoire propre — le correctif stoppe la croissance mais ne libère pas la mémoire déjà accumulée par le process en cours.
:::

### v2.4.37 — Anti-VPN : détection via proxycheck.io, durée de ban configurable
- **Fix : la détection anti-VPN (v2.4.36) reposait uniquement sur l'heuristique ASN locale** et ratait certains VPN dont l'IP n'est pas hébergée chez un fournisseur reconnaissable par son nom. Ajout d'une vérification via [proxycheck.io](https://proxycheck.io) (une requête par IP, cache 6h, fonctionne sans clé) en complément — une IP est bannie si l'un ou l'autre des deux signaux la détecte.
- **Nouveau : durée du ban anti-VPN configurable** (`vpnBanDurationHours`, Paramètres → Sécurité, défaut 24h) et **clé API proxycheck.io optionnelle** (`vpnCheckApiKey`, augmente le quota gratuit).

### v2.4.36 — Anti-VPN par pool, fix UX captcha Cap
- **Nouveau : option "Anti-VPN" par pool** (Proxy Pools) — refuse et bannit 24h automatiquement toute IP cliente identifiée VPN/hébergeur, via une heuristique sur la base gratuite [DB-IP Lite](https://db-ip.com/db/download/ip-to-asn-lite) (organisation ASN), la même que celle utilisée par [tiagozip/cap](https://github.com/tiagozip/cap). Voir [Proxy Pools → Anti-VPN](/guide/proxy-pools#anti-vpn-depuis-v2-4-36).
- **Fix : le captcha Cap affichait un message "à refaire" après une résolution pourtant réussie** — le widget `@cap.js/widget` retombe parfois dans un état visuel incohérent après avoir émis son token (déjà valide, le login fonctionnait malgré le message). L'UI du widget est désormais remplacée par une confirmation fixe dès réception du token.

### v2.4.35 — Fix critique : plusieurs réglages ne s'enregistraient jamais
- **Fix critique : `logoUrl`, `connectionIdleTimeout`, `require2faForAdmins`, les 4 réglages de rétention, `poolLowAlertEnabled`/`poolLowThresholdPct`, et les 4 réglages `proxyAuth*` (v2.4.34) ne s'enregistraient jamais depuis Settings**, sans aucune erreur affichée. `ValidationPipe({ whitelist: true })` supprime silencieusement tout champ non déclaré sur le DTO de validation avant qu'il n'atteigne le contrôleur — ces réglages, ajoutés au fil de plusieurs versions récentes, n'avaient jamais été ajoutés à `UpdateSettingsDto`. Tous sont désormais déclarés et s'enregistrent normalement. Si vous aviez modifié l'un de ces champs depuis son ajout, il faut le re-saisir : la valeur restait la valeur par défaut jusqu'ici.

### v2.4.34 — Anti-brute-force sur le moteur proxy
- **Nouveau : bannissement automatique après échecs d'auth répétés sur le proxy (port 990)** — jusqu'ici, seul `/auth/login` (panel) était protégé contre les tentatives répétées ; l'authentification Basic-Auth du moteur proxy n'avait aucune limite, une IP pouvait enchaîner des dizaines d'échecs sans friction (observé en prod : 6-7 échecs à la même seconde depuis une IP). Le moteur bannit désormais automatiquement une IP au-delà d'un seuil configurable, en réutilisant le mécanisme existant des IP bannies (visible/révocable depuis Sécurité → IP bannies) + une notification in-app à chaque auto-ban. Réglages dans **Paramètres → Sécurité** : activer/désactiver, seuil d'échecs (défaut 15), fenêtre glissante en secondes (défaut 60s), durée du ban en heures (défaut 24h).

### v2.4.33 — Fix captcha Cap, page Rapports améliorée, Settings réorganisés
- **Fix : captcha Cap cassé (404)** — l'URL CDN pointait vers le mauvais paquet npm et le mauvais chemin. Corrigée et vérifiée.
- **Rapports : trafic quotidien en vraie courbe** au lieu d'une liste de barres, et **export PNG/PDF** (`html2canvas`/`jsPDF`) à la place de `window.print()`.
- **Paramètres : nouvel onglet "Sécurité"** — la 2FA obligatoire et les 4 réglages de rétention avaient été ajoutés dans l'onglet "Général" (v2.4.29/v2.4.32) et s'y noyaient ; ils ont maintenant leur propre onglet.

### v2.4.32 — Filtre par compte, comparaison de période, export PNG/PDF
- **Nouveau : filtre par sous-utilisateur** (Analytics) — scope le graphique de trafic, le top domaines et une mini bande de stats sur un seul compte. Granularité journalière ; pas de vue de latence par compte (structurellement impossible, proxies partagés/mis en course).
- **Nouveau : comparaison période sur période** — badge "+12%/-5% vs période précédente" sur le graphique de trafic, sans requête supplémentaire.
- **Nouveau : export PNG/PDF du dashboard Analytics** (`html2canvas`/`jsPDF`, chargés à la demande).
- **Nouveau : rétention configurable** pour l'historique santé du pool et trafic (`poolHealthSnapshotRetentionDays`, `trafficSnapshotRetentionDays`) — et `notificationRetentionDays`/`auditLogRetentionMonths` (existants côté API, jamais exposés) sont maintenant éditables depuis Paramètres.

### v2.4.31 — Graphique de trafic dans le temps, badge "cet appareil"
- **Nouveau : graphique de trafic dans le temps** (Analytics) — nouvelle table `TrafficSnapshot` (snapshot toutes les 15 min, rétention 7 jours) permettant un vrai historique de volume (envoyé/reçu/requêtes) sur la plage sélectionnée (6h/24h/7j), là où seul le trafic du jour courant était visible auparavant.
- **Nouveau : badge "cet appareil"** (page Sécurité) — la session en cours est identifiée et mise en avant, son bouton de révocation individuel masqué (pour éviter de se déconnecter soi-même par erreur).

### v2.4.30 — Analytics enrichi, traductions du journal d'audit
- **Analytics : bandeau temps réel** (5s) — threads/sessions actifs, volume/requêtes du jour, charge CPU, RAM, latence DB. **Top domaines du jour** et **Comptes actifs** (débit en direct, quota) en plus des graphiques existants.
- **Fix : noms d'action bruts non traduits dans le journal d'audit** (`notifications.purge`, `banned-ip.create`, `proxy.setCountryFormat`, etc.) — toutes les actions ajoutées récemment (2FA, IP bannies, domaines bloqués, thème, templates...) ont maintenant leur traduction.

### v2.4.29 — 2FA obligatoire admin, codes de récupération, pagination serveur
- **Nouveau : 2FA obligatoire pour les admins** (`require2faForAdmins`, Paramètres → Sécurité) — enferme le compte sur la page Sécurité tant que la 2FA n'est pas activée, sans bloquer le login lui-même.
- **Nouveau : codes de récupération 2FA** — 10 codes à usage unique à l'activation, repli possible au login si l'appareil TOTP est perdu, régénération protégée par le code actuel.
- **Nouveau : alerte nouvelle IP de connexion / utilisation d'un code de récupération** — in-app + e-mail.
- **Fix : XSS mineur dans les nouveaux e-mails d'alerte** (IP/user-agent non échappés) — trouvé et corrigé le jour même par la revue de sécurité automatique.
- **Nouveau : recherche + pagination côté serveur** pour Sous-utilisateurs, dialog de confirmation réutilisable (remplace `window.confirm()`), badge de source (manuel/scrapé) dans Pool de proxies.
- **Nouveau : `GET /api/panel/health/detailed`** (admin) — fds ouverts, connexions Postgres actives, plus grosses tables.

### v2.4.28 — Fix critique 2FA au login, sidebar réorganisée
- **Fix critique de sécurité : la 2FA n'était jamais vérifiée au login** — `POST /auth/login` émettait un JWT complet dès email+mot de passe validés, sans jamais regarder `totpEnabled`. Activer la 2FA ne protégeait donc rien à la connexion. Corrigé : un compte 2FA reçoit un jeton temporaire (5 min) après le mot de passe et doit valider son code à 6 chiffres via `POST /auth/login/2fa` (limité à 10 tentatives/min/IP) avant d'obtenir une vraie session.
- **Sidebar groupée en sections** (Gestion / Supervision / Système / Compte côté admin) au lieu d'une longue liste plate.
- **Profil et Sécurité retirés de la sidebar** — accessibles en cliquant sur la zone email/rôle en haut à droite (→ Profil, qui contient le raccourci vers Sécurité), désormais toujours cliquable et visible à toutes les tailles d'écran (avant : inerte sans extension installée, et masquée sur mobile).

### v2.4.27 — Retrait/resynchronisation des domaines bloqués (API sub-user)
- **Nouveau : `POST /api/v1/sub-user/blocked-domains/remove`** — retire des domaines de la liste bloquée d'un compte (l'endpoint `/add` existait depuis v2.4.26, mais aucun moyen de revenir en arrière).
- **Nouveau : `POST /api/v1/sub-user/blocked-domains/set`** — remplace intégralement la liste en un appel, pour resynchroniser l'état complet côté client sans calculer un diff add/remove.

### v2.4.26 — Fix tracking domaine, domaines bloqués par compte
- **Fix : le tracker de trafic (top domaines visités) affichait souvent "google.com" au lieu du vrai domaine** — pour CONNECT (HTTPS) sans header `Host` (fréquent, pas obligatoire pour cette méthode), le code repassait par `extractHost()` (pensé pour une URL absolue ou un header Host) au lieu d'utiliser directement `path` (déjà le host:port cible pour CONNECT). Même bug, plus grave, sur le tunnel de secours résidentiel : une requête CONNECT concernée ouvrait le tunnel vers **google.com au lieu de la vraie destination**.
- **Nouveau : domaines bloqués par compte proxy** — chaque sous-utilisateur peut avoir une liste de domaines interdits (bloque le domaine exact + ses sous-domaines), vérifiée dès la connexion. Configurable en panel admin, en self-service (Mes Proxies), et via l'[API sub-user](/guide/proxy-pools#domaines-bloqués) (`/api/v1/sub-user/create`, `/update`, `/blocked-domains/add`).

### v2.4.25 — Fix bloat de la table Notification (5,4 Go)
- **Fix critique : table `Notification` à 5,4 Go / 610k lignes** — l'alerte "🚨 Proxy Hors Ligne" (une par proxy mort détecté, dédupliquée à 1/heure/URL mais sans aucune purge) a suffi à faire grossir la table indéfiniment sur un pool de dizaines de milliers de proxies. Cette alerte n'écrit plus de ligne in-app (les webhooks Discord/Slack restent inchangés).
- **Nouveau : rétention automatique** (`notificationRetentionDays`, défaut 30 jours) — purge quotidienne, filet de sécurité pour les autres types de notification.
- **Nouveau : bouton "Purger"** dans la cloche de notifications (admin) — vide immédiatement toute la table.

::: tip Récupérer l'espace déjà utilisé
Le fix stoppe la croissance mais ne réduit pas la base déjà accumulée — utiliser le bouton **Purger** (cloche) ou attendre la purge automatique. Après une purge massive, un `VACUUM FULL` côté Postgres peut être nécessaire pour que l'espace disque soit réellement rendu à l'OS (sinon Postgres le garde réservé pour la table).
:::

### v2.4.24 — Plafond de descripteurs relevé (1 048 576)
- **`ulimits.nofile` du container relevé de 200 000 à 1 048 576** dans `docker-compose.yml` — un burst de connexions d'un seul sous-compte (checker de combos IPTV : des centaines de requêtes/seconde, chacune faisant courir jusqu'à 5 upstreams en parallèle) a suffi à épuiser 200 000 descripteurs et redéclencher `EMFILE`, malgré le fix v2.4.23 (qui corrigeait une fuite différente, côté reconnexions Prisma). Voir [Docker & Coolify → Dépannage](/guide/docker#d%C3%A9pannage-emfile-too-many-open-files) — le daemon Docker de l'hôte doit lui aussi autoriser au moins cette valeur (`LimitNOFILE`), sinon le plafond réel reste inchangé malgré ce réglage.

### v2.4.23 — Fix fuite de descripteurs (EMFILE)
- **Fix critique : `EMFILE: too many open files` après une série de coupures DB** — `PrismaService` refaisait `$connect()` après une perte de connexion sans jamais `$disconnect()` l'ancien client d'abord, laissant son pool de sockets TCP ouvert en arrière-plan à chaque cycle. Sur une série de coupures DB rapprochées, les descripteurs jamais libérés finissaient par épuiser la limite du process — provoquant des 500 sur n'importe quelle page du panel (fichiers statiques compris). Voir [Docker & Coolify → Dépannage](/guide/docker#d%C3%A9pannage) pour le diagnostic si ça se reproduit.

### v2.4.22 — IP bannies, page Profil
- **Nouveau : bannissement d'IP** — page admin **IP bannies** (`/banned-ips`) : bannit une ou plusieurs IP en une fois (indépendamment des comptes), vérifié avant même l'authentification (erreur HTTP 403 immédiate, connexion fermée, aucun thread consommé). Raison et expiration optionnelles ; débannissement individuel ou en masse.
- **Nouveau : page Profil** (`/profile`, tous rôles) — infos du compte + changement de mot de passe, avec raccourci vers le statut 2FA.
- **Fix : navigation admin vers Sécurité/Clés API** — ces pages existaient déjà (backend + route) mais n'étaient liées nulle part dans le menu admin, rendant la 2FA inaccessible sans taper l'URL à la main. Corrigé — voir [Configuration → IP bannies / 2FA](/guide/configuration#s%C3%A9curit%C3%A9-durcissement-v2-4-11-v2-4-12).

### v2.4.21
- **Fix : les drapeaux pays ne s'affichaient pas sous Chrome (Windows)** — les emoji drapeaux (ajoutés en v2.4.20) ne rendent pas nativement sur Windows, faute de police système embarquant ces glyphes (contrairement à macOS/Android/iOS) ; Chrome/Edge/Firefox y affichaient le code pays brut à la place. Remplacés par des images (flagcdn.com), identiques sur toutes les plateformes — corrigé dans Sous-utilisateurs et dans Pool de proxies.

### v2.4.20
- **Fix : colonne "Pays" de Sous-utilisateurs cassait avec beaucoup de pays sélectionnés** — une longue liste (ex. `NL,FR,DE,GB,RU,TR,ES,IT,UA,PL,CZ,SE,...`) débordait en texte brut la ligne du tableau. Affichée désormais en **drapeaux** (jusqu'à 8 inline), avec un bouton "+N" ouvrant la liste complète dans une modal au-delà — dans le tableau et dans la vue rapide.

### v2.4.19 — Logs & audit
- **Nouveau : volume Docker pour `/app/logs`** — les fichiers de logs survivent désormais aux redéploiements (jusqu'ici seul `/app/data` était monté).
- **Nouveau : lecture des fichiers de logs déjà écrits** — `GET /api/panel/logs/files` (liste) + `GET /api/panel/logs/files/:filename` (contenu, `?tail=N`) ; nouvel onglet "Historique fichiers" dans **Administration → Logs**, qui charge aussi désormais le buffer mémoire au chargement (avant, seul le flux live SSE alimentait l'écran).
- **Nouveau : variable `LOG_LEVEL`** — filtre debug/verbose au démarrage sans changement de code ; `error` reste toujours émis quel que soit le seuil configuré.
- **Nouveau : rétention du journal d'audit** — purge quotidienne des lignes plus vieilles que `auditLogRetentionMonths` (réglage panel, défaut 12 mois) ; auparavant la table `AuditLog` grossissait indéfiniment.
- **Nouveau : ID de corrélation par requête** — chaque ligne de log émise pendant une requête HTTP porte désormais le même ID (repris de `X-Request-Id` si fourni, sinon généré), affiché dans le flux live du panel.
- **Nouveau : dimension erreur sur le trafic** — le sniff HTTP en clair (403/captcha/geo-block) est maintenant persisté (nouvelle table `ProxyUsageError`) au lieu de se perdre dans un simple avertissement. Exposé en `errors`/`errors_by_reason` sur les statistiques admin et sur l'API legacy (`/api/v1/stats/proxy/:id`) — corrige le widget "Erreurs HTTP" vide côté UHQ.Monster. Limite connue : l'HTTPS (l'essentiel du trafic) reste structurellement opaque pour un tunnel TCP bas niveau, aucune tentative de MITM/TLS-termination n'a été ajoutée.
- **Fix : export CSV du journal d'audit** — le bouton "Télécharger CSV" n'exportait que la page affichée (50 lignes) malgré son libellé ; génère maintenant le CSV complet côté serveur sur le résultat filtré. Nouveaux filtres (action, email, plage de dates) dans l'écran **Audit**.

### v2.4.18
- **Fix : validation trop stricte du format "pays sélectionnable"** — exigeait `{user}` ET `{country}`, mais l'un des exemples cliquables fournis dans l'UI elle-même (`dc-{country}`) est un gabarit à remplacement complet qui ignore volontairement le username d'origine (usage réel et légitime). Seul `{country}` (ou `{COUNTRY}`) est désormais requis ; `{user}` reste utilisable mais optionnel.

### v2.4.17
- **Fix : pays multiples toujours résolus au premier de la liste** — quand plusieurs pays étaient demandés (ex. `IT,FR,US`), l'injection du pays dans le username d'un proxy "pays sélectionnable" prenait toujours le premier code, quel que soit le nombre de requêtes. Un pays est désormais tiré au hasard parmi la liste à chaque connexion.

### v2.4.16
- **Nouveau : statistiques par compte proxy dans le panel admin** — nouveau bouton sur chaque compte dans **Sous-utilisateurs** : filtre par période (semaine/mois/année/tout), requêtes, données totales, envoyé/reçu, threads actifs, et **top 25 des sites les plus visités** avec requêtes + volume par domaine. Auparavant réservé au propriétaire du compte via "Mes Proxies".
- **Fix** : le format sticky-list affiché côté admin (`GET /subusers/:id/sticky-list`) annonçait encore l'ancien format à 5 champs — resté oublié lors du passage au format 4 champs en v2.4.5 (seule la copie côté "Mes Proxies" avait été corrigée).

### v2.4.13 – v2.4.15 — Proxies "pays sélectionnable"
- **Nouveau : format de username configurable pour l'injection du pays**, à deux niveaux — voir [Proxies "pays sélectionnable"](/guide/proxy-pools#proxies-pays-sélectionnable-depuis-v2-4-13) :
  - **Par pool** (`fallbackCountryFormat`) : gabarit utilisé par le fallback résidentiel unique de cette catégorie.
  - **Par proxy** (`countryFormat`) : les vrais proxies de la pool peuvent chacun avoir leur propre gabarit — plusieurs fournisseurs avec des conventions différentes cohabitent dans la même catégorie. Réglable à l'import manuel (toggle "Proxies pays sélectionnable") **ou après coup** (v2.4.15) via sélection multiple + barre d'action groupée dans Pool de proxies.
  - Exemples de gabarits cliquables dans les deux écrans.
- **v2.4.14** : clarification UI — le champ pool-level ne concerne QUE le fallback résidentiel, pas les proxies de la pool ; note ajoutée dans les deux écrans pointant l'un vers l'autre.

### v2.4.12
- **Fix sécurité (suite v2.4.11)** — le rate-limiter de login/forgot-password lisait `X-Forwarded-For` directement depuis les headers de requête, un champ entièrement contrôlé par le client tant que l'app ne déclare pas explicitement de quel hop se méfier — en changer la valeur à chaque requête permettait de contourner la limite par IP. `app.set('trust proxy', 1)` déclare qu'un seul hop (Traefik/Coolify, seul reverse-proxy devant l'API) est de confiance, et `req.ip` (Express) remplace le parsing manuel partout où l'IP client est utilisée.

### v2.4.11
- **Fix sécurité : path traversal admin sur la restauration/suppression de backups locaux** — `POST /backup/restore` et `DELETE /backup/:filename` concaténaient le nom de fichier fourni tel quel dans le chemin disque. Un nom du type `../../../../etc/passwd` sortait du répertoire de backups. `path.basename()` neutralise désormais toute traversée.
- **Fix sécurité : aucune protection anti-brute-force sur `/auth/login` et `/auth/forgot-password`** — le seul frein existant (captcha) n'est pas configuré par défaut sur une install fraîche. Nouveau limiteur en mémoire (fenêtre glissante) : 5 tentatives/min par IP+email en login (+ 20/min par IP contre le spray multi-comptes), 5/min par IP sur forgot-password.

### v2.4.10
- **Fix majeur : crashes "Uncaught exception: read ECONNRESET"** — le listener d'erreur sur les sockets (client comme upstream) n'était actif que pendant la phase de connexion (`.once('error', ...)`), qui se retire définitivement après son premier déclenchement même sans rien faire. Toute erreur socket ultérieure (ECONNRESET pendant le relais réel) se retrouvait alors sans aucun listener — Node la relance comme exception non interceptée jusqu'au process. Un listener d'erreur permanent est maintenant posé dès la création de chaque socket.
- **Fix : "détecter le pattern" (Groq) pouvait échouer avec "Réponse vide du modèle"** — les modèles `openai/gpt-oss-*` consomment des tokens de raisonnement caché avant de produire la réponse visible ; avec un budget de 150 tokens, tout pouvait être englouti par ce raisonnement. `max_tokens` relevé à 300 et `reasoning_effort: 'low'` ajouté pour ces modèles. Chaque message d'erreur indique aussi désormais quel modèle a échoué et pourquoi.

### v2.4.9
- **Fix : "détecter le pattern" pouvait renvoyer un succès avec un pattern vide** — `new RegExp('')` ne lève jamais d'erreur ; une réponse vide/mal formée du modèle passait le contrôle de validité existant et renvoyait un faux succès, effaçant silencieusement le champ pattern. L'API rejette maintenant une réponse vide et vérifie que le regex retourné a bien ses 2 groupes de capture requis avant de l'accepter.

### v2.4.8
- **Fix : modèle Groq décommissionné** — `gemma2-9b-it` a été retiré par Groq (HTTP 400 "no longer supported"), cassant le dernier fallback de l'aide "détecter le pattern automatiquement". Remplacé par `openai/gpt-oss-20b`.

### v2.4.7
- **Fix : "Vider la catégorie" renvoyait un 500** — sur une catégorie très fournie, la suppression était un seul `deleteMany` géant attendu de façon synchrone, ce qui pouvait dépasser une limite de la base ou le timeout du reverse-proxy en prod. Tourne désormais en tâche de fond, par lots de 5000 ids, suivie via un endpoint de polling (même pattern que les sauvegardes manuelles) — le bouton se déclenche instantanément et notifie une fois terminé.

### v2.4.6
- **Fix majeur : crashes/redémarrages causés par le scraper et le checker tournant en même temps** — chacun peut charger et traiter jusqu'à ~150 000 proxies ; le cumul de RAM/CPU a déjà fait sauter le process en prod. Un nouveau `JobCoordinatorService` garantit qu'un seul des deux tourne à la fois : l'autre attend (jusqu'à 30 min) que le premier se libère avant de démarrer, au lieu de risquer le chevauchement.
- **Sauvegarde automatique : attend une fenêtre calme** — les sauvegardes planifiées (cron) attendent désormais que le scraper/checker soient à l'arrêt ET que le trafic soit raisonnable (≤100 threads actifs) avant de démarrer (jusqu'à 20 min d'attente, puis lancement quand même pour ne jamais sauter un cycle planifié). Le déclenchement manuel ("Lancer maintenant") reste immédiat.
- **Fix majeur : connexions "actives" qui ne se libéraient jamais** — un client qui disparaît sans fermeture TCP propre (poste éteint brutalement, coupure réseau) ne déclenche jamais d'événement de fermeture côté serveur ; la connexion, et le thread qu'elle occupait, restaient comptés actifs indéfiniment (observé : plus d'un jour après extinction du poste client). Chaque tunnel se ferme désormais automatiquement après une période d'inactivité — nouveau réglage `connectionIdleTimeout` (Settings → Proxy → "Timeout d'inactivité"), défaut 600s.
- **Nouveau : vider une catégorie** — bouton dans **Proxy Pools** pour supprimer TOUS les proxies d'une catégorie sélectionnée en un clic, sans supprimer la catégorie elle-même (port/domaine/stats simulées conservés). `pool` étant une simple string dénormalisée sur `BackendProxy` (pas de FK), supprimer une pool ne nettoyait jusqu'ici jamais ses proxies.

### v2.4.5
- **Fix majeur (suite) : les proxies ajoutés manuellement restaient ignorés** — le fix v2.4.4 (cache par pool) restait insuffisant : chaque pool gardait un cache trié/tronqué par `successCount` (top 500), donc un proxy neuf (`successCount: 0`) dans une pool déjà bien fournie n'entrait jamais dans le cache, même après des milliers de requêtes. Le tri par succès avant troncature est supprimé : le cache contient maintenant tout le stock actif de chaque pool, et c'est le trust score (tirage pondéré) qui décide qui est choisi.
- **Fix majeur : sauvegarde automatique en échec sur les grosses bases** — la sauvegarde chargeait chaque table entière en mémoire et construisait tout le JSON en un seul buffer avant l'upload ; sur une base de plusieurs Go, ça dépassait la limite de taille de string V8 (OOM silencieux) et/ou la limite S3 de 5 Go pour un upload non multipart. La sauvegarde est désormais **streamée** : les grosses tables sont lues par pages (jamais plus de 5000 lignes en mémoire), et l'upload S3 passe par un multipart automatique (`@aws-sdk/lib-storage`) sans limite de 5 Go.
- **Fix : format des proxies "session" générés** — `host:port:user:session:pass` (5 champs) était rejeté par la plupart des logiciels proxy, qui n'acceptent que le format classique à 4 champs. Le générateur produit maintenant `host:port:user-session-XXXX:pass` (convention standard), comprise nativement par le moteur. Bonus : les préréglages "Sticky @/HTTP URI/SOCKS5 URI" du panel utilisaient déjà cette convention côté UI mais n'étaient jamais réellement supportés côté moteur — ils fonctionnent désormais pour de vrai.
- **Nouveau : onglet "Comptes actifs"** sur le Dashboard — liste en direct des comptes proxy actuellement actifs (threads ouverts + limite, bande passante live upload/download, catégorie, quota), rafraîchie toutes les 5s, avec filtre par compte/label/catégorie.

### v2.4.4
- **Fix majeur : les proxies ajoutés manuellement dans une pool n'étaient jamais utilisés** si cette pool contenait déjà des proxies scrapés avec un historique établi — le cache mémoire de sélection était un seul "top-N" global toutes pools confondues trié par taux de succès, ce qui empêchait le fallback DB (qui aurait vu les proxies manuels) de se déclencher. Le cache est désormais construit **par pool**, avec une tranche garantie pour chacune (corrigé plus complètement en v2.4.5, voir ci-dessus).
- **Dashboard** — la liste "Proxies utilisés en direct" affiche désormais la catégorie (pool) de chaque proxy actif, avec un champ de filtre (compte, IP ou catégorie).

### v2.4.3
- **Fix : `check-update` renvoyait une "dernière version" périmée** — l'appel à l'API de tags GHCR (`/v2/{image}/tags/list`) n'utilisait aucun paramètre `n` explicite ; GitHub pagine cette réponse par défaut (~100 entrées, **pas nécessairement triées par version**), ce qui pouvait couper la liste juste avant les tags semver les plus récents (ex. affichait `2.4.0` alors que `2.4.1`/`2.4.2` étaient déjà publiées sur le registre). L'appel demande désormais explicitement `n=1000`, largement au-dessus de la volumétrie réelle du dépôt.

### v2.4.2
- **Rotation des proxies par trust score** — le choix de l'upstream backend combine désormais taux de succès et latence (`trust score`) avec un tirage pondéré sur une fenêtre élargie de candidats, plus une pénalité de cooldown (60s) après chaque sélection : les meilleurs proxies restent favorisés mais ne sont plus systématiquement réutilisés en boucle H24. Voir [Sélection des upstreams](/guide/proxy-pools#sélection-des-upstreams-rotation-trust-score).
- **Fix : import manuel de proxies en erreur "entity too large"** — la limite JSON par défaut de NestJS (100 Ko) rejetait les grosses listes collées dans **Pool de proxies → Importer**. Relevée à 25 Mo.
- **Nouveau : Session statique** — `GET /me/proxies/:id/static-session` génère des identifiants **temporaires** (`host:port:user:pass`, sans champ "session" visible), chacun épinglé sur son propre upstream pour la durée du TTL. Nouveau préréglage dans **Mes Proxies → Générer**. Voir [Session statique](/guide/proxy-pools#session-statique-identifiants-temporaires).
- **Fix majeur : le checker marquait à tort des proxies HTTP fonctionnels comme morts** — le test de vivacité utilisait un `CONNECT` HTTPS pour tous les protocoles, mais beaucoup de proxies HTTP bas de gamme ne supportent que le relais `GET` et rejettent `CONNECT`. Les proxies HTTP sont désormais testés via un `GET` en forme absolue ; SOCKS4/5, non affectés, gardent la négociation SOCKS classique.
- **Nouveau : Settings → Tableau de bord** — taille de la base PostgreSQL sur disque + volumétrie des tables principales (`GET /monitoring/db-stats`).
- **Nouveau : proxies utilisés en direct** sur le Dashboard admin — liste en temps réel des `BackendProxy` actuellement en cours d'utilisation (connexions actives, comptes), rafraîchie toutes les 5s.
- **Mode compact étendu** — la densité "compact" ne resserrait que les tableaux ; elle s'applique désormais aussi aux marges de page et à l'espacement des cartes, sur toutes les pages du panel.
- **i18n** — ajout des traductions manquantes pour les actions d'audit `subuser.bulk.*` et `subuser.share-link.*` (FR/EN).

### v2.4.1
- **Fix majeur : la sauvegarde manuelle ne fonctionnait pas pour les bases volumineuses** (~200 Mo et plus) — le déclenchement bloquait la requête HTTP jusqu'à la fin complète (requête DB + sérialisation + upload S3/local), largement plus long que le timeout du reverse-proxy devant l'API en prod (Traefik/Coolify), qui coupait la connexion en route sans afficher ni succès ni erreur. Le déclenchement manuel est désormais **non-bloquant** : `POST /backup/run` répond immédiatement (~50ms, vérifié en conditions réelles) et le panel poll un nouvel endpoint `GET /backup/run-status` pour afficher le résultat réel une fois la sauvegarde terminée, quelle que soit sa durée.
- **Fix : faux "succès" affiché même en cas d'échec réel** — le backend renvoyait un HTTP 200/201 avec `{status:'error'}` dans le corps pour signaler un échec interne (ex. permissions S3 insuffisantes), mais le panel ne vérifiait jamais ce champ et affichait toujours le toast de succès. Corrigé sur les 4 actions concernées (sauvegarde manuelle, restauration, suppression, import de settings). Vérifié avec un vrai stockage S3 (Synology C2) : le toast affiche maintenant la vraie erreur AWS quand elle survient.
- **Timeout de la transaction de restauration** relevé de 30s à 5 minutes — insuffisant pour restaurer des centaines de milliers de lignes (`BackendProxy`/`ProxyUsage`).

### v2.4.0
- **Fix majeur : la sauvegarde automatique de la base ne prenait jamais effet** — `PUT /api/panel/settings` ne rappelait jamais `BackupService.reschedule()`, le cron restait figé sur l'état lu au démarrage du conteneur. Activer "Sauvegarde auto BDD" (ou changer le cron/stockage) depuis le panel n'avait donc **aucun effet** avant un redémarrage complet. La replanification est désormais instantanée dès l'enregistrement des paramètres — vérifié en conditions réelles.
- **Logs enrichis pour le diagnostic des sauvegardes** : planification du cron (avec la prochaine exécution), durée de chaque cycle, taille du payload avant écriture, cause précise en cas d'échec local/S3 — tout remonte désormais dans **Journaux**.
- **Bouton "Lancer une sauvegarde" : choix Local/S3 par exécution** — un sélecteur permet de forcer la destination de cette sauvegarde manuelle uniquement, sans toucher au réglage global utilisé par le cycle automatique.
- **Nouveau bouton "Tester la connexion" (config S3)** — vérifie que le bucket et les identifiants S3 sont valides (`ListObjectsV2` léger) sans lancer de sauvegarde.

## v2.3.x

### v2.3.0
- **Fix : `npm install` cassé dans `api/`** — `@nestjs/platform-ws` et `@nestjs/websockets` étaient épinglés en v11 alors que tout le reste du projet (`@nestjs/core`, `@nestjs/common`...) est en v10. Un `npm install` frais (sans le `--legacy-peer-deps` caché dans le Dockerfile) plantait en conflit de peer dependencies — exactement ce que demande le README pour le dev local. Réalignés sur v10, install propre confirmée.
- **Fix : reconnexion base de données** — dans `prisma.service.ts`, le flag interne `connected` ne repassait jamais à `false` après une coupure réelle (Postgres qui redémarre, réseau qui saute), seul l'arrêt propre de l'app le faisait. `ensureConnection()` (appelée à chaque cycle du checker et à chaque rafraîchissement du moteur proxy) croyait donc rester connectée indéfiniment et ne retentait jamais `$connect()` : après un simple pépin DB, tout restait cassé jusqu'à un redémarrage manuel du conteneur. Un middleware Prisma détecte désormais la perte de connexion partout où elle survient et déclenche une reconnexion automatique.
- **Nouveau : "Checker actif" par catégorie** — dans le dialogue de création/édition d'une catégorie (Pools), un toggle "Checker actif" (activé par défaut) s'ajoute à côté de "Toujours en ligne". Désactivé, le cycle automatique du checker ignore complètement les proxies de cette catégorie (aucun test, statut figé tel quel) — différent de "Toujours en ligne" qui force le statut à "en ligne" : ici c'est un vrai "hands off", sans mentir sur le statut. Le bouton "Tester" manuel continue de fonctionner dans tous les cas. Badge "Checker désactivé" affiché dans la liste des catégories.

## v2.2.x

### v2.2.0
- **Import de thèmes tweakcn.com** (URL libre + galerie de 12 presets), conversion oklch → HSL faite côté serveur.
- **Templates de sous-users** (profils réutilisables : threads/quota/pays/TTL) pour la création rapide.
- **Historique des changements de settings** : diff avant/après par clé, visible dans l'Audit.
- **Vue rapide (slide-over) sur les sous-users**, alternative légère au dialog plein écran.
- **Dashboard Analytics complet** : tendance pool, répartition pays/provider/protocole, distribution de latence, top proxies.
- **Comparaison période sur période** sur les rapports (deltas +/- %).
- **Heatmap calendrier** de l'activité quotidienne (12 derniers mois).
- **Export PDF** des rapports.
- **Animations UI** : transitions de page, effet press sur les boutons, hover sur les cards.

## v2.1.x

### v2.1.0
- **Thème custom du panel** (color pickers façon tweakcn.com), avec reset au thème par défaut.
- **Alerte seuil pool de proxies bas** (in-app + Discord/Slack/BloumeChat).
- **Import CSV en masse de sous-users.**
- **Vue "santé système"** (RAM/CPU/latence DB/threads) sur le dashboard.
- **Recherche globale** Cmd/Ctrl+K (navigation + sous-users + utilisateurs).
- **Mode compact** pour les tableaux (densité d'affichage).
- **Import/export de la configuration complète** (settings + sources scraper).
- **Rôle SUPPORT** (lecture seule : dashboard, pool, logs, rapports, audit).
- **Liens de partage temporaires** pour les comptes proxy (accès sans login, expiration configurable, révocable).

## v2.0.x

### v2.0.25
- **Notification à chaque déclenchement manuel du scraper** — `POST /api/panel/scraper-sources/run` créait un cycle de scraping sans qu'aucune notification (in-app / Discord / Slack / BloumeChat) ne soit émise. Le lancement manuel envoie désormais une notification `NotificationService.notifyScraperRun(...)`, avec l'email de l'admin qui a déclenché le cycle.
- **Icône et nom du panel personnalisables** : Settings > Général expose désormais un champ "Icône du panel" (`logoUrl`) à côté du nom du site (`siteName`), tous deux affichés dans l'en-tête du panel. Le **footer** ("UHQ Panel OS by Bloume.fr", crédit éditeur) reste volontairement figé et n'est plus affecté par ces réglages.

### v2.0.24
- **Perf : empreinte mémoire/CPU du checker et du scraper réduite** — sans changement de comportement (vérifié par revue adversariale multi-agents), aucune réécriture du cœur métier.
  - **Checker** — le cycle de vérification ne charge plus que les colonnes réellement lues (`id/url/ip/port/protocol`) au lieu de toutes les colonnes de `BackendProxy` pour le lot de ~150 000 candidats (~3× moins de RAM). L'authentification des upstreams est désormais résolue paresseusement par chaque worker, au lieu de ~150 000 `new URL()` synchrones exécutés en amont qui gelaient brièvement l'event loop — partagé avec le serveur proxy live (`:990`).
  - **Scraper** — déduplication **incrémentale** au fil des sources (Map partagée) au lieu d'accumuler des millions d'entrées dans un seul tableau avant de dédupliquer : le pic mémoire retombe à « une source en vol + la Map d'uniques » au lieu de la somme de toutes les sources. Parsing accéléré : le nettoyage HTML est court-circuité sur les listes `ip:port` pures (aucune balise) et l'extraction de candidats évite une passe regex sur chaque ligne dépourvue de schéma `://`.

### v2.0.23
- **Fix : port dédié par catégorie (pool)** — un compte assigné à une pool ayant son propre domaine/port était accessible via n'importe quel autre port (port par défaut, ou port d'une autre pool) ; seule l'exclusivité de port *par compte* était vérifiée. Le compte est désormais rejeté (407) si la connexion n'arrive pas sur le port dédié de sa pool.
- **Fix : pools "Toujours en ligne" jamais KO** — un échec de connexion réel (rare, souvent transitoire) marquait quand même le proxy `isWorking=false` en base pour les pools `alwaysOnline`, cassant la promesse "jamais KO" et rétrécissant la pool jusqu'au prochain cycle du checker au lieu de basculer proprement sur le fallback résidentiel pour la requête en cours.
- **Fix : import de proxies plus tolérant** — réimporter un proxy déjà archivé/mort, ou déjà assigné à une autre catégorie, renvoyait silencieusement "0 proxy importé" et le rendait invisible dans la catégorie visée (`POST /monitoring/proxies/import` utilisait `createMany`+`skipDuplicates`, qui ignore toute ligne dont l'URL existe déjà). Remplacé par un upsert par ligne qui réactive le proxy existant (`isWorking`/`archived`/`failCount` remis à zéro) et le réassigne à la catégorie demandée.
- **`GET /api/v1/sub-user/usage-stat/get`** renvoie désormais `host`/`port` dans la réponse, résolus selon le domaine/port propre du compte, sinon ceux de sa catégorie, sinon les valeurs globales (Settings > Proxy public) — même logique que `get-sticky-proxies`.

### v2.0.22
- **Pays prioritaires pour les IP simulées** : `ProxyPool.fakePriorityCountries`, un sous-ensemble de `fakeCountries` qui tire **toujours** un nombre d'IP plus élevé que les pays non listés — la plage configurée est découpée en deux moitiés disjointes (prioritaire = moitié haute), garanti quel que soit le tirage, en mode stable comme en mode rotatif. Sans effet en valeur fixe.
- **Interne** : logique de tirage/hash des IP simulées consolidée dans `common/utils/fake-stats.ts` au lieu d'être dupliquée entre le module Proxy Pools et l'API legacy.

### v2.0.21
- **Pays simulés sans limite** : le champ `fakeCountries` n'est plus borné à 255 caractères — listez autant de pays que vous voulez.
- **Mode rotatif pour les IP simulées** : intervalle en secondes optionnel (`ProxyPool.fakeIpRotateSeconds`) — l'IP simulée de chaque pays change alors automatiquement à chaque fenêtre de temps écoulée, calculée à la volée par `category-stats` (hash déterministe, aucune tâche planifiée ni écriture en base). Toggle dans le dialogue de modification d'un pool ; le bouton "Régénérer" se masque automatiquement quand le mode rotatif est actif.

### v2.0.20
- **Pays/IP simulés — tirage indépendant par pays** : `fakeIpCountMin`/`fakeIpCountMax` ne décrivent plus un total partagé réparti par pondération entre les pays de `fakeCountries` — **chaque pays tire désormais son propre nombre indépendamment** dans cette plage (`ProxyPool.fakeIpCountByCountry`). Ajouter un pays lui donne immédiatement son propre tirage, sans changer les chiffres déjà affichés pour les autres pays ; changer la plage re-tire tout le monde.
- **Nouveau bouton "Régénérer les IP simulées"** (panel, dialogue de modification d'un pool) : force un nouveau tirage pour tous les pays déjà configurés, sans toucher à la plage (`POST /api/panel/proxy-pools/:id/reroll-fake-ips`).
- **Fix : `GET /api/v1/common/category-stats?pool=` ratait silencieusement une pool** si son nom contenait un espace insécable ou une double-espace (artefact de copier-coller) — le matching se fait désormais sur un nom normalisé (Unicode NFC + espaces réduits) plutôt qu'une égalité octet pour octet.

### v2.0.19
- **Fix : pays/IP simulés invisibles dans le panel sans "Toujours en ligne"** — `fakeCountries`/`fakeIpCount` fonctionnent depuis v2.0.17 indépendamment d'`alwaysOnline`, mais la page **Proxy Pools** ne montrait le badge récapitulatif (pays · nb d'IP) que si `alwaysOnline` était activé. Badge dédié désormais affiché dès qu'un nombre d'IP simulé est configuré, peu importe ce réglage.
- **Fix : `GET /api/v1/common/category-stats?pool=`** plus robuste — le nom de pool passé en query est désormais nettoyé (`trim`) avant la recherche, évitant qu'un espace parasite empêche silencieusement l'ajout des stats simulées.
- **Sécurité — moteur proxy (`:990`)** : la vérification du mot de passe des sous-utilisateurs utilisait une comparaison de chaîne classique (`!==`), vulnérable à une attaque temporelle. Remplacée par une comparaison à temps constant (`crypto.timingSafeEqual`), comme c'était déjà le cas pour les clés API.
- **Sécurité — fuite de JWT par URL** : le guard JWT global (`/api/panel/*`) acceptait le token via `?token=` sur **toutes** les routes protégées, alors que ce fallback n'était nécessaire que pour deux cas précis (doc API embarquée, flux SSE). Un token transmis en query string se retrouve dans les logs serveur, l'historique navigateur et l'en-tête `Referer` envoyé à des tiers. Le fallback générique est retiré du guard ; `GET /docs/spec` valide désormais son token lui-même (même schéma que `logs/stream`), sans rien casser pour la doc embarquée.

### v2.0.18
- **Fix : suppression définitive de proxies KO** — une tâche d'arrière-plan purgeait toutes les 12h (et pour toujours) les proxies `isWorking=false` en base, y compris des proxies manuels valides (hostname) temporairement indisponibles. Cette purge automatique a été **retirée**.
- **Nouveau : archivage des proxies morts définitifs** — un proxy ayant atteint `deadProxyMaxRetries` échecs consécutifs est désormais marqué `archived` (au lieu d'être supprimé) : plus jamais re-testé par le checker, plus jamais réactivé/écrasé par un re-scrape. Seule une suppression manuelle depuis le panel (Pool) peut encore le faire sortir de la base.
- **Traductions manquantes du journal d'audit** (`/audit`) : les actions (`pool.update`, `auth.login`, `proxy.delete`, etc.) sont désormais traduites en FR/EN au lieu d'afficher la clé technique brute.

### v2.0.17
- **Pays/IP simulés découplés de "Toujours en ligne"** : `fakeCountries`/`fakeIpCount` fonctionnent désormais sur **n'importe quelle pool**, sans activer `alwaysOnline`. Les chiffres simulés s'**ajoutent** aux vraies stats (jamais un remplacement) — une pool sans aucun vrai proxy n'affiche que le simulé, une pool avec du vrai stock affiche réel + simulé combiné. `alwaysOnline` reste un réglage indépendant, qui ne contrôle plus que le comportement du checker.
- **Anti-spam scraper renforcé** : la validation IPv4 stricte (déjà ajoutée pour le checker) couvre maintenant aussi les 3 étapes de détection du scraper (regex personnalisée, `parseProxyList`, scan brut) — une source renvoyant du texte pollué (export Tor, etc.) ne peut plus faire entrer de fausses entrées `ip:port` dans le pool.
- **Notifications du panel** : remplacement du système maison (event-bus + composant custom) par [sonner](https://sonner.emilkowal.ski/) (shadcn/ui) — rendu plus moderne (couleurs riches par type, empilement, thème clair/sombre auto). Même API `toast.success/error/info/warning(...)` côté code, rien à changer dans les pages existantes.
- **Performances de l'API panel** :
  - Nouveaux index DB (`BackendProxy.isWorking/isBlacklisted/provider`, `ProxyUsage.userProxyId+date/date`).
  - `monitoring/live`, `monitoring/pool`, `monitoring/countries` et `monitoring/reports` agrègent désormais côté base (`groupBy`/`aggregate`) au lieu de charger tout le pool de proxies ou tout l'historique de trafic en mémoire pour les sommer en JS.
  - `me/proxies/:id/usage` : sommes calculées en DB, plus de chargement illimité de lignes pour ne garder que les 100 affichées.
  - Nettoyage des entrées malformées du checker batché (un seul lot) au lieu d'un appel DB par ligne.

### v2.0.16
- **Pools "Toujours en ligne" + stats simulées** : une pool peut être marquée pour que ses proxies ne soient **jamais** testés/marqués KO par le checker (forcés en ligne à chaque cycle ; le test manuel "Tester" reste un vrai diagnostic mais ne marque jamais KO en DB pour ces pools).
  - Pays simulés (codes ISO) + nombre d'IP simulé (valeur fixe ou plage aléatoire tirée une fois, stable) configurables par pool.
  - `GET /api/v1/common/category-stats?pool=<nom>` renvoie ces stats synthétiques (répartition déterministe par pays) pour une pool ainsi configurée, comme s'il s'agissait d'un vrai pool géolocalisé. Les autres endpoints stats (`pool_stats`, `countries`, `proxies`) restent sur les vraies données.
- **Fix : suppression en masse des proxies morts** (`DELETE /api/panel/monitoring/proxies`) pouvait supprimer des proxies **définitivement blacklistés** (`isBlacklisted=true`) selon le filtre utilisé — désormais exclus systématiquement, quel que soit l'appel. Seule la suppression individuelle (`DELETE .../proxies/:id`) peut encore cibler un proxy blacklisté, en connaissance de cause.
- **Résolution domaine/port étendue à l'API legacy** : `GET /api/v1/sub-user/list`, `/get-sticky-proxies`, `/api/v1/me/proxies` et `/proxies/sticky-list` utilisent désormais la même cascade compte → pool → réglages globaux que le panel (nouveaux champs `host`/`port` en lecture sur les listes ; champ d'écriture toujours panel-only, l'API legacy reste inchangée côté contrat).
- **Format rotatif sans session** (`username:password@host:port`, sans `session`) ajouté aux réponses sticky-list (panel admin/self-service + legacy) — pratique pour les clients qui n'ont pas besoin du format complet `host:port:user:session:pass`.
- **Panel — visibilité des surcharges** :
  - Settings > Proxy public affiche désormais une section "Surcharges actives" listant les pools/comptes ayant leur propre port/domaine dédié.
  - "Mes Proxies" affiche une ligne "Connexion" avec le `host:port` réellement utilisé (résolu via la cascade), plus seulement le champ brut du compte.

### v2.0.15
- **Plage de ports dédiés élargie** : `9000-9100` → **`9000-9999`** (`docker-compose.yml` + `PROXY_PORT_RANGE`). Pensez à élargir votre propre `docker-compose.yml` avant de redéployer si vous l'aviez déjà personnalisé.
- **Domaine dédié (pools & sous-utilisateurs)** : en plus du port, un pool (`Proxy Pools`) ou un sous-utilisateur peut désormais recevoir un **domaine** affiché dans ses listes/connexions (ex. `mobile.example.com`).
  - Optionnel — vide = utilise l'hôte proxy public global (`publicProxyHost`, Settings > Proxy public).
  - Résolution en cascade pour un compte : son propre domaine → celui de sa pool (si assignée) → `publicProxyHost`. Même logique pour le port (son propre port → celui de sa pool → `publicProxyPort`).
  - Purement informatif (DNS) : n'affecte pas le bind réseau réel du moteur, seulement le `host:port` affiché dans les listes sticky et le générateur de format.
  - Settings > Proxy public : les champs `publicProxyHost`/`publicProxyPort` indiquent désormais explicitement qu'ils peuvent être surchargés par pool/compte.
  - **API legacy (`/api/v1`) inchangée**, comme pour le port dédié.

### v2.0.14
- **Ports dédiés (pools & sous-utilisateurs)** : le moteur proxy peut désormais écouter sur **plusieurs ports** en plus du port partagé (`990`, inchangé).
  - **Port par catégorie** : un pool (`Proxy Pools`) peut recevoir un port dédié — toute connexion sur ce port utilise cette catégorie, même si le compte qui se connecte a une autre catégorie par défaut. Permet à un seul compte d'accéder à plusieurs catégories simplement en changeant de port.
  - **Port par compte** : un sous-utilisateur peut recevoir son propre port dédié — voie exclusive (toute autre identification est rejetée sur ce port), comportement sinon identique au port partagé.
  - Personnalisable mais **contraint à la plage 9000-9100**, qui doit être publiée par Docker (`docker-compose.yml` + `PROXY_PORT_RANGE`) pour être joignable depuis l'extérieur. Un port hors plage est refusé à l'écriture.
  - Les ports s'activent/se désactivent en live (sans redémarrage de l'API) dès l'enregistrement dans le panel.
  - **API legacy (`/api/v1`) inchangée** : ce champ n'est lisible/modifiable que depuis le panel admin (Pools, Sous-utilisateurs).

### v2.0.13
- **Checker — vérifications renforcées** :
  - Timeout du health-check configurable (`checkerTimeout`, Settings > Scraper/Checker) — auparavant figé à 5s, ce qui pouvait marquer KO à tort des proxies lents (résidentiels, longue distance).
  - Retry automatique avant de déclarer un proxy mort : un aléa réseau ponctuel (RST transitoire, surcharge momentanée) ne suffit plus à l'invalider pour tout un cycle.
  - `averageLatency` / `successCount` / `failureCount` étaient lus par le scoring de sélection des proxies et par la colonne latence du Pool, mais n'étaient écrits nulle part dans le code — le checker les renseigne désormais à chaque cycle.
  - Nouveau bouton **Tester** par proxy dans le Pool : test immédiat (latence + pays détecté), sans attendre le prochain cycle périodique.
- **API legacy (`/api/v1`)** :
  - `GET /api/v1/common/proxies` renvoie désormais `latency_ms` par proxy.
  - Nouvel endpoint `GET /api/v1/common/category-stats?pool=<nom>` (clé API, scope `read:pool`) : nombre de pays et d'IPs disponibles dans une catégorie (pool), avec répartition détaillée par pays.

### v2.0.12
- Scraper : plafond de 50 000 entrées par source + cession périodique de l'event-loop pendant le dédoublonnage — une source renvoyant un volume aberrant (jusqu'à ~1M d'entrées observées) gelait tout le process (scraper **et** moteur proxy live, même thread Node) pendant plusieurs minutes.
- Scraper : l'échantillon plafonné à 50k par source est désormais aléatoire (Fisher-Yates partiel) plutôt qu'un préfixe fixe — une source énorme finit par être couverte intégralement sur plusieurs cycles au lieu de rester bloquée sur ses 50k premières entrées.
- Scraper : seuil de re-scrape anticipé (« pool < 5000 ») exposé en tant que setting `scraperMinPoolSize` (Settings > Scraper) au lieu d'une constante figée dans le code.
- Scraper + Checker : `scrapeInterval`, `geoResolveInterval` et `proxyCheckInterval` ignoraient une valeur à 0/vide/négative (`Number('')`/`Number('0')` restent valides pour `getNumber()`) — la boucle correspondante tournait alors en continu sans pause. Nouveau garde-fou `getPositiveNumber()`.

### v2.0.11
- **Proxy Pools — catégories de proxies** : nouveau module permettant de segmenter le stock en pools nommés (Datacenter, Résidentiel, Mobile…).
  - Page dédiée **Proxy Pools** (menu latéral) : CRUD complet avec couleur personnalisable.
  - Champ **Pool** sur les proxies importés, les sources de scraping et les sous-utilisateurs.
  - Le scraper propage automatiquement le pool lors de l'ingestion : les proxies scrapés héritent du pool de leur source.
  - Le moteur proxy filtre le cache upstream par `pool` dès qu'un sous-utilisateur est assigné — les listes privées (`customProxies`) restent indépendantes.
  - Filtre par pool dans la page **Pool de proxies** et badge pool dans **Sous-utilisateurs**.
  - API REST admin : `GET/POST /api/panel/proxy-pools`, `PATCH/DELETE /api/panel/proxy-pools/:id`.

### v2.0.10
- **Scraper — auto-détection du protocole** : nouveau mode `Auto-détection` (valeur `auto`) dans les sources de scraping.  
  - Si le contenu retourné contient des URLs avec schéma explicite (`http://ip:port`, `socks5://ip:port`), le protocole est lu directement depuis le contenu.  
  - Fonctionne avec les APIs de listes publiques (ex. ProxyScrape, ProxyList.to, GitHub raw…) qui retournent `http://ip:port` ou `socks5://…`.  
  - Fallback `http` si aucun schéma détecté.
- **Scraper — parsing HTML** : le parser extrait maintenant les proxies depuis des pages HTML (liens `href="http://…"`, tableaux, etc.) sans regex personnalisée.
- **Extensions officielles** : l'onglet Extensions affiche les addons officiels gratuits (Wallet, Orders) avec description, fonctionnalités, lien GitHub et docs. Aucune configuration requise, tiré depuis `/api/panel/addons/registry`.
- **Addon Orders v1.1.0** : livraison automatique de comptes proxy après paiement (`panel_account` mode), rollback sur échec, révocation à l'annulation.

### v2.0.9
- Proxy (listes privées) : refonte de la connexion aux upstreams `customProxies` pour fiabiliser **tous les fournisseurs**.
  - **Handshake HTTP CONNECT** : ajout du header `Host` (requis par HTTP/1.1) + `User-Agent`/`Proxy-Connection`. Beaucoup de passerelles commerciales rejetaient un CONNECT sans `Host` (proxy qui marche en curl mais échouait dans le moteur). S'applique au moteur **et** au checker.
  - **Auto-détection du protocole** : une ligne sans schéma (`user:pass@host:port`) est testée en HTTP → SOCKS5 → SOCKS4, le premier qui répond gagne. Un schéma explicite (`socks5://…`) est respecté.
  - **Essais séquentiels (HTTP d'abord)** : les variantes sont testées une par une (comme curl), plus en parallèle — évite les limites de connexions simultanées des fournisseurs résidentiels.
  - **Timeout** aligné sur le fallback pour les listes privées (résidentiel/rotatif lent).
  - Plus de spam `Record to update not found` : les upstreams privés (`custom:*`) ne sont plus traités comme des `BackendProxy` en base.
- Fix : édition d'un compte proxy depuis le panel renvoyait « id doit être une chaîne de caractères » (l'`id` passe par l'URL, plus par le body).
- Fix : le footer affiche désormais la **vraie version** (lue depuis `package.json`), au lieu de rester figé sur la valeur écrite en base au setup initial.

### v2.0.6
- Fix : les paramètres `bloumechatWebhookUrl`, `bloumechatAlertsEnabled`, `skipDeadProxies` et `deadProxyMaxRetries` n'étaient pas enregistrés (absents de la liste blanche `UpdateSettingsDto` → supprimés par la `ValidationPipe`). Le panel affichait « enregistré » sans rien persister. Corrigé.

### v2.0.5
- Checker : incrémentation du `failCount` à chaque vérification échouée, reset à 0 si le proxy repasse actif
- Scraper : les proxies définitivement morts (`failCount ≥ maxRetries`) ne sont plus réactivés lors du re-scraping ; édition d'une source via une boîte de dialogue dédiée
- Pool : colonne `Échecs`, filtre par statut (actifs / morts / définitifs), réactivation individuelle et en masse ; bascule blacklist par proxy ; export du pool en texte (`ip:port[:user:pass]`)
- Utilisateurs panel : CRUD complet (édition e-mail / rôle / mot de passe / expiration / actif, colonne « créé le »)
- Sous-utilisateurs : réinitialisation du trafic, copie des identifiants, sélection multiple + actions en masse (bloquer / débloquer / reset trafic / supprimer)
- Webhooks : bouton « Tester le webhook » (Discord, Slack) et **nouveau provider BloumeChat**
- Settings : nouveaux paramètres `skipDeadProxies`, `deadProxyMaxRetries`, `bloumechatWebhookUrl`, `bloumechatAlertsEnabled`
- API : messages de réponse traduits (namespace i18n `info`, fr + en)
- Docker : port proxy hardcodé `990:990/tcp` (plus de variable d'expansion fragile), `PROXY_PORT` et `API_PORT` injectés explicitement
- Docs : pages `configuration`, `docker`, `api/zones`, `api/icons` créées ; `installation` mise à jour

### v2.0.4
- Fix : déplacement de la dépendance Prisma dans `dependencies` (évite le pruning en production)

### v2.0.3
- Génération automatique du JWT secret au 1er boot
- Gestion améliorée de l'environnement dans le processus de build

### v2.0.2
- Fix import `randomBytes` depuis `crypto` pour une meilleure sécurité

### v2.0.0 — Refonte majeure
- Migration complète vers NestJS 10 + React 18 + Vite
- Moteur proxy TCP intégré (remplacement de l'ancienne architecture Python)
- Système d'addons modulaires
- Panel React moderne (Tailwind + shadcn)
- Authentification JWT + clé API legacy `/api/v1/*`
- Wizard de setup au premier démarrage
- Support SMTP complet (notifications, rapports, reset mot de passe)
- Captcha (hCaptcha, reCAPTCHA, Turnstile, CAP)
- Webhooks Discord et Slack
- Sauvegardes automatiques (local + S3)
- Checker de santé des proxies avec résolution géographique réelle
- i18n panel et API (fr, en)

---

## v1.x (legacy)

Les versions 1.x utilisaient une architecture Python (FastAPI) + panel React minimal. La migration vers la v2 est une réécriture complète — les données PostgreSQL existantes sont compatibles via Prisma.
