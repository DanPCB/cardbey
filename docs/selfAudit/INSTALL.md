# Self-Audit Installation

## Prerequisites

- Node 18+
- `@cardbey/core` dependencies installed (`npm ci` in `apps/core/cardbey-core`)

## Environment

Copy variables from `.env.example`:

```bash
SELF_AUDIT_ENABLED=true
SELF_AUDIT_SCHEDULE="0 */6 * * *"
SELF_AUDIT_AUTO_FIX=false
SELF_AUDIT_MAX_ISSUES=100
SELF_AUDIT_RETENTION_DAYS=30
TELEMETRY_SYNC_ENABLED=true
TELEMETRY_SYNC_INTERVAL=300
MISSION_CONSOLE_TELEMETRY_STORE=true
```

## Enable scheduler

Scheduler starts automatically when `SELF_AUDIT_ENABLED=true` and core API boots (`ROLE=api`).

## Dashboard UI

Self-audit status appears on **Mission Console → Telemetry** (`/console/telemetry`) for platform admins.

## CI

`.github/workflows/self-audit.yml` runs `npm run self-audit` every 6 hours.
