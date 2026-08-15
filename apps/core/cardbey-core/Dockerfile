# Core API immutable artifact (Phase 1 of artifact promotion).
# Build context MUST be the monorepo root. package-lock.json links
# @cardbey/template-engine via file:../../../packages/template-engine;
# a context of apps/core/cardbey-core makes npm ci fail (arborist
# loadVirtual → masked EUSAGE "no package-lock.json").
# This image is built ONCE per commit in CI and pushed to GHCR. It does NOT
# replace Render's native build yet (see docs/IMPACT_REPORT_artifact_promotion_cicd.md).
FROM node:20-slim

# openssl + ca-certificates are required by Prisma's query engine on slim images.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace/apps/core/cardbey-core

# Dummy Postgres URL so `prisma generate` emits the Postgres client (matches prod
# runtime). Prisma generate does NOT connect to a database; the value is never used
# at runtime — the real DATABASE_URL is injected by the platform.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
ENV NODE_ENV=production

# Install from lockfile (deterministic). postinstall generates the Prisma client
# and rebuilds sharp for linux — it needs scripts/ and prisma/, so ignore-scripts
# until the full core tree is copied.
COPY apps/core/cardbey-core/package.json apps/core/cardbey-core/package-lock.json ./
COPY packages/template-engine /workspace/packages/template-engine
RUN npm ci --ignore-scripts

COPY apps/core/cardbey-core ./
RUN npm run postinstall

# Generate Prisma client for the resolved schema (idempotent with postinstall).
RUN npm run build

EXPOSE 3000

# prestart runs prisma-bootstrap (idempotent migrate deploy) using the real
# DATABASE_URL injected at runtime, then boots the server.
CMD ["npm", "start"]
