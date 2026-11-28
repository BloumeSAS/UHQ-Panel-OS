# Security Policy

## Supported versions

Only the latest minor release line receives security fixes. Always run the most recent version (the panel shows it in its footer and offers one-click updates).

| Version | Supported |
|---|---|
| 2.15.x (latest) | ✅ |
| < 2.15 | ❌ — please update |

Official add-ons follow the same rule: only their latest release is supported.

## Reporting a vulnerability

**Please do not open a public issue, discussion or pull request for a security problem.**

Report it privately, by either:

1. **GitHub private vulnerability reporting** — *Security* tab → *Report a vulnerability* on this repository (preferred), or
2. e-mail to **contact@bloume.fr** with the subject `[SECURITY] UHQ Panel OS`.

Please include:

- the affected version (footer of the panel) and add-on versions if relevant,
- a description of the issue and its impact,
- steps to reproduce or a proof of concept,
- any suggested fix.

## What to expect

| Step | Target delay |
|---|---|
| Acknowledgement | 72 hours |
| First assessment | 7 days |
| Fix released for critical / high issues | as fast as possible, usually under 14 days |

We will keep you informed, credit you in the release notes if you wish, and publish a GitHub Security Advisory once a fix is available.

## Scope

In scope: this repository (API, panel, proxy engine, Docker image) and the official add-ons (`BloumeSAS/UHQ-Addon-*`).

Out of scope: vulnerabilities in third-party services, issues requiring a compromised administrator account or server, missing hardening on a self-hosted instance that the documentation asks you to configure (HTTPS, firewall, backups), and denial of service by volume.

## Hardening tips for operators

- Keep the panel up to date and enable automatic backups.
- Enable 2FA for every administrator.
- Put the panel behind HTTPS (Coolify / Traefik) and keep the database private.
- Use the IP ban list, automatic bans and the IP allow-list (Security → IP bans).

---

🇫🇷 **Signaler une faille** : n'ouvrez pas d'issue publique ; utilisez l'onglet *Security → Report a vulnerability* de ce dépôt ou écrivez à **contact@bloume.fr** (objet `[SECURITY] UHQ Panel OS`). Réponse sous 72 h.
