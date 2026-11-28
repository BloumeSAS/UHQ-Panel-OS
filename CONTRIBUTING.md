# Contributing to UHQ Panel OS

Thanks for your interest! Bug reports, ideas, documentation fixes, translations and code are all welcome.

## Before you start

- Search the [existing issues](https://github.com/BloumeSAS/UHQ-Panel-OS/issues) first.
- For a large change, open an issue to discuss it before writing code.
- Security problems: **never** in a public issue, see [SECURITY.md](SECURITY.md).
- Add-ons live in their own repositories (`BloumeSAS/UHQ-Addon-*`): open issues and pull requests there.

## Development setup

Requirements: Node.js 20+, PostgreSQL 16 (or `docker compose up -d db`).

```bash
git clone https://github.com/BloumeSAS/UHQ-Panel-OS.git
cd UHQ-Panel-OS
cd api && npm install && npx prisma generate && npm run start:dev   # API :8000 + proxy :990
cd web && npm install && npm run dev                                 # panel :5173
```

## Guidelines

- **TypeScript everywhere**, strict types, no `any` unless unavoidable.
- **Settings** are read through `SettingsService` (`api/src/config/settings.service.ts`), never `process.env` in business code.
- **Auth**: `/api/panel/*` uses JWT, `/api/v1/*` uses the API key. Admin routes use `@Roles('ADMIN')`; user routes filter by owner.
- **Secrets** are never returned in clear text.
- **i18n**: every UI string has a French **and** an English key (`web/src/lib/i18n/fr.ts` and `en.ts`).
- **Database**: the schema is applied with `prisma db push` at boot — keep changes backward compatible.
- Keep pull requests focused; one topic per PR.

## Checks before opening a pull request

```bash
cd api && npx tsc --noEmit && npm run build
cd web && npx tsc --noEmit -p tsconfig.json && npm run build
```

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org/) are used: `feat(scope): …`, `fix(scope): …`, `docs: …`, `chore: …`.

## Releases

Releases are cut by the maintainers (version bump, tag, GitHub release, changelogs, Docker images on Docker Hub and GHCR).

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
