/**
 * Catalogue des erreurs renvoyées par le moteur proxy aux clients.
 *
 * Règle : le client ne voit JAMAIS l'erreur réelle d'un proxy amont (fournisseur, proxy gratuit, fallback) :
 * le moteur répond toujours avec une des erreurs ci-dessous, en JSON, avec l'en-tête `X-UHQ-Error: <code>`.
 * Ce même catalogue alimente la fiche « Codes d'erreur » du panel (admin/support) : le texte `customer`
 * est ce qu'on peut répondre tel quel à un client, `admin` explique la cause et l'action côté panel.
 *
 * Anti-énumération : `UHQ_AUTH_FAILED` couvre volontairement tous les refus AVANT authentification valide
 * (identifiants absents/inconnus/faux, compte bloqué, expiré, quota, IP non autorisée) — le client ne doit
 * pas pouvoir déduire si un identifiant existe. Le détail exact est dans le journal « Pourquoi ça ne marche pas ? ».
 */
export type ErrorCode =
  | 'UHQ_AUTH_FAILED'
  | 'UHQ_WRONG_PORT'
  | 'UHQ_IP_BANNED'
  | 'UHQ_DOMAIN_BLOCKED'
  | 'UHQ_VPN_BLOCKED'
  | 'UHQ_THREAD_LIMIT'
  | 'UHQ_NO_UPSTREAM'
  | 'UHQ_UPSTREAM_FAILED'
  | 'UHQ_GATEWAY_ERROR';

interface Text {
  fr: string;
  en: string;
}

export interface ErrorInfo {
  code: ErrorCode;
  status: number;
  title: Text;
  /** Message envoyé au client dans le JSON (court, sans détail interne). */
  message: Text;
  /** Ce que ça veut dire côté exploitation : causes possibles. */
  causes: Text;
  /** Quoi faire côté panel / quoi répondre au client. */
  action: Text;
  /** Réponse prête à envoyer au client. */
  customer: Text;
}

