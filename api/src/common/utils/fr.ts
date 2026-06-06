const fr = {
  errors: {
    setupDone: "Configuration initiale déjà effectuée",
    registrationDisabled: "Les inscriptions sont désactivées",
    emailTaken: "Email déjà utilisé",
    invalidCredentials: "Identifiants invalides",
    accountDisabled: "Compte désactivé",
    dbAlreadyConfigured: "Base déjà configurée",
    invalidDbUrl: "URL PostgreSQL invalide (format attendu : postgresql://user:pass@host:5432/db)",
    userNotFound: "Utilisateur introuvable",
    cannotDeleteSelf: "Impossible de se supprimer soi-même",
    proxyNotFound: "Compte proxy introuvable",
    proxyNotAssigned: "Ce proxy ne vous est pas assigné",
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
  }
} as const;

export default fr;
