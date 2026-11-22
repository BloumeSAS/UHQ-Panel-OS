/**
 * Catalogue des e-mails du panel et des addons.
 *
 * Chaque modèle a un identifiant stable, un groupe d'affichage, la liste de ses variables (`{nom}` dans le texte), un
 * texte par défaut FR/EN et des valeurs d'exemple pour l'aperçu. L'admin peut, depuis Paramètres → SMTP & e-mails,
 * activer/désactiver chaque envoi et modifier sujet et texte (par langue) ; sans modification, le texte par défaut s'applique.
 *
 * Syntaxe du texte (tout est échappé, jamais de HTML libre) :
 *  - une ligne vide sépare deux paragraphes ;
 *  - `**gras**` ;
 *  - `[[Libellé|{url}]]` = bouton (URL http/https uniquement) ;
 *  - `{variable}` = valeur injectée (échappée).
 */
export type MailGroup = 'account' | 'security' | 'admin' | 'customers' | 'orders' | 'wallet' | 'promo' | 'tickets' | 'referral' | 'status';

export interface MailTemplateDef {
  id: string;
  group: MailGroup;
  /** Destinataire habituel (affichage). */
  audience: 'user' | 'admin' | 'customer';
  /** Activé par défaut ? (peut dépendre d'un ancien réglage : voir `legacyFlag`). */
  defaultEnabled: boolean;
  /** Ancien réglage booléen qui pilote cet envoi (emailOnRegister, emailOnLogin…) : valeur par défaut seulement. */
  legacyFlag?: string;
  /** Texte non modifiable (contenu dynamique : rapports, alertes clients) — seul l'interrupteur et l'habillage s'appliquent. */
  fixedBody?: boolean;
  /** Réglage booléen qui pilote l'envoi à la place de l'interrupteur du modèle (rapports, alertes clients). */
  controlledBy?: string;
  /** Appelable par un addon via POST /api/v1/mail/send. */
  addon?: boolean;
  vars: string[];
  subject: { fr: string; en: string };
  body: { fr: string; en: string };
  sample: Record<string, string>;
}

const common = ['siteName'];

