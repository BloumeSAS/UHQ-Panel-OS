/**
 * Codes HTTP que vos clients peuvent voir à travers le proxy. Contrairement au catalogue du moteur (UHQ_*), ces codes ne viennent
 * PAS du panel : ils sont renvoyés par le site de destination (ou son CDN) et le proxy les transmet tels quels. C'est pour ça qu'un
 * client peut voir un « 303 » que vous ne voyez pas en testant : IP de sortie, pays, session, en-têtes ou outil différents.
 */
export type Origin = 'site' | 'cdn' | 'panel';
export type Family = '2xx' | '3xx' | '4xx' | '5xx';

interface Text {
  fr: string;
  en: string;
}
export interface HttpCode {
  status: number;
  family: Family;
  origin: Origin;
  title: Text;
  /** Ce que ça veut dire. */
  meaning: Text;
  /** Pourquoi le client le voit (et pas forcément vous). */
  why: Text;
  /** Quoi vérifier / faire. */
  action: Text;
  /** Réponse prête à envoyer au client. */
  customer: Text;
}

export const HTTP_CODES: HttpCode[] = [
  {
    status: 200, family: '2xx', origin: 'site',
    title: { fr: 'OK (mais pas la bonne page)', en: 'OK (but not the expected page)' },
    meaning: { fr: 'La requête a réussi. Le contenu peut toutefois être une page de blocage, un captcha ou une page de consentement renvoyée avec un 200.', en: 'The request succeeded. The content may still be a block page, a captcha or a consent page returned with a 200.' },
    why: { fr: 'Certains sites affichent un captcha ou « accès refusé » avec un code 200 : le client voit « ça marche » mais le contenu est inutile.', en: 'Some sites show a captcha or “access denied” with a 200: the customer sees “it works” but the content is useless.' },
    action: { fr: 'Demandez le corps de la réponse. Si c\'est une page de blocage : changer d\'IP (nouvelle session), de pays, ou ralentir.', en: 'Ask for the response body. If it is a block page: change IP (new session), country, or slow down.' },
    customer: { fr: 'Votre connexion fonctionne : c\'est le site qui affiche une page de vérification. Essayez avec une nouvelle session/IP ou un autre pays, et ralentissez le rythme des requêtes.', en: 'Your connection works: the site is showing a verification page. Try a new session/IP or another country, and slow down the request rate.' },
  },
  {
    status: 301, family: '3xx', origin: 'site',
    title: { fr: 'Déplacé définitivement', en: 'Moved Permanently' },
    meaning: { fr: 'L\'adresse a changé pour toujours : le site indique la nouvelle dans l\'en-tête Location (souvent http → https ou sans/avec « www »).', en: 'The address changed for good: the site gives the new one in the Location header (often http → https or with/without “www”).' },
    why: { fr: 'Un navigateur suit la redirection automatiquement ; un script ou un outil configuré sans « suivre les redirections » affiche le 301.', en: 'A browser follows the redirect automatically; a script or tool set to not follow redirects shows the 301.' },
    action: { fr: 'Activer « suivre les redirections » ou appeler directement l\'URL de l\'en-tête Location (en https).', en: 'Enable “follow redirects” or call the Location header URL directly (in https).' },
    customer: { fr: 'Le site a déplacé cette page. Activez le suivi des redirections dans votre outil, ou utilisez l\'adresse indiquée dans l\'en-tête « Location » (https).', en: 'The site moved this page. Enable redirect following in your tool, or use the address from the “Location” header (https).' },
  },
  {
    status: 302, family: '3xx', origin: 'site',
    title: { fr: 'Redirection temporaire', en: 'Found (temporary redirect)' },
    meaning: { fr: 'Le site renvoie vers une autre adresse (Location) pour cette requête seulement : connexion, langue, pays, vérification…', en: 'The site sends you to another address (Location) for this request only: login, language, country, check…' },
    why: { fr: 'La destination dépend de l\'IP de sortie (pays), des cookies et de la session : le client et vous pouvez être redirigés différemment ou pas du tout.', en: 'The destination depends on the exit IP (country), cookies and session: the customer and you may be redirected differently, or not at all.' },
    action: { fr: 'Regarder l\'URL Location : page de login → il faut des cookies/identifiants ; page pays/langue → choisir le bon pays ; page de vérification → changer d\'IP.', en: 'Look at the Location URL: login page → cookies/credentials needed; country/language page → choose the right country; check page → change IP.' },
    customer: { fr: 'Le site vous redirige (connexion, pays ou vérification). Suivez la redirection, conservez vos cookies et vérifiez que le pays choisi correspond au site visé.', en: 'The site is redirecting you (login, country or check). Follow the redirect, keep your cookies and check that the chosen country matches the target site.' },
  },
  {
    status: 303, family: '3xx', origin: 'site',
    title: { fr: 'Voir ailleurs (See Other)', en: 'See Other' },
    meaning: { fr: 'Le site demande de récupérer le résultat à une autre adresse (Location) avec une requête GET. Typique après un POST : connexion, formulaire, paiement, inscription.', en: 'The site asks you to fetch the result at another address (Location) with a GET request. Typical after a POST: login, form, payment, sign-up.' },
    why: { fr: 'Un navigateur enchaîne automatiquement sur le GET. Un script (ou un outil qui rejoue la requête telle quelle) reste bloqué sur le 303 ou renvoie un POST à la mauvaise adresse. L\'IP/le pays peuvent aussi changer l\'adresse de destination (page de vérification, page pays).', en: 'A browser automatically continues with the GET. A script (or a tool that replays the request as is) stays stuck on the 303 or resends a POST to the wrong address. The IP/country can also change the target address (check page, country page).' },
    action: { fr: 'Ce n\'est PAS une erreur du panel. Faire suivre la redirection en GET (et conserver les cookies), ou lire l\'en-tête Location. Comparer avec la même requête depuis la même IP/même pays.', en: 'This is NOT a panel error. Make the client follow the redirect with a GET (and keep cookies), or read the Location header. Compare with the same request from the same IP/country.' },
    customer: { fr: 'Le code 303 vient du site visité, pas de notre service : il signifie « la suite se trouve à une autre adresse ». Dans votre outil, activez le suivi des redirections (en GET, avec conservation des cookies) ou ouvrez l\'adresse de l\'en-tête « Location ». Si le site vous renvoie vers une page de vérification, changez de session/IP ou de pays.', en: 'The 303 comes from the visited site, not from our service: it means “the next step is at another address”. In your tool, enable redirect following (as GET, keeping cookies) or open the “Location” header address. If the site sends you to a check page, change session/IP or country.' },
  },
  {
    status: 304, family: '3xx', origin: 'site',
    title: { fr: 'Non modifié', en: 'Not Modified' },
    meaning: { fr: 'Le contenu n\'a pas changé depuis la dernière fois : le site ne renvoie pas le corps.', en: 'The content has not changed since last time: the site does not send the body.' },
    why: { fr: 'Le client envoie un en-tête de cache (If-None-Match / If-Modified-Since) : normal, pas une erreur.', en: 'The client sends a cache header (If-None-Match / If-Modified-Since): normal, not an error.' },
    action: { fr: 'Retirer ces en-têtes de cache pour recevoir le contenu complet.', en: 'Remove those cache headers to receive the full content.' },
    customer: { fr: 'Ce n\'est pas une erreur : le contenu n\'a pas changé. Retirez les en-têtes de cache (If-None-Match, If-Modified-Since) pour recevoir la page complète.', en: 'This is not an error: the content has not changed. Remove the cache headers (If-None-Match, If-Modified-Since) to get the full page.' },
  },
  {
    status: 307, family: '3xx', origin: 'site',
    title: { fr: 'Redirection temporaire (méthode conservée)', en: 'Temporary Redirect' },
    meaning: { fr: 'Comme 302, mais la méthode (POST, PUT…) et le corps doivent être renvoyés à l\'identique à la nouvelle adresse.', en: 'Like 302, but the method (POST, PUT…) and body must be resent unchanged to the new address.' },
    why: { fr: 'Souvent http → https ou changement de domaine. Les outils simples ne rejouent pas le POST.', en: 'Often http → https or a domain change. Simple tools do not replay the POST.' },
    action: { fr: 'Suivre la redirection en gardant la méthode, ou appeler directement la nouvelle URL.', en: 'Follow the redirect keeping the method, or call the new URL directly.' },
    customer: { fr: 'Le site demande de renvoyer la même requête à une autre adresse (en-tête « Location »). Utilisez directement cette adresse (souvent en https).', en: 'The site asks to resend the same request to another address (“Location” header). Use that address directly (often https).' },
  },
  {
    status: 308, family: '3xx', origin: 'site',
    title: { fr: 'Redirection permanente (méthode conservée)', en: 'Permanent Redirect' },
    meaning: { fr: 'Comme 301 mais la méthode est conservée : la nouvelle adresse est définitive.', en: 'Like 301 but the method is kept: the new address is permanent.' },
    why: { fr: 'Même cause que 301/307 : outil qui ne suit pas les redirections.', en: 'Same cause as 301/307: a tool that does not follow redirects.' },
    action: { fr: 'Mettre à jour l\'URL appelée avec celle de l\'en-tête Location.', en: 'Update the called URL with the Location header one.' },
    customer: { fr: 'L\'adresse a changé définitivement : utilisez celle de l\'en-tête « Location ».', en: 'The address changed permanently: use the one in the “Location” header.' },
  },
  {
    status: 400, family: '4xx', origin: 'site',
    title: { fr: 'Requête invalide', en: 'Bad Request' },
    meaning: { fr: 'Le site n\'a pas compris la requête : syntaxe, en-têtes ou cookies trop gros, corps mal formé.', en: 'The site did not understand the request: syntax, oversized headers or cookies, malformed body.' },
    why: { fr: 'Généralement dû au contenu envoyé par l\'outil du client (en-têtes/cookies/URL), pas au proxy.', en: 'Usually caused by what the customer\'s tool sends (headers/cookies/URL), not by the proxy.' },
    action: { fr: 'Tester la même requête sans proxy ; vérifier l\'URL, l\'encodage, la taille des cookies.', en: 'Test the same request without a proxy; check the URL, encoding, cookie size.' },
    customer: { fr: 'Le site refuse le format de la requête. Vérifiez l\'URL, les en-têtes et les cookies envoyés par votre outil (et testez sans proxy pour comparer).', en: 'The site rejects the request format. Check the URL, headers and cookies sent by your tool (and test without a proxy to compare).' },
  },
  {
    status: 401, family: '4xx', origin: 'site',
    title: { fr: 'Non authentifié (site)', en: 'Unauthorized (site)' },
    meaning: { fr: 'Le SITE de destination demande une connexion (identifiants du site, jeton, clé API). Ce n\'est pas l\'authentification du proxy (celle-ci = 407).', en: 'The destination SITE requires a login (site credentials, token, API key). It is not proxy authentication (that is 407).' },
    why: { fr: 'Le client confond souvent les identifiants du proxy et ceux du site visé.', en: 'Customers often mix up proxy credentials and the target site credentials.' },
    action: { fr: 'Vérifier si le code vient bien du site : l\'en-tête X-UHQ-Error est absent. Les identifiants proxy sont à renseigner dans la config proxy, ceux du site dans la requête.', en: 'Check it comes from the site: the X-UHQ-Error header is absent. Proxy credentials go in the proxy settings, site credentials in the request.' },
    customer: { fr: 'Ce 401 vient du site visité : il demande vos identifiants/jeton à LUI (différents de ceux du proxy). Votre proxy fonctionne.', en: 'This 401 comes from the visited site: it asks for YOUR credentials/token for IT (different from the proxy ones). Your proxy works.' },
  },
  {
    status: 403, family: '4xx', origin: 'site',
    title: { fr: 'Accès interdit', en: 'Forbidden' },
    meaning: { fr: 'Le site (ou son pare-feu/CDN) refuse l\'accès : IP ou pays bloqué, robot détecté, en-têtes suspects. Le moteur renvoie aussi un 403 pour un domaine bloqué ou un VPN refusé (alors X-UHQ-Error est présent).', en: 'The site (or its firewall/CDN) denies access: blocked IP or country, bot detected, suspicious headers. The engine also returns a 403 for a blocked domain or refused VPN (then X-UHQ-Error is present).' },
    why: { fr: 'Dépend de l\'IP de sortie et du comportement : ce qui passe pour vous peut être bloqué pour le client (cadence, en-têtes, empreinte TLS).', en: 'Depends on the exit IP and behaviour: what works for you may be blocked for the customer (rate, headers, TLS fingerprint).' },
    action: { fr: 'Regarder l\'en-tête X-UHQ-Error : présent = voir fiche UHQ_DOMAIN_BLOCKED / UHQ_VPN_BLOCKED ; absent = blocage du site → autre IP/pays, ralentir, vrais en-têtes de navigateur.', en: 'Check the X-UHQ-Error header: present = see UHQ_DOMAIN_BLOCKED / UHQ_VPN_BLOCKED; absent = site block → other IP/country, slow down, real browser headers.' },
    customer: { fr: 'Le site bloque cette requête (IP, pays ou détection de robot). Essayez une nouvelle session/IP ou un autre pays, ralentissez le rythme et utilisez des en-têtes de navigateur réalistes.', en: 'The site blocks this request (IP, country or bot detection). Try a new session/IP or another country, slow down and use realistic browser headers.' },
  },
  {
    status: 404, family: '4xx', origin: 'site',
    title: { fr: 'Introuvable', en: 'Not Found' },
    meaning: { fr: 'La page n\'existe pas à cette adresse (ou le site la masque aux IP/pays non autorisés).', en: 'The page does not exist at this address (or the site hides it from unauthorised IPs/countries).' },
    why: { fr: 'Certains sites répondent 404 plutôt que 403 à une IP qu\'ils refusent ; le contenu peut aussi varier selon le pays.', en: 'Some sites answer 404 instead of 403 to an IP they refuse; content can also vary by country.' },
    action: { fr: 'Vérifier l\'URL exacte ; tester depuis un autre pays.', en: 'Check the exact URL; test from another country.' },
    customer: { fr: 'Le site indique que cette page n\'existe pas (ou n\'est pas disponible depuis cette IP/ce pays). Vérifiez l\'adresse, puis essayez un autre pays.', en: 'The site says this page does not exist (or is not available from this IP/country). Check the address, then try another country.' },
  },
  {
    status: 405, family: '4xx', origin: 'site',
    title: { fr: 'Méthode non autorisée', en: 'Method Not Allowed' },
    meaning: { fr: 'L\'adresse existe mais n\'accepte pas cette méthode (ex. GET au lieu de POST). Souvent la conséquence d\'une redirection 301/302 qui a transformé un POST en GET.', en: 'The address exists but does not accept this method (e.g. GET instead of POST). Often the result of a 301/302 redirect that turned a POST into a GET.' },
    why: { fr: 'L\'outil du client a suivi une redirection en changeant la méthode.', en: 'The customer\'s tool followed a redirect and changed the method.' },
    action: { fr: 'Appeler directement l\'URL finale avec la bonne méthode.', en: 'Call the final URL directly with the right method.' },
    customer: { fr: 'Le site n\'accepte pas cette méthode sur cette adresse (souvent après une redirection). Appelez l\'URL finale avec la bonne méthode (POST/GET).', en: 'The site does not accept this method at this address (often after a redirect). Call the final URL with the right method (POST/GET).' },
  },
  {
    status: 407, family: '4xx', origin: 'panel',
    title: { fr: 'Authentification proxy requise', en: 'Proxy Authentication Required' },
    meaning: { fr: 'Vient du PANEL : identifiants du proxy absents ou refusés, mauvais port, quota, etc. (voir les fiches UHQ_AUTH_FAILED et UHQ_WRONG_PORT).', en: 'Comes from the PANEL: proxy credentials missing or refused, wrong port, quota, etc. (see the UHQ_AUTH_FAILED and UHQ_WRONG_PORT sheets).' },
    why: { fr: 'Le client a mal saisi les identifiants, l\'abonnement est expiré ou le quota est atteint.', en: 'The customer mistyped the credentials, the plan expired or the quota is used up.' },
    action: { fr: 'Onglet « Erreurs du panel » + « Pourquoi ça ne marche pas ? » sur le compte.', en: '“Panel errors” tab + “Why does it not work?” on the account.' },
    customer: { fr: 'Vos identifiants proxy sont refusés. Vérifiez utilisateur, mot de passe, port, abonnement actif et quota.', en: 'Your proxy credentials were refused. Check username, password, port, active plan and quota.' },
  },
  {
    status: 408, family: '4xx', origin: 'site',
    title: { fr: 'Délai de requête dépassé', en: 'Request Timeout' },
    meaning: { fr: 'Le site a attendu trop longtemps la fin de la requête envoyée par le client.', en: 'The site waited too long for the client to finish sending the request.' },
    why: { fr: 'Connexion lente côté client ou proxy de sortie lent.', en: 'Slow client connection or slow exit proxy.' },
    action: { fr: 'Réessayer ; augmenter le délai de l\'outil ; changer de session/IP.', en: 'Retry; raise the tool timeout; change session/IP.' },
    customer: { fr: 'La requête a mis trop de temps à arriver. Réessayez, augmentez le délai d\'attente de votre outil ou changez de session.', en: 'The request took too long to arrive. Retry, raise your tool timeout or change session.' },
  },
  {
    status: 409, family: '4xx', origin: 'site',
    title: { fr: 'Conflit', en: 'Conflict' },
    meaning: { fr: 'La requête entre en conflit avec l\'état du site (ressource déjà existante, doublon, version obsolète).', en: 'The request conflicts with the site state (resource already exists, duplicate, outdated version).' },
    why: { fr: 'Logique propre au site (ex. compte déjà créé).', en: 'Site-specific logic (e.g. account already created).' },
    action: { fr: 'Rien à faire côté panel ; vérifier la logique de l\'outil.', en: 'Nothing to do on the panel side; check the tool logic.' },
    customer: { fr: 'Le site signale un conflit (élément déjà existant ou modifié). Vérifiez votre requête ; le proxy n\'est pas en cause.', en: 'The site reports a conflict (item already existing or modified). Check your request; the proxy is not at fault.' },
  },
  {
    status: 410, family: '4xx', origin: 'site',
    title: { fr: 'Supprimé', en: 'Gone' },
    meaning: { fr: 'La page a été supprimée définitivement.', en: 'The page was permanently removed.' },
    why: { fr: 'Contenu retiré par le site.', en: 'Content removed by the site.' },
    action: { fr: 'Aucune action : l\'adresse n\'existe plus.', en: 'No action: the address no longer exists.' },
    customer: { fr: 'Le site a supprimé cette page définitivement.', en: 'The site permanently removed this page.' },
  },
  {
    status: 418, family: '4xx', origin: 'site',
    title: { fr: 'Je suis une théière (blocage anti-robot)', en: 'I\'m a teapot (anti-bot block)' },
    meaning: { fr: 'Code humoristique parfois utilisé par des sites pour signaler un robot détecté.', en: 'A joke status some sites use to flag a detected bot.' },
    why: { fr: 'Détection de comportement automatisé.', en: 'Automated behaviour detected.' },
    action: { fr: 'Même traitement que 403 : autre IP, ralentir, en-têtes réalistes.', en: 'Same as 403: other IP, slow down, realistic headers.' },
    customer: { fr: 'Le site a détecté un robot et bloque. Ralentissez, changez de session/IP et utilisez des en-têtes de navigateur.', en: 'The site detected a bot and blocks. Slow down, change session/IP and use browser headers.' },
  },
  {
    status: 429, family: '4xx', origin: 'site',
    title: { fr: 'Trop de requêtes', en: 'Too Many Requests' },
    meaning: { fr: 'Trop de requêtes en peu de temps : le site (ou le moteur : limite de connexions simultanées / de tentatives) ralentit le client.', en: 'Too many requests in a short time: the site (or the engine: simultaneous connection / attempt limit) throttles the client.' },
    why: { fr: 'La limite s\'applique par IP : une IP de sortie très utilisée est limitée plus vite.', en: 'The limit applies per IP: a heavily used exit IP is throttled faster.' },
    action: { fr: 'X-UHQ-Error présent = limite de threads du compte (UHQ_THREAD_LIMIT) ; absent = limite du site → ralentir, changer d\'IP.', en: 'X-UHQ-Error present = account thread limit (UHQ_THREAD_LIMIT); absent = site limit → slow down, change IP.' },
    customer: { fr: 'Trop de requêtes en même temps. Réduisez le nombre de connexions simultanées ou espacez les requêtes, puis réessayez.', en: 'Too many requests at once. Reduce simultaneous connections or space out requests, then retry.' },
  },
  {
    status: 451, family: '4xx', origin: 'site',
    title: { fr: 'Indisponible pour raisons légales', en: 'Unavailable For Legal Reasons' },
    meaning: { fr: 'Contenu bloqué dans le pays de l\'IP de sortie (loi, licence).', en: 'Content blocked in the exit IP country (law, licence).' },
    why: { fr: 'Dépend du pays de l\'IP.', en: 'Depends on the IP country.' },
    action: { fr: 'Choisir un pays où le contenu est autorisé.', en: 'Choose a country where the content is allowed.' },
    customer: { fr: 'Ce contenu est bloqué dans le pays de votre IP de sortie. Choisissez un autre pays.', en: 'This content is blocked in your exit IP country. Choose another country.' },
  },
  {
    status: 500, family: '5xx', origin: 'site',
    title: { fr: 'Erreur interne du site', en: 'Internal Server Error' },
    meaning: { fr: 'Le serveur du site visité a rencontré une erreur.', en: 'The visited site\'s server hit an error.' },
    why: { fr: 'Problème côté site (parfois déclenché par une requête inhabituelle).', en: 'Problem on the site side (sometimes triggered by an unusual request).' },
    action: { fr: 'Réessayer plus tard ; tester sans proxy pour confirmer.', en: 'Retry later; test without a proxy to confirm.' },
    customer: { fr: 'Le site visité est en erreur (500). Réessayez plus tard : ce n\'est pas lié au proxy.', en: 'The visited site is failing (500). Retry later: it is not related to the proxy.' },
  },
  {
    status: 502, family: '5xx', origin: 'panel',
    title: { fr: 'Passerelle invalide', en: 'Bad Gateway' },
    meaning: { fr: 'Soit le PANEL (aucun proxy dispo / proxy amont en échec : X-UHQ-Error = UHQ_NO_UPSTREAM ou UHQ_UPSTREAM_FAILED), soit le serveur du site / son CDN.', en: 'Either the PANEL (no proxy available / upstream failed: X-UHQ-Error = UHQ_NO_UPSTREAM or UHQ_UPSTREAM_FAILED), or the site\'s server / CDN.' },
    why: { fr: 'Pool vide ou pays sans proxy, fournisseur amont en panne.', en: 'Empty pool or country without proxies, upstream provider down.' },
    action: { fr: 'Lire X-UHQ-Error puis la fiche correspondante ; Diagnostics pour l\'état du pool.', en: 'Read X-UHQ-Error then the matching sheet; Diagnostics for the pool state.' },
    customer: { fr: 'Le service est momentanément saturé pour cette destination. Réessayez dans quelques instants.', en: 'The service is temporarily saturated for this destination. Retry in a few moments.' },
  },
  {
    status: 503, family: '5xx', origin: 'site',
    title: { fr: 'Service indisponible', en: 'Service Unavailable' },
    meaning: { fr: 'Le site est surchargé, en maintenance, ou vous renvoie une page « vérification de sécurité » (Cloudflare…).', en: 'The site is overloaded, in maintenance, or showing a “security check” page (Cloudflare…).' },
    why: { fr: 'Les protections anti-robot répondent souvent 503 aux IP suspectes.', en: 'Anti-bot protections often answer 503 to suspicious IPs.' },
    action: { fr: 'Réessayer ; changer d\'IP ; si le corps parle de vérification, voir 403.', en: 'Retry; change IP; if the body mentions a check, see 403.' },
    customer: { fr: 'Le site est indisponible ou affiche une vérification de sécurité. Réessayez avec une nouvelle session/IP.', en: 'The site is unavailable or shows a security check. Retry with a new session/IP.' },
  },
  {
    status: 504, family: '5xx', origin: 'panel',
    title: { fr: 'Délai de la passerelle dépassé', en: 'Gateway Timeout' },
    meaning: { fr: 'PANEL (X-UHQ-Error = UHQ_GATEWAY_ERROR : délai ou erreur interne) ou serveur du site trop lent.', en: 'PANEL (X-UHQ-Error = UHQ_GATEWAY_ERROR: timeout or internal error) or a too-slow site server.' },
    why: { fr: 'Proxy de sortie lent ou site lent.', en: 'Slow exit proxy or slow site.' },
    action: { fr: 'Lire X-UHQ-Error ; regarder Diagnostics et les logs.', en: 'Read X-UHQ-Error; check Diagnostics and logs.' },
    customer: { fr: 'Le service a mis trop de temps à répondre. Réessayez dans un instant.', en: 'The service took too long to respond. Retry in a moment.' },
  },
  {
    status: 520, family: '5xx', origin: 'cdn',
    title: { fr: 'Erreur inconnue (Cloudflare)', en: 'Unknown error (Cloudflare)' },
    meaning: { fr: 'Le site est derrière Cloudflare et son serveur a renvoyé une réponse invalide.', en: 'The site is behind Cloudflare and its server returned an invalid response.' },
    why: { fr: 'Problème côté site, parfois déclenché par certaines requêtes.', en: 'Site-side issue, sometimes triggered by certain requests.' },
    action: { fr: 'Réessayer plus tard.', en: 'Retry later.' },
    customer: { fr: 'Le site (protégé par Cloudflare) a répondu de façon invalide. Réessayez plus tard : ce n\'est pas lié au proxy.', en: 'The site (behind Cloudflare) answered invalidly. Retry later: it is not related to the proxy.' },
  },
  {
    status: 522, family: '5xx', origin: 'cdn',
    title: { fr: 'Connexion expirée (Cloudflare)', en: 'Connection timed out (Cloudflare)' },
    meaning: { fr: 'Cloudflare n\'arrive pas à joindre le serveur du site.', en: 'Cloudflare cannot reach the site\'s server.' },
    why: { fr: 'Site hors ligne ou saturé.', en: 'Site offline or overloaded.' },
    action: { fr: 'Rien à faire côté panel.', en: 'Nothing to do on the panel side.' },
    customer: { fr: 'Le site est actuellement injoignable (erreur Cloudflare 522). Réessayez plus tard.', en: 'The site is currently unreachable (Cloudflare 522). Retry later.' },
  },
  {
    status: 524, family: '5xx', origin: 'cdn',
    title: { fr: 'Délai dépassé (Cloudflare)', en: 'A timeout occurred (Cloudflare)' },
    meaning: { fr: 'Le site a mis plus de ~100 s à répondre à Cloudflare.', en: 'The site took over ~100 s to answer Cloudflare.' },
    why: { fr: 'Requête très longue côté site.', en: 'Very long request on the site side.' },
    action: { fr: 'Découper la requête ou réessayer.', en: 'Split the request or retry.' },
    customer: { fr: 'Le site met trop de temps à répondre (Cloudflare 524). Réessayez ou simplifiez la requête.', en: 'The site takes too long to answer (Cloudflare 524). Retry or simplify the request.' },
  },
  {
    status: 525, family: '5xx', origin: 'cdn',
    title: { fr: 'Échec TLS (Cloudflare)', en: 'SSL handshake failed (Cloudflare)' },
    meaning: { fr: 'Cloudflare n\'arrive pas à établir la connexion sécurisée avec le serveur du site.', en: 'Cloudflare cannot establish the secure connection with the site\'s server.' },
    why: { fr: 'Certificat du site invalide ou mal configuré.', en: 'Site certificate invalid or misconfigured.' },
    action: { fr: 'Rien à faire côté panel.', en: 'Nothing to do on the panel side.' },
    customer: { fr: 'Le site a un problème de certificat (Cloudflare 525). Réessayez plus tard.', en: 'The site has a certificate problem (Cloudflare 525). Retry later.' },
  },
  {
    status: 999, family: '4xx', origin: 'site',
    title: { fr: 'Requête refusée (non standard)', en: 'Request denied (non-standard)' },
    meaning: { fr: 'Code non standard utilisé par certains sites (ex. LinkedIn) pour refuser les robots.', en: 'Non-standard code used by some sites (e.g. LinkedIn) to refuse bots.' },
    why: { fr: 'Détection anti-robot.', en: 'Anti-bot detection.' },
    action: { fr: 'Autre IP, ralentir, connexion avec compte si le site l\'exige.', en: 'Other IP, slow down, sign in if the site requires it.' },
    customer: { fr: 'Le site refuse les requêtes automatisées (code 999). Ralentissez et changez de session/IP.', en: 'The site refuses automated requests (code 999). Slow down and change session/IP.' },
  },
];

