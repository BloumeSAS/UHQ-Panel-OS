# UHQ Panel OS

**The open-source, self-hosted panel to manage, monitor and resell proxies** — by [Bloume SAS](https://bloume.fr), sponsored by [UHQ.Monster](https://uhq.monster).

One image ships the NestJS API, the React admin panel, the TCP proxy engine and 10 free official add-ons (Wallet, Orders, Analytics, Promo Codes, UHQ.Monster Reseller, Vitrine, Tickets, Referral, Status, Security).

- 📚 Documentation: https://uhq-panel-os-docs.bloume.fr
- 💻 Source code: https://github.com/BloumeSAS/UHQ-Panel-OS
- ▶️ Video tour: https://youtu.be/UUASI5vbf2Q · Installation: https://youtu.be/bF2yE-W-93s

## Tags

| Tag | Content |
|---|---|
| `latest` | Latest release |
| `X.Y.Z` / `X.Y` | A given release |
| `main` | Latest commit on `main` |

Platforms: `linux/amd64`, `linux/arm64`. Also available as `ghcr.io/bloumesas/uhq-panel-os`.

## Quick start (Docker Compose)

```yaml
services:
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: uhq
      POSTGRES_PASSWORD: change-me
      POSTGRES_DB: uhqpanel
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U uhq -d uhqpanel"]
      interval: 10s
      retries: 5

  app:
    image: bloumesas/uhq-panel-os:latest
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
    ports:
      - "8000:8000"          # panel + API (put it behind HTTPS)
      - "990:990"            # TCP proxy engine
      - "9000-9250:9000-9250" # dedicated ports
    cap_add: [NET_ADMIN]     # only for OpenVPN exits
    devices: ["/dev/net/tun:/dev/net/tun"]
    environment:
      DATABASE_URL: postgresql://uhq:change-me@db:5432/uhqpanel
      DATA_DIR: /app/data
    volumes:
      - appdata:/app/data

volumes:
  pgdata:
  appdata:
```

```bash
docker compose up -d
docker compose logs app | grep TOKEN   # installation token for the setup wizard
```

Then open `http://<server>:8000` and follow the setup wizard. Full guide (Coolify, DNS, Cloudflare): https://uhq-panel-os-docs.bloume.fr/guide/installation

## License

MIT © Bloume SAS