export const ERROR_CATALOG: ErrorInfo[] = [
  {
    code: 'UHQ_AUTH_FAILED',
    status: 407,
    title: { fr: 'Authentification refusée', en: 'Authentication refused' },
    message: { fr: 'Authentification proxy refusée.', en: 'Proxy authentication refused.' },
    causes: {
      fr: "Identifiants absents ou faux, compte bloqué, expiré, quota atteint, ou IP du client non autorisée. Tous ces cas renvoient volontairement le même code (le client ne doit pas pouvoir savoir si un identifiant existe).",
      en: 'Missing or wrong credentials, blocked or expired account, quota reached, or client IP not allowed. All these cases deliberately return the same code (the client must not learn whether a username exists).',
    },
    action: {
      fr: "Ouvrez « Pourquoi ça ne marche pas ? » sur le compte (Sous-utilisateurs) : la cause exacte y est indiquée (mot de passe, bloqué, expiré, quota, IP).",
      en: 'Open “Why does it not work?” on the account (Sub-users): the exact cause is listed there (password, blocked, expired, quota, IP).',
    },
    customer: {
      fr: "Vos identifiants sont refusés. Vérifiez l'utilisateur et le mot de passe, puis que votre abonnement est actif et que votre quota n'est pas atteint. Si tout est correct, contactez le support.",
      en: 'Your credentials were refused. Check the username and password, then that your plan is active and your quota is not used up. If all is correct, contact support.',
    },
  },
  {
    code: 'UHQ_WRONG_PORT',
    status: 407,
    title: { fr: 'Mauvais port', en: 'Wrong port' },
    message: { fr: 'Ce compte doit utiliser un autre port.', en: 'This account must use a different port.' },
    causes: {
      fr: "Le compte (ou sa catégorie) a un port dédié et la connexion arrive sur un autre port (ex. le port par défaut 990).",
      en: 'The account (or its category) has a dedicated port and the connection arrived on another port (e.g. the default 990).',
    },
    action: {
      fr: "Donnez au client la bonne ligne avec le bouton « Connexion » du compte (le port y est déjà correct).",
      en: 'Give the customer the right line with the account “Connection” button (the port is already correct there).',
    },
    customer: {
      fr: "Vous utilisez le mauvais port. Reprenez la ligne de connexion exacte depuis votre espace client.",
      en: 'You are using the wrong port. Copy the exact connection line from your customer area.',
    },
  },
  {
    code: 'UHQ_IP_BANNED',
    status: 403,
    title: { fr: 'IP bannie', en: 'IP banned' },
    message: { fr: 'Votre adresse IP est bloquée.', en: 'Your IP address is blocked.' },
    causes: {
      fr: "L'IP du client a été bannie : trop d'échecs d'authentification d'affilée, ou détection VPN sur une catégorie anti-VPN.",
      en: 'The client IP was banned: too many authentication failures in a row, or VPN detection on an anti-VPN category.',
    },
    action: {
      fr: "Panel → Sécurité : retirez l'IP de la liste des bannies si c'est une erreur. Demandez au client de corriger ses identifiants avant de réessayer.",
      en: 'Panel → Security: remove the IP from the banned list if it is a mistake. Ask the customer to fix the credentials before retrying.',
    },
    customer: {
      fr: "Votre IP a été temporairement bloquée après plusieurs tentatives refusées. Vérifiez vos identifiants puis contactez le support pour la débloquer.",
      en: 'Your IP was temporarily blocked after several refused attempts. Check your credentials then contact support to unblock it.',
    },
  },
  {
    code: 'UHQ_DOMAIN_BLOCKED',
    status: 403,
    title: { fr: 'Domaine bloqué', en: 'Domain blocked' },
    message: { fr: "Ce site n'est pas autorisé pour ce compte.", en: 'This site is not allowed for this account.' },
    causes: {
      fr: "Le site visé figure dans les domaines bloqués du compte.",
      en: "The target site is in the account's blocked domains.",
    },
    action: {
      fr: "Modifiez les domaines bloqués du compte si besoin.",
      en: "Edit the account's blocked domains if needed.",
    },
    customer: {
      fr: "Ce site n'est pas accessible avec votre offre.",
      en: 'This site is not accessible with your plan.',
    },
  },
  {
    code: 'UHQ_VPN_BLOCKED',
    status: 403,
    title: { fr: 'VPN / hébergeur détecté', en: 'VPN / hosting detected' },
    message: { fr: 'Les connexions depuis un VPN ou un hébergeur ne sont pas acceptées.', en: 'Connections from a VPN or hosting provider are not accepted.' },
    causes: {
      fr: "La catégorie a l'option Anti-VPN et l'IP du client appartient à un VPN ou un hébergeur. L'IP est aussi bannie.",
      en: 'The category has the Anti-VPN option and the client IP belongs to a VPN or hosting provider. The IP is also banned.',
    },
    action: {
      fr: "Demandez au client de se connecter sans VPN, ou désactivez l'Anti-VPN sur la catégorie. Pensez à débannir l'IP.",
      en: 'Ask the customer to connect without a VPN, or disable Anti-VPN on the category. Remember to unban the IP.',
    },
    customer: {
      fr: "Désactivez votre VPN ou connectez-vous depuis une connexion classique, puis réessayez.",
      en: 'Turn off your VPN or connect from a regular connection, then retry.',
    },
  },
  {
    code: 'UHQ_THREAD_LIMIT',
    status: 429,
    title: { fr: 'Limite de connexions atteinte', en: 'Connection limit reached' },
    message: { fr: 'Trop de connexions simultanées pour ce compte.', en: 'Too many simultaneous connections for this account.' },
    causes: {
      fr: "Le compte a atteint sa limite de threads (connexions simultanées).",
      en: 'The account reached its thread (simultaneous connection) limit.',
    },
    action: {
      fr: "Augmentez la limite de threads du compte ou demandez au client de réduire sa concurrence.",
      en: 'Raise the account thread limit or ask the customer to reduce concurrency.',
    },
    customer: {
      fr: "Vous utilisez trop de connexions en même temps. Réduisez le nombre de threads ou contactez-nous pour une limite plus haute.",
      en: 'You are using too many simultaneous connections. Reduce your thread count or contact us for a higher limit.',
    },
  },
  {
    code: 'UHQ_NO_UPSTREAM',
    status: 502,
    title: { fr: 'Aucun proxy disponible', en: 'No proxy available' },
    message: { fr: "Aucun proxy disponible pour traiter la requête. Réessayez dans un instant.", en: 'No proxy available to handle the request. Please retry shortly.' },
    causes: {
      fr: "Tous les essais ont échoué : pool vide ou en panne, pays demandé sans proxy, fallback absent, désactivé ou en échec.",
      en: 'All attempts failed: empty or failing pool, requested country with no proxy, fallback missing, disabled or failing.',
    },
    action: {
      fr: "Vérifiez la catégorie (Pool, Scraper), le pays demandé, et son fallback (Catégories → fallback). Panel → Diagnostics donne l'état du pool.",
      en: 'Check the category (Pool, Scraper), the requested country and its fallback (Categories → fallback). Panel → Diagnostics shows the pool state.',
    },
    customer: {
      fr: "Le service est momentanément saturé pour cette destination. Réessayez dans quelques instants ; si cela persiste, contactez le support.",
      en: 'The service is temporarily saturated for this destination. Retry in a few moments; if it persists, contact support.',
    },
  },
  {
    code: 'UHQ_UPSTREAM_FAILED',
    status: 502,
    title: { fr: 'Le proxy amont a échoué', en: 'Upstream proxy failed' },
    message: { fr: "Le proxy de sortie n'a pas pu traiter la requête. Réessayez.", en: 'The exit proxy could not handle the request. Please retry.' },
    causes: {
      fr: "Le proxy amont (fournisseur, liste privée, fallback) a répondu par une erreur (ex. authentification refusée chez le fournisseur, solde épuisé). Son message réel n'est JAMAIS montré au client, mais est écrit dans les logs du panel.",
      en: "The upstream proxy (provider, private list, fallback) answered with an error (e.g. provider auth refused, balance exhausted). Its real message is NEVER shown to the customer but is written to the panel logs.",
    },
    action: {
      fr: "Consultez les logs du panel : cherchez « Erreur amont ». Vérifiez les identifiants et le solde chez le fournisseur.",
      en: 'Check the panel logs: search for “Upstream error”. Verify credentials and balance with the provider.',
    },
    customer: {
      fr: "Une erreur temporaire est survenue côté serveur. Réessayez ; si cela persiste, contactez le support.",
      en: 'A temporary server-side error occurred. Retry; if it persists, contact support.',
    },
  },
  {
    code: 'UHQ_GATEWAY_ERROR',
    status: 504,
    title: { fr: 'Erreur passerelle / délai dépassé', en: 'Gateway error / timeout' },
    message: { fr: 'Erreur de passerelle ou délai dépassé. Réessayez.', en: 'Gateway error or timeout. Please retry.' },
    causes: {
      fr: "Erreur interne inattendue ou délai dépassé pendant le traitement de la connexion.",
      en: 'Unexpected internal error or timeout while handling the connection.',
    },
    action: {
      fr: "Si cela se répète, regardez les logs du panel et Diagnostics (moteur, base, charge).",
      en: 'If it repeats, check the panel logs and Diagnostics (engine, database, load).',
    },
    customer: {
      fr: "Le service a mis trop de temps à répondre. Réessayez dans un instant.",
      en: 'The service took too long to respond. Retry in a moment.',
    },
  },
];

