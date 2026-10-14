/** Textes de la visite guidée (clé `tour.<id>.t` = titre, `.b` = texte). Voir lib/tour/steps.ts. */
export const tourFr: Record<string, string> = {
  'tour.start': 'Visite guidée',
  'tour.startHint': 'Relancer la visite guidée du panel',
  'tour.next': 'Suivant',
  'tour.prev': 'Précédent',
  'tour.skip': 'Passer la visite',
  'tour.finish': 'Terminer',
  'tour.step': 'Étape {n} sur {total}',
  'tour.offscreen': 'Cet élément est masqué sur petit écran : ouvrez le menu (☰) pour le voir.',

  // ───────────── Installation & fonctionnement ─────────────
  'tour.welcome.t': 'Bienvenue sur UHQ Panel OS 🎉',
  'tour.welcome.b':
    "L'installation est terminée. Cette visite d'environ 5 minutes vous explique, étape par étape, comment le panel fonctionne et où régler chaque chose.\n\nUtilisez « Suivant » (ou les flèches ← → du clavier). Vous pouvez quitter à tout moment avec « Passer la visite » ou Échap, et la relancer depuis l'icône ? en haut à droite.",
  'tour.welcomeUser.t': 'Bienvenue 👋',
  'tour.welcomeUser.b':
    "Voici un tour rapide de votre espace : vos proxies, vos clés API et la sécurité de votre compte. « Suivant » pour continuer, Échap pour quitter.",
  'tour.architecture.t': "Comment ça marche : l'architecture",
  'tour.architecture.b':
    "UHQ Panel OS est une seule application (une seule image Docker) qui fait trois choses :\n• le panel web et l'API REST, sur le port 8000 (cette interface) ;\n• le moteur proxy TCP, sur le port 990, que vos clients utilisent comme un proxy HTTP/HTTPS/SOCKS5 ;\n• la connexion à une base PostgreSQL qui stocke tout (comptes, proxies, réglages, historique).\n\nLe panel ne vend pas ses propres IP : il revend un pool de proxies amont (scrapés, importés ou achetés chez un fournisseur) via des comptes que vous créez.",
  'tour.install.t': "Les façons d'installer le panel",
  'tour.install.b':
    "Vous avez déjà choisi la vôtre, mais voici toutes les possibilités :\n• Docker Compose « tout-en-un » : le fichier docker-compose.yml lance le panel + une base PostgreSQL embarquée. Zéro configuration.\n• Coolify (build depuis GitHub) : déploiement depuis les sources du dépôt. Après chaque mise à jour du code, cliquez sur « Redeploy », puis vérifiez le numéro de version dans le pied de page.\n• Base externe : au premier démarrage, l'écran « Base de données » accepte n'importe quelle URL PostgreSQL (postgresql://utilisateur:motdepasse@hôte:5432/base) ; la base est créée si besoin et le schéma appliqué automatiquement.\n• Restauration : sur la page /setup d'une installation vierge, l'onglet « Restaurer une sauvegarde » accepte une sauvegarde du panel (.json) ou le dossier de données PostgreSQL 16 (.tar.gz). Cet écran se verrouille dès que l'installation est terminée.",
  'tour.network.t': 'Ports, domaine et pare-feu',
  'tour.network.b':
    "Pour que vos clients puissent se connecter :\n• Le port 8000 (panel/API) est publié derrière votre domaine HTTPS (Traefik/Coolify, Nginx, Cloudflare…).\n• Le port TCP 990 (moteur proxy) doit être publié sur l'hôte et ouvert dans le pare-feu. Il ne passe PAS par Cloudflare ni par un reverse-proxy HTTP : utilisez l'IP du serveur ou un domaine en DNS seul (nuage gris).\n• La plage 9000–9250 sert aux ports dédiés (un port réservé à un compte ou à une catégorie).\n• Indiquez l'hôte et le port affichés à vos clients dans Paramètres → Moteur proxy.",
  'tour.flow.t': "Le trajet d'une connexion proxy",
  'tour.flow.b':
    "1. Le client se connecte à host:990 avec l'identifiant et le mot de passe d'un compte proxy.\n2. Le panel vérifie le compte (actif, non expiré, quota, IP autorisées, threads) et choisit un proxy amont dans le pool de sa catégorie.\n3. Plusieurs candidats sont testés en course : le plus rapide gagne. En cas d'échec, un autre est essayé, puis le proxy de secours si le pool est vide.\n4. Le trafic est compté côté amont (octets réellement facturés) et imputé au compte, avec le multiplicateur de la catégorie.\n5. Si le quota est atteint, les tunnels du compte sont coupés immédiatement.",
  'tour.checklist.t': 'Les 6 premières choses à faire',
  'tour.checklist.b':
    "1. Paramètres → Moteur proxy : renseigner l'hôte et le port publics.\n2. Alimenter le pool : ajouter des sources de scraping (Sources scraper) ou importer vos proxies (Pool de proxies).\n3. Créer une catégorie (Catégories proxies) pour regrouper des proxies et leur appliquer des règles.\n4. Créer un compte proxy (Comptes proxy) avec son quota et sa catégorie.\n5. Tester la connexion avec la ligne host:port:user:pass du compte.\n6. Sécuriser : 2FA admin, captcha, sauvegardes automatiques (Paramètres).\n\nLes étapes suivantes détaillent chacune de ces pages.",

  // ───────────── Interface ─────────────
  'tour.sidebar.t': 'Le menu latéral',
  'tour.sidebar.b':
    "Toutes les pages sont ici, classées par sections : Gestion, Collecte & sécurité, Supervision, Système, Extensions et Compte. Les pages affichées dépendent de votre rôle (administrateur, support ou utilisateur). Sur téléphone, il s'ouvre avec le bouton ☰.",
  'tour.search.t': 'Recherche globale',
  'tour.search.b': "Tapez pour retrouver instantanément une page du panel, un compte proxy ou un utilisateur. Pratique pour naviguer sans passer par le menu.",
  'tour.lang.t': 'Langue',
  'tour.lang.b': "Change la langue de l'interface (français, anglais…). Le choix est mémorisé dans ce navigateur. La langue par défaut du site se règle dans Paramètres → Général.",
  'tour.theme.t': 'Thème clair / sombre',
  'tour.theme.b': "Bascule entre le mode clair et le mode sombre. Les couleurs elles-mêmes se personnalisent dans Paramètres → Thème.",
  'tour.density.t': 'Densité des tableaux',
  'tour.density.b': "Mode confortable (aéré) ou compact (plus de lignes à l'écran). Pratique avec de grosses listes de comptes ou de proxies.",
  'tour.notifs.t': 'Notifications',
  'tour.notifs.b': "La cloche signale les événements importants : proxies morts, quotas dépassés, nouveaux utilisateurs, bannissements… Le badge rouge compte les non-lues. Les alertes peuvent aussi partir vers Discord, Slack ou BloumeChat (Paramètres → Webhooks).",
  'tour.dashboard.t': 'Tableau de bord',
  'tour.dashboard.b':
    "Le cœur de la supervision, en temps réel :\n• threads et sessions actifs, proxies fonctionnels / total / bannis ;\n• consommation et requêtes du jour ;\n• domaines les plus utilisés, comptes actifs, bande passante et quotas ;\n• santé du pool (par fournisseur, protocole, pays) et santé système.\nLes extensions actives peuvent y ajouter leurs propres widgets.",
  'tour.subusers.t': 'Comptes proxy',
  'tour.subusers.b':
    "C'est ici que vous créez ce que vos clients utilisent. Chaque compte a :\n• un identifiant + mot de passe, un libellé, des tags, une catégorie ;\n• un quota de trafic (en Go décimaux, 0 = illimité), une limite de threads, une bande passante maximale (ko/s) et une date d'expiration ;\n• des options : filtre pays, IP autorisées, domaines bloqués, TTL de session sticky, port ou domaine dédié ;\n• en option, une liste de proxies privée qui remplace le pool partagé.\nBoutons utiles : générer une liste sticky (une IP fixe par session), réinitialiser le trafic, bloquer/débloquer, voir les statistiques, partager un lien, actions en masse.\nLa ligne de connexion à donner au client est host:port:identifiant:motdepasse.",
  'tour.users.t': 'Utilisateurs du panel',
  'tour.users.b':
    "Les personnes qui se connectent à CE panel (à ne pas confondre avec les comptes proxy). Trois rôles :\n• Admin : tout gérer ;\n• Support : lecture seule sur la supervision ;\n• Utilisateur : voit uniquement ses propres comptes proxy.\nVous pouvez créer, modifier, désactiver, fixer une expiration, inviter par e-mail, assigner des comptes proxy à un utilisateur et exporter en CSV. La colonne 2FA indique qui a activé la double authentification.",
  'tour.pool.t': 'Pool de proxies',
  'tour.pool.b':
    "La liste de tous les proxies amont utilisés par le moteur. Vous pouvez :\n• importer vos proxies (un par ligne : ip:port, proto://ip:port ou ip:port:user:pass) en forçant le protocole si besoin ;\n• filtrer par état (actifs, morts, définitifs), catégorie, pays ;\n• tester la latence d'un proxy, le réactiver, le blacklister ou le supprimer ;\n• supprimer tous les proxies KO ou réactiver tous les morts ;\n• définir un proxy de secours (fallback), utilisé quand le pool est épuisé.",
  'tour.proxypools.t': 'Catégories de proxies',
  'tour.proxypools.b':
    "Regroupez vos proxies (Datacenter, Mobile, Résidentiel…) et appliquez des règles à toute la catégorie :\n• port et domaine dédiés ;\n• « Toujours en ligne » (jamais marqués morts) et activation du checker ;\n• multiplicateur de consommation (×2 = chaque Go consommé compte double) ;\n• Anti-VPN (refuse et bannit 24 h les IP clientes identifiées VPN) ;\n• pays et nombre d'IP affichés (simulés).\nLes sources de scraping et les comptes proxy se rattachent à une catégorie.",
  'tour.scraper.t': 'Sources de scraping',
  'tour.scraper.b':
    "Le panel ne contient aucune source par défaut (hors IA Groq) : vous ajoutez les vôtres.\n• Une source = une URL + une regex à deux groupes (IP, port). Les URL en masse sont acceptées (une par ligne).\n• « Détecter avec Groq » devine la regex pour vous si une clé Groq est configurée.\n• Testez une source, lancez un cycle à la main, ou laissez la boucle automatique tourner à l'intervalle choisi.\nLes proxies collectés sont dédoublonnés et envoyés au checker.",
  'tour.checker.t': 'Checker',
  'tour.checker.b':
    "Le vérificateur teste en boucle les proxies du pool : latence, pays, fonctionnement. Un proxy qui échoue trop souvent est marqué mort puis blacklisté. Cette page montre l'état en direct (progression, durée, fonctionnels/morts, santé globale) et les journaux du checker. Vous pouvez arrêter/démarrer la boucle ou lancer un cycle immédiat. Les intervalles et la concurrence se règlent dans Paramètres → Scraper.",
  'tour.bannedips.t': 'IP bannies',
  'tour.bannedips.b': "Bloque totalement une IP cliente : le contrôle a lieu avant même l'authentification, à chaque connexion. Les bannissements sont manuels ou automatiques (trop d'échecs d'authentification, anti-VPN). Vous pouvez en ajouter, en retirer et voir la raison de chacun.",
  'tour.analytics.t': 'Analytics',
  'tour.analytics.b': "Santé et performance du pool dans le temps : proxies actifs, latences, répartition par fournisseur/protocole/pays, historique. Pour des statistiques d'usage encore plus poussées (heures de pointe, par compte, par catégorie), activez l'extension Analytics.",
  'tour.logs.t': 'Journaux en direct',
  'tour.logs.b': "Le flux des logs du serveur en temps réel : connexions, erreurs, cycles du scraper et du checker. Filtrez par niveau, mettez en pause, téléchargez ou effacez, et gardez-le ouvert pour diagnostiquer un incident.",
  'tour.reports.t': 'Rapports & statistiques',
  'tour.reports.b': "Consommation et usage par période (jour, semaine, mois, année ou tout l'historique), par compte et par utilisateur. Des rapports périodiques peuvent aussi être envoyés par e-mail (Paramètres → E-mail).",
  'tour.audit.t': "Journal d'audit",
  'tour.audit.b': "L'historique de toutes les actions faites sur le panel par les administrateurs (création de compte, changement de réglage, régénération de clé API…) : qui, quoi, quand. Indispensable pour retrouver l'origine d'une modification.",
  'tour.addons.t': 'Extensions',
  'tour.addons.b':
    "Ajoutez des fonctions au panel sans toucher au code :\n• Extensions officielles gratuites (Wallet, Orders, Analytics) : embarquées dans l'image, elles s'activent en un clic avec « Activer ». Leur état est conservé après un redémarrage.\n• Extensions externes : collez l'URL d'un service qui expose un manifest JSON ; le panel y lit les pages, widgets et menus à intégrer.\nChaque extension peut ajouter des pages au menu, des widgets au tableau de bord et des réglages.",
  'tour.addondocs.t': 'Guide développeur',
  'tour.addondocs.b': "Pour créer votre propre extension : format du manifest, emplacements disponibles (pages, widgets, barre du haut), authentification et exemples. Utile uniquement si vous développez des extensions.",
  'tour.docs.t': 'Documentation API',
  'tour.docs.b': "Ouvre la documentation interactive de l'API REST (Swagger/Scalar) dans un nouvel onglet : toutes les routes, les paramètres et les exemples pour automatiser le panel.",

  // ───────────── Paramètres ─────────────
  'tour.settings.t': 'Paramètres',
  'tour.settings.b': "Le centre de configuration. Les onglets de gauche sont regroupés par thème (Aperçu, Général, Sécurité, Moteur proxy, Communications, Système, Extensions). Les étapes suivantes parcourent chaque onglet. Pensez à cliquer sur « Enregistrer » après toute modification.",
  'tour.s_dashboard.t': 'Paramètres › Tableau de bord',
  'tour.s_dashboard.b': "Un aperçu en direct du moteur : threads actifs, sessions, santé du pool et charge système. Aucun réglage ici, c'est un coup d'œil rapide.",
  'tour.s_general.t': 'Paramètres › Général',
  'tour.s_general.b': "Identité du panel : nom et logo (affichés dans l'en-tête), langue par défaut, ouverture ou fermeture des inscriptions publiques, invitations, mode maintenance, ainsi que l'import/export de configuration.",
  'tour.s_theme.t': 'Paramètres › Thème',
  'tour.s_theme.b': "Personnalisez les couleurs du panel en mode clair et sombre, ou importez un thème depuis tweakcn. Le thème s'applique aussi aux extensions.",
  'tour.s_security.t': 'Paramètres › Sécurité',
  'tour.s_security.b': "2FA obligatoire pour les administrateurs, protection anti-brute-force du moteur proxy (bannissement automatique après trop d'échecs), confiance dans les IP Cloudflare (à activer seulement derrière Cloudflare), durée de bannissement des VPN, et durées de conservation des journaux, notifications et historiques.",
  'tour.s_captcha.t': 'Paramètres › Captcha',
  'tour.s_captcha.b': "Protection anti-bot sur la connexion, l'inscription et la réinitialisation de mot de passe. Choisissez hCaptcha, reCAPTCHA, Cloudflare Turnstile ou Cap, puis renseignez la clé du site et la clé secrète.",
  'tour.s_apikey.t': 'Paramètres › Clé API',
  'tour.s_apikey.b': "La clé de l'ancienne API /api/v1, envoyée dans l'en-tête X-API-Key ou en mot de passe Basic. Vous pouvez la révéler ou la régénérer (l'ancienne cesse de fonctionner immédiatement). Pour des clés avec portées et expiration, voir la page « Clés API ».",
  'tour.s_proxy.t': 'Paramètres › Moteur proxy',
  'tour.s_proxy.b': "L'hôte et le port publics affichés à vos clients (obligatoire pour que les lignes de connexion soient justes), les délais de connexion et de « racing » entre candidats, et la fermeture des tunnels inactifs.",
  'tour.s_scraper.t': 'Paramètres › Scraper',
  'tour.s_scraper.b': "Intervalles de collecte, de vérification et de résolution géographique, taille minimale du pool, concurrence et délai du checker, nombre d'échecs avant de déclarer un proxy mort, démarrage automatique des boucles, proxy de secours (fallback) et clé Groq pour l'IA.",
  'tour.s_smtp.t': 'Paramètres › E-mail (SMTP)',
  'tour.s_smtp.b': "Le serveur d'envoi d'e-mails : alertes de connexion, réinitialisation de mot de passe, invitations et rapports périodiques. Renseignez hôte, port, identifiants, expéditeur, puis envoyez un e-mail de test.",
  'tour.s_webhooks.t': 'Paramètres › Webhooks',
  'tour.s_webhooks.b': "Alertes vers Discord, Slack ou BloumeChat : quotas dépassés, proxies morts, pool presque vide, nouveaux utilisateurs. Collez l'URL du webhook et choisissez les alertes à activer.",
  'tour.s_backups.t': 'Paramètres › Sauvegardes',
  'tour.s_backups.b': "Sauvegardes automatiques de la base (planification cron), en stockage local ou S3-compatible. Vous pouvez lancer une sauvegarde à la main, restaurer ou supprimer une sauvegarde, et exporter/importer uniquement les réglages. À activer dès le départ : c'est votre filet de sécurité.",
  'tour.s_extensions.t': 'Paramètres › Extensions',
  'tour.s_extensions.b': "Les réglages propres aux extensions actives (boutique, solde, etc.). L'onglet est vide tant qu'aucune extension ne déclare de réglages.",

  // ───────────── Compte ─────────────
  'tour.apikeys.t': 'Clés API',
  'tour.apikeys.b': "Créez des clés API personnelles avec une portée (ce qu'elles ont le droit de faire) et une date d'expiration, pour automatiser le panel depuis vos scripts. La clé n'est affichée qu'une fois à la création : copiez-la tout de suite. Vous pouvez la révoquer à tout moment.",
  'tour.myproxies.t': 'Mes proxies',
  'tour.myproxies.b': "Vos comptes proxy : identifiant, mot de passe, trafic utilisé et quota, expiration. Vous y trouvez la ligne de connexion (host:port:identifiant:motdepasse), pouvez générer des listes sticky et consulter vos statistiques d'usage.",
  'tour.profile.t': 'Profil',
  'tour.profile.b': "Votre compte : e-mail et changement de mot de passe. Accessible aussi depuis la zone e-mail/rôle de la barre du haut.",
  'tour.security.t': 'Sécurité du compte',
  'tour.security.b': "Activez l'authentification à deux facteurs (application d'authentification + codes de secours) et gérez vos sessions actives en les déconnectant une à une. Fortement recommandé, obligatoire pour les admins si vous l'activez dans Paramètres → Sécurité.",
  'tour.about.t': 'À propos',
  'tour.about.b': "La version installée, les informations système et la vérification de mise à jour. Pour mettre à jour avec Coolify : « Redeploy », puis contrôlez que la version du pied de page correspond à la dernière release.",
  'tour.finish.t': "C'est terminé ! ✅",
  'tour.finish.b':
    "Vous connaissez maintenant tout le panel. Récapitulatif :\n• hôte/port publics → Paramètres → Moteur proxy ;\n• alimenter le pool → Sources scraper ou Pool de proxies ;\n• catégories → règles par groupe de proxies ;\n• comptes proxy → ce que vous donnez à vos clients ;\n• sauvegardes → Paramètres → Sauvegardes.\n\nVous pouvez relancer cette visite à tout moment avec l'icône ? en haut à droite.",
};