/** Pourquoi un client voit une erreur que vous ne voyez pas en testant « la même chose ». */
export const WHY_DIFFERENT: { fr: string[]; en: string[] } = {
  fr: [
    'IP / pays de sortie différent : le site répond selon le pays et la réputation de l\'IP (redirection, blocage, contenu).',
    'Session différente : rotation ou session fixe, cookies et jetons propres à chaque IP.',
    'Outil différent : un navigateur suit les redirections, accepte les cookies et envoie des en-têtes réalistes ; un script non.',
    'Cadence différente : un client qui envoie beaucoup de requêtes en parallèle déclenche les limites (429, 403, 503).',
    'Méthode / corps : un POST rejoué après une redirection devient un GET (303) ou est refusé (405).',
    'Cache : en-têtes If-None-Match / If-Modified-Since → 304.',
  ],
  en: [
    'Different exit IP / country: the site answers according to the country and IP reputation (redirect, block, content).',
    'Different session: rotation or sticky session, cookies and tokens specific to each IP.',
    'Different tool: a browser follows redirects, accepts cookies and sends realistic headers; a script does not.',
    'Different rate: a customer sending many parallel requests triggers limits (429, 403, 503).',
    'Method / body: a POST replayed after a redirect becomes a GET (303) or is refused (405).',
    'Cache: If-None-Match / If-Modified-Since headers → 304.',
  ],
};
