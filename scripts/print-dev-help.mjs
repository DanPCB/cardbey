#!/usr/bin/env node
import { CORE_PORT, DASHBOARD_PORT, CORE_HEALTH_URL, DASHBOARD_URL } from './dev-constants.mjs';

console.log(`
Cardbey local development
=========================

Run from repo root OR from apps/core/cardbey-core / apps/dashboard/...:

Before first start (or when stuck):
  pnpm dev:doctor --probe
  pnpm dev:cleanup -- --force   # stops stale Cardbey node processes
  pnpm dev:prisma               # Regenerate SQLite Prisma client (after cleanup)

Canonical two-terminal startup:
  Terminal 1:  pnpm dev:core
  Terminal 2:  pnpm dev:dashboard

URLs:
  Core health:  ${CORE_HEALTH_URL}
  Dashboard:    ${DASHBOARD_URL}

Ports (do not change without updating CORS):
  Core API:     ${CORE_PORT}
  Dashboard:    ${DASHBOARD_PORT}

Full guide: docs/LOCAL_DEV.md
`);
