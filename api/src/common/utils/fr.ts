const fr = {
  errors: {
    setupDone: "Configuration initiale déjà effectuée",
    registrationDisabled: "Les inscriptions sont désactivées",
    emailTaken: "Email déjà utilisé",
    invalidCredentials: "Identifiants invalides",
    invalidPassword: "Mot de passe incorrect",
    accountDisabled: "Compte désactivé",
    dbAlreadyConfigured: "Base déjà configurée",
    invalidDbUrl: "URL PostgreSQL invalide (format attendu : postgresql://user:pass@host:5432/db)",
    userNotFound: "Utilisateur introuvable",
    cannotDeleteSelf: "Impossible de se supprimer soi-même",
    proxyNotFound: "Compte proxy introuvable",
    proxyNotAssigned: "Ce proxy ne vous est pas assigné",
    portReserved: "Ce port est réservé au port proxy par défaut",
    portTaken: "Ce port est déjà utilisé par une autre pool ou un autre compte proxy",
    portOutOfRange: "Le port doit être compris dans la plage publiée (par défaut 9000-9999)",
    sourceNotFound: "Source introuvable",
    tokenMissing: "Token manquant",
    tokenInvalid: "Token invalide ou expiré",
    accountMissing: "Compte introuvable ou désactivé",
    forbiddenRole: "Accès réservé",
    apiKeyMissing: "Clé API non configurée",
    apiKeyInvalid: "Clé API invalide",
    adminOnly: "Accès réservé aux administrateurs",
    tokenRequired: "Token manquant",
    captchaFailed: "Vérification captcha échouée",
    addonNotFound: "Extension introuvable"
  },
  info: {
    emailRequired: "Adresse e-mail requise.",
    smtpTestSent: "E-mail de test envoyé.",
    smtpTestFailed: "Échec — vérifiez la configuration SMTP.",
    webhookTestSent: "Message de test envoyé.",
    webhookNotConfigured: "Aucune URL de webhook configurée pour ce service.",
    webhookTestFailed: "Échec de l'envoi du webhook"
  }
} as const;

export default fr;
