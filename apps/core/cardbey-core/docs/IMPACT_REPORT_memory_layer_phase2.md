# Impact report: Memory layer Phase 2/3 foundation

## What could break

- Intake maintenance path and main classifier path now run `hydrateContext` (extra DB reads).
- `reactPlanner` missing-store prompts changed from generic "select a store first" to resolution-specific asks when errors exist.
- Episodic writes on every tool dispatch may add blackboard rows (trimmed to 200/user, 30 days).
- SQLite `mode: insensitive` avoided via `caseInsensitiveFilter`.

## Why

- MissionBlackboard is mission-scoped append-only log (`eventType` + JSON payload), not key/value.
- Episodic events use `eventType: episodic_event` with payload `{ episodicType, userId, ... }`.
- `reactPlanner` remains DB-free; hydration runs in routes before planner/classifier.

## Impact scope

- `src/lib/memory/*` (new)
- `src/lib/intake/reactPlanner.js`
- `src/lib/intake/intakeClassifier.js` (memory block in prompt only)
- `src/routes/performerIntakeV2Routes.js`
- `src/lib/toolDispatcher.js`

## Smallest safe patch applied

- New modules + legacy shim in `reactPlanner`.
- Fire-and-forget `writeEpisodicEventAsync` in dispatcher.
- No Prisma schema migration (no EpisodicEvent model).