export const MAIL_TEMPLATES: MailTemplateDef[] = [
  // ───── Compte ─────
  {
    id: 'auth.welcome', group: 'account', audience: 'user', defaultEnabled: false, legacyFlag: 'emailOnRegister',
    vars: [...common, 'email', 'loginUrl'],
    subject: { fr: 'Bienvenue sur {siteName} !', en: 'Welcome to {siteName}!' },
    body: {
      fr: 'Bienvenue sur **{siteName}** !\n\nVotre compte ({email}) a été créé avec succès. Connectez-vous pour accéder à votre espace.\n\n[[Se connecter|{loginUrl}]]',
      en: 'Welcome to **{siteName}**!\n\nYour account ({email}) has been created. Sign in to access your space.\n\n[[Sign in|{loginUrl}]]',
    },
    sample: { siteName: 'UHQ Panel OS', email: 'client@exemple.fr', loginUrl: 'https://panel.exemple.fr/login' },
  },
  {
    id: 'auth.password-reset', group: 'account', audience: 'user', defaultEnabled: true,
    vars: [...common, 'resetUrl'],
    subject: { fr: 'Réinitialisation de votre mot de passe', en: 'Reset your password' },
    body: {
      fr: 'Une demande de réinitialisation de mot de passe a été reçue pour votre compte.\n\n[[Réinitialiser mon mot de passe|{resetUrl}]]\n\nCe lien expire dans 1 heure. Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail.',
      en: 'A password reset was requested for your account.\n\n[[Reset my password|{resetUrl}]]\n\nThis link expires in 1 hour. If you did not request this, ignore this email.',
    },
    sample: { siteName: 'UHQ Panel OS', resetUrl: 'https://panel.exemple.fr/reset-password?token=…' },
  },
  {
    id: 'auth.password-changed', group: 'security', audience: 'user', defaultEnabled: true,
    vars: [...common, 'ip', 'date'],
    subject: { fr: 'Votre mot de passe a été modifié', en: 'Your password was changed' },
    body: {
      fr: 'Le mot de passe de votre compte vient d’être modifié.\n\nAdresse IP : **{ip}**\nDate : {date}\n\nSi ce n’est pas vous, réinitialisez immédiatement votre mot de passe et activez la double authentification.',
      en: 'Your account password was just changed.\n\nIP address: **{ip}**\nDate: {date}\n\nIf this was not you, reset your password immediately and enable two-factor authentication.',
    },
    sample: { siteName: 'UHQ Panel OS', ip: '203.0.113.7', date: '17/10/2026 14:32' },
  },
  {
    id: 'invitation', group: 'account', audience: 'user', defaultEnabled: true,
    vars: [...common, 'inviteUrl'],
    subject: { fr: 'Vous avez été invité sur {siteName}', en: 'You have been invited to {siteName}' },
    body: {
      fr: 'Vous avez été invité à rejoindre **{siteName}**.\n\n[[Accepter l’invitation|{inviteUrl}]]\n\nCe lien expire dans 7 jours.',
      en: 'You have been invited to join **{siteName}**.\n\n[[Accept the invitation|{inviteUrl}]]\n\nThis link expires in 7 days.',
    },
    sample: { siteName: 'UHQ Panel OS', inviteUrl: 'https://panel.exemple.fr/invite?token=…' },
  },
  // ───── Sécurité ─────
  {
    id: 'auth.login', group: 'security', audience: 'user', defaultEnabled: false, legacyFlag: 'emailOnLogin',
    vars: [...common, 'ip'],
    subject: { fr: 'Nouvelle connexion à votre compte', en: 'New sign-in to your account' },
    body: {
      fr: 'Une connexion a été effectuée sur votre compte.\n\nAdresse IP : **{ip}**\n\nSi ce n’est pas vous, changez immédiatement votre mot de passe.',
      en: 'A sign-in was made on your account.\n\nIP address: **{ip}**\n\nIf this was not you, change your password immediately.',
    },
    sample: { siteName: 'UHQ Panel OS', ip: '203.0.113.7' },
  },
  {
    id: 'auth.new-location', group: 'security', audience: 'user', defaultEnabled: true,
    vars: [...common, 'ip', 'userAgent'],
    subject: { fr: 'Connexion depuis une IP inconnue', en: 'Sign-in from an unknown IP' },
    body: {
      fr: 'Une connexion vient d’avoir lieu depuis une adresse IP que nous n’avions encore jamais vue pour votre compte.\n\nAdresse IP : **{ip}**\nAppareil : {userAgent}\n\nSi c’est bien vous, aucune action n’est requise. Sinon, changez immédiatement votre mot de passe et activez la double authentification.',
      en: 'A sign-in just happened from an IP address we had never seen for your account.\n\nIP address: **{ip}**\nDevice: {userAgent}\n\nIf this was you, no action is needed. Otherwise change your password right away and enable two-factor authentication.',
    },
    sample: { siteName: 'UHQ Panel OS', ip: '203.0.113.7', userAgent: 'Firefox 130 · Windows' },
  },
  {
    id: 'auth.recovery-used', group: 'security', audience: 'user', defaultEnabled: true,
    vars: [...common, 'ip'],
    subject: { fr: 'Code de récupération 2FA utilisé', en: '2FA recovery code used' },
    body: {
      fr: 'Un code de récupération à usage unique vient d’être utilisé pour vous connecter, à la place de votre application d’authentification.\n\nAdresse IP : **{ip}**\n\nCe code ne fonctionnera plus. Si ce n’est pas vous, changez immédiatement votre mot de passe.',
      en: 'A one-time recovery code was just used to sign in instead of your authenticator app.\n\nIP address: **{ip}**\n\nThis code no longer works. If this was not you, change your password immediately.',
    },
    sample: { siteName: 'UHQ Panel OS', ip: '203.0.113.7' },
  },
  {
    id: 'auth.2fa-changed', group: 'security', audience: 'user', defaultEnabled: true,
    vars: [...common, 'state', 'ip'],
    subject: { fr: 'Double authentification : {state}', en: 'Two-factor authentication: {state}' },
    body: {
      fr: 'La double authentification (2FA) de votre compte est désormais **{state}**.\n\nAdresse IP : {ip}\n\nSi ce n’est pas vous, sécurisez immédiatement votre compte.',
      en: 'Two-factor authentication (2FA) on your account is now **{state}**.\n\nIP address: {ip}\n\nIf this was not you, secure your account immediately.',
    },
    sample: { siteName: 'UHQ Panel OS', state: 'activée', ip: '203.0.113.7' },
  },
  // ───── Administration ─────
  {
    id: 'admin.alert', group: 'admin', audience: 'admin', defaultEnabled: true,
    vars: [...common, 'title', 'message'],
    subject: { fr: '{title}', en: '{title}' },
    body: { fr: '**{title}**\n\n{message}', en: '**{title}**\n\n{message}' },
    sample: { siteName: 'UHQ Panel OS', title: 'Moteur proxy injoignable', message: 'Le moteur ne répond plus depuis 2 vérifications consécutives.' },
  },
  {
    id: 'admin.report', group: 'admin', audience: 'admin', defaultEnabled: false, fixedBody: true, controlledBy: 'smtpReportsEnabled',
    vars: [...common],
    subject: { fr: 'Rapport {period}', en: '{period} report' },
    body: { fr: 'Rapport automatique (trafic, pool, utilisateurs actifs, top domaines).', en: 'Automatic report (traffic, pool, active users, top domains).' },
    sample: { siteName: 'UHQ Panel OS' },
  },
  {
    id: 'smtp.test', group: 'admin', audience: 'admin', defaultEnabled: true,
    vars: [...common],
    subject: { fr: 'Test SMTP', en: 'SMTP test' },
    body: { fr: 'La configuration SMTP de **{siteName}** fonctionne.', en: 'The SMTP configuration of **{siteName}** works.' },
    sample: { siteName: 'UHQ Panel OS' },
  },
  // ───── Clients ─────
  {
    id: 'customer.alert', group: 'customers', audience: 'customer', defaultEnabled: true, fixedBody: true, controlledBy: 'customerAlertsEnabled',
    vars: [...common],
    subject: { fr: 'Alerte sur votre compte proxy', en: 'Alert on your proxy account' },
    body: { fr: 'Alertes automatiques à vos clients : quota bientôt atteint, expiration proche, compte bloqué.', en: 'Automatic alerts to your customers: quota almost reached, upcoming expiry, blocked account.' },
    sample: { siteName: 'UHQ Panel OS' },
  },
  // ───── Addon Orders ─────
  {
    id: 'orders.order-paid', group: 'orders', audience: 'customer', defaultEnabled: true, addon: true,
    vars: [...common, 'orderId', 'items', 'total', 'ordersUrl'],
    subject: { fr: 'Commande {orderId} confirmée', en: 'Order {orderId} confirmed' },
    body: {
      fr: 'Merci ! Votre paiement de **{total}** a bien été reçu.\n\nCommande {orderId} : {items}\n\nVos accès sont disponibles dans votre espace.\n\n[[Voir ma commande|{ordersUrl}]]',
      en: 'Thank you! Your payment of **{total}** was received.\n\nOrder {orderId}: {items}\n\nYour access is available in your space.\n\n[[View my order|{ordersUrl}]]',
    },
    sample: { siteName: 'UHQ Panel OS', orderId: '#C1A6CFCF', items: '2 × Datacenter 5 Go', total: '10,00 €', ordersUrl: 'https://panel.exemple.fr/' },
  },
  {
    id: 'orders.order-review', group: 'orders', audience: 'customer', defaultEnabled: true, addon: true,
    vars: [...common, 'orderId', 'items', 'total'],
    subject: { fr: 'Commande {orderId} reçue — en cours de validation', en: 'Order {orderId} received — awaiting approval' },
    body: {
      fr: 'Votre paiement de **{total}** est bien reçu.\n\nCommande {orderId} : {items}\n\nUn administrateur doit valider votre commande avant la création de vos accès. Vous serez prévenu dès qu’elle sera validée.',
      en: 'Your payment of **{total}** was received.\n\nOrder {orderId}: {items}\n\nAn administrator must approve your order before your access is created. You will be notified as soon as it is approved.',
    },
    sample: { siteName: 'UHQ Panel OS', orderId: '#C1A6CFCF', items: '2 × Résidentiel 10 Go', total: '24,00 €' },
  },
  {
    id: 'orders.order-approved', group: 'orders', audience: 'customer', defaultEnabled: true, addon: true,
    vars: [...common, 'orderId', 'items', 'ordersUrl'],
    subject: { fr: 'Commande {orderId} validée — vos accès sont prêts', en: 'Order {orderId} approved — your access is ready' },
    body: {
      fr: 'Bonne nouvelle : votre commande {orderId} a été validée.\n\n{items}\n\nVos accès sont disponibles dans votre espace.\n\n[[Voir mes proxies|{ordersUrl}]]',
      en: 'Good news: your order {orderId} was approved.\n\n{items}\n\nYour access is available in your space.\n\n[[View my proxies|{ordersUrl}]]',
    },
    sample: { siteName: 'UHQ Panel OS', orderId: '#C1A6CFCF', items: '2 × Résidentiel 10 Go', ordersUrl: 'https://panel.exemple.fr/' },
  },
  {
    id: 'orders.order-cancelled', group: 'orders', audience: 'customer', defaultEnabled: true, addon: true,
    vars: [...common, 'orderId', 'refund'],
    subject: { fr: 'Commande {orderId} annulée', en: 'Order {orderId} cancelled' },
    body: {
      fr: 'Votre commande {orderId} a été annulée.\n\n{refund}',
      en: 'Your order {orderId} was cancelled.\n\n{refund}',
    },
    sample: { siteName: 'UHQ Panel OS', orderId: '#C1A6CFCF', refund: 'Le montant a été recrédité sur votre solde.' },
  },
  {
    id: 'orders.renewal-done', group: 'orders', audience: 'customer', defaultEnabled: true, addon: true,
    vars: [...common, 'product', 'amount', 'expiresAt'],
    subject: { fr: 'Renouvellement effectué — {product}', en: 'Renewal done — {product}' },
    body: {
      fr: 'Votre compte **{product}** a été renouvelé automatiquement ({amount} débités de votre solde).\n\nNouvelle expiration : **{expiresAt}**',
      en: 'Your **{product}** account was renewed automatically ({amount} charged to your balance).\n\nNew expiry: **{expiresAt}**',
    },
    sample: { siteName: 'UHQ Panel OS', product: 'Datacenter 5 Go', amount: '5,00 €', expiresAt: '17/11/2026' },
  },
  {
    id: 'orders.renewal-failed', group: 'orders', audience: 'customer', defaultEnabled: true, addon: true,
    vars: [...common, 'product', 'reason', 'walletUrl'],
    subject: { fr: 'Renouvellement impossible — {product}', en: 'Renewal failed — {product}' },
    body: {
      fr: 'Le renouvellement automatique de **{product}** a échoué : {reason}\n\nNous réessayons automatiquement pendant 72 heures. Rechargez votre solde pour éviter l’interruption du service.\n\n[[Recharger mon solde|{walletUrl}]]',
      en: 'The automatic renewal of **{product}** failed: {reason}\n\nWe retry automatically for 72 hours. Top up your balance to avoid any interruption.\n\n[[Top up my balance|{walletUrl}]]',
    },
    sample: { siteName: 'UHQ Panel OS', product: 'Datacenter 5 Go', reason: 'solde insuffisant', walletUrl: 'https://panel.exemple.fr/' },
  },
  {
    id: 'orders.admin-new', group: 'orders', audience: 'admin', defaultEnabled: true, addon: true,
    vars: [...common, 'orderId', 'customer', 'items', 'total', 'status', 'adminUrl'],
    subject: { fr: 'Nouvelle commande {orderId} ({status})', en: 'New order {orderId} ({status})' },
    body: {
      fr: 'Nouvelle commande de **{customer}** : {items} — **{total}**\n\nStatut : {status}\n\n[[Ouvrir la gestion de la boutique|{adminUrl}]]',
      en: 'New order from **{customer}**: {items} — **{total}**\n\nStatus: {status}\n\n[[Open shop management|{adminUrl}]]',
    },
    sample: { siteName: 'UHQ Panel OS', orderId: '#C1A6CFCF', customer: 'client@exemple.fr', items: '2 × Résidentiel 10 Go', total: '24,00 €', status: 'à valider', adminUrl: 'https://panel.exemple.fr/' },
  },
  // ───── Addon Wallet ─────
  {
    id: 'wallet.topup-done', group: 'wallet', audience: 'customer', defaultEnabled: true, addon: true,
    vars: [...common, 'amount', 'bonus', 'balance'],
    subject: { fr: 'Solde rechargé : +{amount}', en: 'Balance topped up: +{amount}' },
    body: {
      fr: 'Votre solde a été rechargé de **{amount}**{bonus}.\n\nNouveau solde : **{balance}**',
      en: 'Your balance was topped up by **{amount}**{bonus}.\n\nNew balance: **{balance}**',
    },
    sample: { siteName: 'UHQ Panel OS', amount: '50,00 €', bonus: ' (dont 5,00 € de bonus)', balance: '63,40 €' },
  },
  // ───── Addon Promo Codes ─────
  {
    id: 'promo.redeemed', group: 'promo', audience: 'customer', defaultEnabled: true, addon: true,
    vars: [...common, 'code', 'benefit'],
    subject: { fr: 'Code promo {code} appliqué', en: 'Promo code {code} applied' },
    body: {
      fr: 'Votre code **{code}** a bien été appliqué : {benefit}',
      en: 'Your code **{code}** was applied: {benefit}',
    },
    sample: { siteName: 'UHQ Panel OS', code: 'BIENVENUE10', benefit: '+10 % de bonus sur votre recharge' },
  },
  // ───── Addon Tickets ─────
  {
    id: 'tickets.created', group: 'tickets', audience: 'customer', defaultEnabled: true, addon: true,
    vars: [...common, 'ticketId', 'subject', 'excerpt'],
    subject: { fr: 'Ticket {ticketId} reçu : {subject}', en: 'Ticket {ticketId} received: {subject}' },
    body: {
      fr: 'Votre demande a bien été enregistrée sous le numéro **{ticketId}**.\n\n**{subject}**\n\n{excerpt}\n\nNous vous répondrons dès que possible ; la réponse apparaîtra dans l’espace « Support » du panel.',
      en: 'Your request was recorded as **{ticketId}**.\n\n**{subject}**\n\n{excerpt}\n\nWe will answer as soon as possible; the reply will appear in the “Support” area of the panel.',
    },
    sample: { siteName: 'UHQ Panel OS', ticketId: '#12', subject: 'Mon proxy renvoie une erreur 407', excerpt: 'Depuis hier soir, toutes mes requêtes échouent…' },
  },
  {
    id: 'tickets.reply', group: 'tickets', audience: 'customer', defaultEnabled: true, addon: true,
    vars: [...common, 'ticketId', 'subject', 'excerpt'],
    subject: { fr: 'Réponse à votre ticket {ticketId}', en: 'Reply to your ticket {ticketId}' },
    body: {
      fr: 'Le support a répondu à votre ticket **{ticketId}** — {subject} :\n\n{excerpt}\n\nConnectez-vous au panel (espace « Support ») pour lire la réponse complète et répondre.',
      en: 'Support replied to your ticket **{ticketId}** — {subject}:\n\n{excerpt}\n\nSign in to the panel (“Support” area) to read the full reply and answer.',
    },
    sample: { siteName: 'UHQ Panel OS', ticketId: '#12', subject: 'Mon proxy renvoie une erreur 407', excerpt: 'Votre mot de passe a expiré, pouvez-vous le régénérer ?' },
  },
  {
    id: 'tickets.resolved', group: 'tickets', audience: 'customer', defaultEnabled: true, addon: true,
    vars: [...common, 'ticketId', 'subject', 'excerpt'],
    subject: { fr: 'Ticket {ticketId} résolu', en: 'Ticket {ticketId} resolved' },
    body: {
      fr: 'Votre ticket **{ticketId}** — {subject} a été marqué comme résolu :\n\n{excerpt}\n\nVous pouvez noter l’aide reçue depuis l’espace « Support », ou répondre pour rouvrir le ticket.',
      en: 'Your ticket **{ticketId}** — {subject} was marked as resolved:\n\n{excerpt}\n\nYou can rate the help you received in the “Support” area, or reply to reopen the ticket.',
    },
    sample: { siteName: 'UHQ Panel OS', ticketId: '#12', subject: 'Mon proxy renvoie une erreur 407', excerpt: 'Parfait, bonne journée !' },
  },
  {
    id: 'tickets.admin-new', group: 'tickets', audience: 'admin', defaultEnabled: true, addon: true,
    vars: [...common, 'ticketId', 'subject', 'from', 'excerpt'],
    subject: { fr: 'Nouveau ticket {ticketId} : {subject}', en: 'New ticket {ticketId}: {subject}' },
    body: {
      fr: 'Nouveau ticket **{ticketId}** de {from} :\n\n**{subject}**\n\n{excerpt}\n\nOuvrez la console « Support » du panel pour répondre.',
      en: 'New ticket **{ticketId}** from {from}:\n\n**{subject}**\n\n{excerpt}\n\nOpen the “Support” console in the panel to reply.',
    },
    sample: { siteName: 'UHQ Panel OS', ticketId: '#12', subject: 'Mon proxy renvoie une erreur 407', from: 'client@exemple.fr', excerpt: 'Depuis hier soir, toutes mes requêtes échouent…' },
  },
  {
    id: 'tickets.admin-reply', group: 'tickets', audience: 'admin', defaultEnabled: true, addon: true,
    vars: [...common, 'ticketId', 'subject', 'from', 'excerpt'],
    subject: { fr: 'Réponse du client sur {ticketId}', en: 'Customer reply on {ticketId}' },
    body: {
      fr: '{from} a répondu au ticket **{ticketId}** — {subject} :\n\n{excerpt}',
      en: '{from} replied to ticket **{ticketId}** — {subject}:\n\n{excerpt}',
    },
    sample: { siteName: 'UHQ Panel OS', ticketId: '#12', subject: 'Mon proxy renvoie une erreur 407', from: 'client@exemple.fr', excerpt: 'Ça fonctionne, merci beaucoup !' },
  },
  // ───── Addon Referral ─────
  {
    id: 'referral.joined', group: 'referral', audience: 'customer', defaultEnabled: true, addon: true,
    vars: [...common, 'referee'],
    subject: { fr: 'Un nouveau filleul grâce à vous !', en: 'You have a new referral!' },
    body: {
      fr: '**{referee}** vient d’utiliser votre code de parrainage.\n\nVous serez récompensé(e) à chacune de ses commandes : suivez vos gains dans l’espace « Parrainage ».',
      en: '**{referee}** just used your referral code.\n\nYou will be rewarded on each of their orders: follow your earnings in the “Referral” area.',
    },
    sample: { siteName: 'UHQ Panel OS', referee: 'ma***@exemple.fr' },
  },
  {
    id: 'referral.commission', group: 'referral', audience: 'customer', defaultEnabled: true, addon: true,
    vars: [...common, 'amount', 'referee'],
    subject: { fr: 'Commission de parrainage : +{amount}', en: 'Referral commission: +{amount}' },
    body: {
      fr: 'Une commission de **{amount}** vient d’être ajoutée à votre solde, suite à une commande de {referee}.\n\nMerci d’avoir partagé votre lien !',
      en: 'A commission of **{amount}** was added to your balance following an order by {referee}.\n\nThank you for sharing your link!',
    },
    sample: { siteName: 'UHQ Panel OS', amount: '2,00 €', referee: 'ma***@exemple.fr' },
  },
  {
    id: 'referral.welcome-bonus', group: 'referral', audience: 'customer', defaultEnabled: true, addon: true,
    vars: [...common, 'amount'],
    subject: { fr: 'Bonus de bienvenue : +{amount}', en: 'Welcome bonus: +{amount}' },
    body: {
      fr: 'Merci pour votre première commande ! Un bonus de bienvenue de **{amount}** a été ajouté à votre solde grâce au parrainage.',
      en: 'Thanks for your first order! A welcome bonus of **{amount}** was added to your balance thanks to the referral.',
    },
    sample: { siteName: 'UHQ Panel OS', amount: '1,00 €' },
  },
  // ───── Addon Status ─────
  {
    id: 'status.incident', group: 'status', audience: 'customer', defaultEnabled: true, addon: true,
    vars: [...common, 'title', 'state', 'body'],
    subject: { fr: '{state} : {title}', en: '{state}: {title}' },
    body: {
      fr: '**{title}**\n\n{body}\n\nLe détail et l’historique sont sur la page « État des services » du panel. Vous recevez cet e-mail car vous êtes abonné(e) aux alertes.',
      en: '**{title}**\n\n{body}\n\nDetails and history are on the panel’s “Service status” page. You receive this e-mail because you subscribed to alerts.',
    },
    sample: { siteName: 'UHQ Panel OS', title: 'Service proxy indisponible', state: 'Nouvel incident', body: 'Nous enquêtons.' },
  },
  {
    id: 'status.admin-alert', group: 'status', audience: 'admin', defaultEnabled: true, addon: true,
    vars: [...common, 'title', 'state', 'body'],
    subject: { fr: '[Statut] {state} : {title}', en: '[Status] {state}: {title}' },
    body: {
      fr: 'Détection automatique — **{title}** ({state}).\n\n{body}',
      en: 'Automatic detection — **{title}** ({state}).\n\n{body}',
    },
    sample: { siteName: 'UHQ Panel OS', title: 'Redémarrage du service', state: 'Nouvel incident', body: 'Le service a redémarré. Interruption : 2 min.' },
  },
];

export const MAIL_TEMPLATE_BY_ID = new Map(MAIL_TEMPLATES.map((t) => [t.id, t]));
