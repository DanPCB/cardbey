# Self-Audit System

Cardbey Performer self-audit detects runtime issues across UI, agents, database, and performance. It integrates with Mission Console telemetry and multi-agent monitoring.

## Architecture

- **Detectors** (`detectors/`) — 8 parallel heuristics including telemetry-driven issues
- **Fix generators** (`fixGenerators/`) — governed proposals (Path A guardrails, no auto file writes)
- **Integration** (`integration/`) — telemetry bridge, playbook bridge, monitoring bridge
- **Orchestrator** (`orchestrator.ts`) — parallel audit, dedupe, history
- **Scheduler** (`scheduler.ts`) — cron via `SELF_AUDIT_SCHEDULE`

## Governed auto-heal

`SELF_AUDIT_AUTO_FIX=false` by default. Fixes are proposed; admins approve via API or `SelfAuditStatus` UI.

## API

- `GET /api/self-audit/status`
- `GET /api/self-audit/telemetry-status` (admin)
- `POST /api/self-audit/run` (admin)
- `GET /api/self-audit/history` (admin)
- `POST /api/self-audit/fix/:issueId` (admin, `confirmed: true`)
- `POST /api/self-audit/events` — frontend telemetry

## CLI

```bash
npm run self-audit
npm run self-audit:watch
npm run self-audit:fix -- --confirm
npm run self-audit:report
npm run telemetry:sync
```
