# Impact Report — Live Market Staging Deployment Verification

**Date:** 2026-08-13  
**Workstream:** Deployment verification (independent of Phase 2 provider research)  
**Status:** `BLOCKED_PENDING_PROMOTE_AND_STAGING_DB_ACCESS`

---

## (1) What could break

| Risk | Detail |
|------|--------|
| Staging migrate | Additive tables only, but failed migrate can leave P3009 and block future deploys |
| PreDeploy bootstrap | `cardbey-core-staging` runs `prisma-bootstrap.js` on deploy — Live Market SQL must be on the `staging` branch first |
| Flags | Accidental enable of `ENABLE_LIVE_MARKET_*` would expose APIs before ops is ready |
| Rollback | Dropping tables after pilot data exists loses enrolment/session rows |
| Uncommitted local WIP | Live Market migration/code currently **untracked** in this worktree — not on `origin/staging` |

## (2) Why

Controlled staging Postgres deploy is required before overall Phase 1 can leave `PARTIAL_PENDING_DEPLOYMENT_VERIFICATION`. This agent environment has **no** staging `DATABASE_URL` / `POSTGRES_DATABASE_URL`, and Live Market artifacts are not yet on the Render `staging` branch.

## (3) Impact scope

| Area | Impact |
|------|--------|
| Staging Postgres | New tables/indexes only when migration is applied |
| Staging Core boot | Routes mount only after code deploy; flags remain off by default |
| Production | Out of scope |
| SQLite historical repair | Separate workstream (do not touch) |

## (4) Smallest safe patch / procedure

Do **not** rewrite historical migrations. Sequence:

1. Commit + promote Live Market Phase 1 (migration + code) onto `staging`  
2. Render Postgres **backup / snapshot** before migrate  
3. Confirm `_prisma_migrations` healthy (no P3009)  
4. Controlled `migrate deploy` via staging preDeploy **or** one-off shell with Internal Database URL  
5. Verify tables/indexes; server boot; flags-off HTTP; document rollback SQL  

---

## Evidence collected (this session)

### Static review — PASSED

`npm run live-market:postgres-static`:

- Postgres schema validates  
- Migration `20260813120000_live_market_phase1_foundation` present  
- Tables: `LiveMarketPilotEnrollment`, `LiveMarketSession`, `LiveMarketSessionSubject`  
- Cascade FKs present; models defined in `prisma/postgres/schema.prisma`

SQL reviewed: additive `CREATE TABLE IF NOT EXISTS` + indexes only; no destructive DDL.

### Staging live probe (`https://cardbey-core-staging.onrender.com`)

| Check | Result |
|-------|--------|
| `GET /api/health` | 200, `env=staging` |
| `GET /api/v2/flags` | No `LIVE_*` / `ENABLE_LIVE_MARKET_*` keys |
| `GET /api/public/live-market/sessions/probe` | **404** (routes not deployed) |
| `GET /api/stores/…/live-market/status` | **404** (routes not deployed) |
| `GET /api/admin/live-market/health` | **401** (admin auth gate; not proof Live Market is mounted) |
| `origin/staging` tree | **No** `*live_market*` migration files |
| Local worktree | Live Market migration + `src/lib/liveMarket` still **untracked (`??`)** |

### Credentials / backup tooling

| Item | Result |
|------|--------|
| Local `.env` `DATABASE_URL` | SQLite file only (not staging Postgres) |
| Process `POSTGRES_DATABASE_URL` | unset |
| Render CLI | installed; **not usable here for DB migrate without authenticated staging access + Internal URL** |
| Staging backup | **Not executed** — requires Render dashboard operator (Postgres → Backup / export) |

---

## Controlled migrate runbook (operator)

### A. Backup (required first)

1. Render Dashboard → Postgres service linked to `cardbey-core-staging`  
2. Create backup / note PITR window  
3. Record timestamp + who authorized  

### B. Promote code

1. Land Phase 1 commits (schema + migration + liveMarket module + flags default OFF) on branch `staging`  
2. Confirm deploy of `cardbey-core-staging` (preDeploy: `resolve-postgres-failed-migration` + `prisma-bootstrap`)  
3. Confirm `ENABLE_LIVE_MARKET_V1` and subflags are **unset/false** in Render Environment  

### C. Migration apply

Preferred: let staging **preDeploy** run `prisma migrate deploy` after promote.  
Manual one-off (Render Shell or local with Internal URL only):

```bash
export DATABASE_URL="<Render Internal Database URL — do not commit>"
cd apps/core/cardbey-core
npm run prisma:migrate:postgres
# ≡ node scripts/run-postgres-prisma.js migrate deploy
```

### D. Post-migrate verification SQL

```sql
SELECT tablename FROM pg_tables
WHERE tablename IN (
  'LiveMarketPilotEnrollment',
  'LiveMarketSession',
  'LiveMarketSessionSubject'
);

SELECT indexname FROM pg_indexes
WHERE tablename LIKE 'LiveMarket%';

SELECT migration_name, finished_at, rolled_back_at
FROM "_prisma_migrations"
WHERE migration_name LIKE '%live_market%';
```

### E. Flags-off HTTP (after code deploy)

Expect **403** `LIVE_MARKET_DISABLED` once routes exist and flags stay off:

```bash
curl -sS "$STAGING/api/public/live-market/sessions/x"
curl -sS -H "Authorization: Bearer $TOKEN" \
  "$STAGING/api/admin/live-market/health"
curl -sS -H "Authorization: Bearer $OWNER_TOKEN" \
  "$STAGING/api/stores/$STORE_ID/live-market/status"
```

### F. Rollback (tables only — last resort)

Only if migrate must be reversed **and** no retained pilot data is required:

```sql
DROP TABLE IF EXISTS "LiveMarketSessionSubject";
DROP TABLE IF EXISTS "LiveMarketSession";
DROP TABLE IF EXISTS "LiveMarketPilotEnrollment";
-- Then prisma migrate resolve --rolled-back 20260813120000_live_market_phase1_foundation
```

Do **not** edit historical migration files.

---

## Verdict

| Checkpoint | Status |
|------------|--------|
| Schema / SQL static review | **PASS** |
| Staging backup | **NOT DONE** (needs Render operator) |
| Controlled Postgres migrate | **BLOCKED** — migration not on `staging`; no DB URL in agent |
| Tables/indexes verified on staging | **BLOCKED** |
| Server boot with Live Market code on staging | **BLOCKED** (404 — not deployed) |
| Flags-off behavior on staging | **PARTIAL probe only** (404 today; 403 expected after deploy with flags off) |
| Rollback procedure | **Documented** (not executed) |

**Overall deployment verification:** `BLOCKED_PENDING_PROMOTE_AND_STAGING_DB_ACCESS`  

Phase 1 code/pilot UI verdicts remain unchanged. Streaming remains **not** operational.
