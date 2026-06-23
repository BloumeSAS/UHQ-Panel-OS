const en = {
  errors: {
    setupDone: "Initial setup already completed",
    registrationDisabled: "Registrations are disabled",
    emailTaken: "Email already in use",
    invalidCredentials: "Invalid credentials",
    invalidPassword: "Incorrect password",
    accountDisabled: "Account disabled",
    dbAlreadyConfigured: "Database already configured",
    invalidDbUrl: "Invalid PostgreSQL URL (expected: postgresql://user:pass@host:5432/db)",
    userNotFound: "User not found",
    cannotDeleteSelf: "You cannot delete yourself",
    proxyNotFound: "Proxy account not found",
    proxyNotAssigned: "This proxy is not assigned to you",
    portReserved: "This port is reserved for the default proxy port",
    portTaken: "This port is already used by another pool or proxy account",
    portOutOfRange: "The port must be within the published range (default 9000-9100)",
    sourceNotFound: "Source not found",
    tokenMissing: "Missing token",
    tokenInvalid: "Invalid or expired token",
    accountMissing: "Account missing or disabled",
    forbiddenRole: "Access restricted",
    apiKeyMissing: "API key not configured",
    apiKeyInvalid: "Invalid API key",
    adminOnly: "Administrators only",
    tokenRequired: "Missing token",
    captchaFailed: "Captcha verification failed",
    addonNotFound: "Addon not found"
  },
  info: {
    emailRequired: "Email address required.",
    smtpTestSent: "Test email sent.",
    smtpTestFailed: "Failed — check your SMTP settings.",
    webhookTestSent: "Test message sent.",
    webhookNotConfigured: "No webhook URL configured for this service.",
    webhookTestFailed: "Failed to send webhook"
  }
} as const;

export default en;
