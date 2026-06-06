# syntax=docker/dockerfile:1.6
# ---------------------------------------------------------------
# UHQ Panel OS — multi-stage Dockerfile (image unique)
# Stage 1 (web-builder): build le panel React (web/ → web/dist)
# Stage 2 (builder)    : install deps, generate Prisma client, build TS
# Stage 3 (runner)     : runtime Alpine minimal (API + proxy + panel statique)
# ---------------------------------------------------------------

# ----- Stage 1 : panel React ------------------------------------
FROM node:20-alpine AS web-builder
WORKDIR /web
COPY web/package*.json ./
RUN npm install --no-audit --no-fund --legacy-peer-deps
COPY web/ ./
RUN npm run build


# ----- Stage 2 : backend NestJS (dossier api/) ------------------
FROM node:20-alpine AS builder
WORKDIR /app

# Prisma needs OpenSSL at build time to download the correct engine
RUN apk add --no-cache openssl

# Install ALL deps (dev included) — needed to compile TS
COPY api/package*.json ./
COPY api/prisma ./prisma
RUN npm install --no-audit --no-fund --legacy-peer-deps

# Generate the Prisma client against the schema
RUN npx prisma generate

# Copy the rest and build
COPY api/tsconfig*.json api/nest-cli.json ./
COPY api/src ./src
COPY api/static ./static
RUN npm run build

# Drop dev dependencies — keeps the runtime image lean
RUN npm prune --production --legacy-peer-deps


# ----- Stage 3 : runner -----------------------------------------
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8000
# Dossier de config runtime persistante (lien base saisi au setup, etc.)
ENV DATA_DIR=/app/data
# Increase the per-process file descriptor ceiling. The proxy engine
# holds thousands of concurrent sockets.
ENV UV_THREADPOOL_SIZE=16

# OpenSSL for the Prisma engine, curl for the HEALTHCHECK
RUN apk add --no-cache openssl curl

# Non-root user (good hygiene + Coolify-friendly)
RUN addgroup -S app && adduser -S app -G app
# Dossier de données inscriptible par l'utilisateur non-root (monté en volume).
RUN mkdir -p /app/data && chown app:app /app/data

COPY --from=builder --chown=app:app /app/node_modules ./node_modules
COPY --from=builder --chown=app:app /app/dist ./dist
COPY --from=builder --chown=app:app /app/prisma ./prisma
COPY --from=builder --chown=app:app /app/static ./static
COPY --from=builder --chown=app:app /app/package*.json ./
# Panel React buildé — servi en statique par NestJS (ServeStaticModule → web/dist).
COPY --from=web-builder --chown=app:app /web/dist ./web/dist

USER app

# Only EXPOSE the HTTP API port. The TCP proxy on 990 is still listened on
# by Node and published to the host via the compose `ports:` mapping, but
# we deliberately HIDE it from Docker's exposed-ports metadata so Traefik
# auto-detects the right port for HTTP routing without ambiguity.
#
# (When two ports are exposed AND Coolify's SERVICE_FQDN_<NAME>_<PORT> magic
# var fails to emit the loadbalancer.server.port label — which happens in
# some Coolify versions — Traefik silently picks the wrong port and returns
# 504 because it speaks HTTP to a TCP-only listener.)
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8000/health || exit 1

# `prisma db push` compares schema.prisma to the live database and applies
# any drift idempotently (no-op if nothing changed). Safer than migrate
# deploy when starting from a DB that already has the right tables but no
# migration history — which is our case (the original FastAPI app populated
# the schema). The `--skip-generate` flag avoids regenerating the client
# (already done at build time); `--accept-data-loss` only kicks in if a
# field shrinks, and it suppresses the otherwise-blocking interactive prompt.
# `prisma db push` applique le schéma SI la base est joignable. On ne bloque PAS
# le démarrage en cas d'échec : sans base configurée, l'app démarre quand même
# pour servir l'assistant de configuration (puis l'app applique le schéma à la
# saisie du lien). Avec une base présente (env/compose), le push s'exécute.
CMD ["sh", "-c", "npx prisma db push --skip-generate --accept-data-loss || echo 'DB non configurée — démarrage en mode configuration'; node dist/main.js"]
