# Core API immutable artifact (Phase 1 of artifact promotion).
# Build context: apps/core/cardbey-core
# This image is built ONCE per commit in CI and pushed to GHCR. It does NOT
# replace Render's native build yet (see docs/IMPACT_REPORT_artifact_promotion_cicd.md).
FROM node:20-slim

# openssl + ca-certificates are required by Prisma's query engine on slim images.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dummy Postgres URL so `prisma generate` emits the Postgres client (matches prod
# runtime). Prisma generate does NOT connect to a database; the value is never used
# at runtime — the real DATABASE_URL is injected by the platform.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
ENV NODE_ENV=production

# Install from lockfile (deterministic). postinstall generates the Prisma client
# and rebuilds sharp for linux.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Generate Prisma client for the resolved schema (idempotent with postinstall).
RUN npm run build

EXPOSE 3000

# prestart runs prisma-bootstrap (idempotent migrate deploy) using the real
# DATABASE_URL injected at runtime, then boots the server.
CMD ["npm", "start"]