const BY_CODE = new Map(ERROR_CATALOG.map((e) => [e.code, e]));

const STATUS_TEXT: Record<number, string> = {
  403: 'Forbidden',
  407: 'Proxy Authentication Required',
  429: 'Too Many Requests',
  502: 'Bad Gateway',
  504: 'Gateway Timeout',
};

/**
 * Réponse HTTP complète (ligne de statut + en-têtes + corps JSON) à écrire sur la socket du client.
 * `detail` (ex. « port attendu ») est ajouté seulement quand il est sûr à montrer au client.
 */
export function errorResponse(code: ErrorCode, detail?: Record<string, string | number>): string {
  const info = BY_CODE.get(code)!;
  const body = JSON.stringify({
    error: { code: info.code, status: info.status, message: info.message.en, ...(detail ? { detail } : {}) },
  });
  const lines = [
    `HTTP/1.1 ${info.status} ${STATUS_TEXT[info.status] ?? 'Error'}`,
    ...(info.status === 407 ? ['Proxy-Authenticate: Basic realm="Proxy"'] : []),
    'Content-Type: application/json; charset=utf-8',
    `Content-Length: ${Buffer.byteLength(body)}`,
    `X-UHQ-Error: ${info.code}`,
    'Cache-Control: no-store',
    'Connection: close',
  ];
  return `${lines.join('\r\n')}\r\n\r\n${body}`;
}
