const en = {
  errors: {
    setupDone: "Initial setup already completed",
    registrationDisabled: "Registrations are disabled",
    emailTaken: "Email already in use",
    invalidCredentials: "Invalid credentials",
    accountDisabled: "Account disabled",
    dbAlreadyConfigured: "Database already configured",
    invalidDbUrl: "Invalid PostgreSQL URL (expected: postgresql://user:pass@host:5432/db)",
    userNotFound: "User not found",
    cannotDeleteSelf: "You cannot delete yourself",
    proxyNotFound: "Proxy account not found",
    proxyNotAssigned: "This proxy is not assigned to you",
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
  }
} as const;

export default en;
