# Tracking — pre-existing test / CI debt

Items known before VisionIntake Sprint 1; not introduced by vision work. Revisit before staging SQLite↔Postgres parity passes.

| Issue | Symptom | Impact |
|-------|---------|--------|
| `conversation_sessions.metadata JSONB` in SQLite schema | `npm test` pretest (`reset-test-db.mjs` → `prisma db push`) fails: `unrecognized token: "{"` on `JSONB` default | Fresh test DB bootstrap blocked via default `npm test`; vitest still runs when DB already exists |
| ~43 failing core tests (e.g. `offerExecutors`, `store-publish`) | Full `vitest run` reports failures unrelated to vision | Regression signal noise; do not grandfather as acceptable |

**Next actions (when prioritized):** map `JSONB` columns to `Json` in `prisma/sqlite/schema.prisma` for `conversation_sessions`; triage and fix or quarantine the 43 failing tests with owners.
