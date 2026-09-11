# Business Space Social V1 — Final Report

**Date:** 2026-09-11  
**Verdict:** `BUSINESS_SPACE_SOCIAL_V1_PARTIAL`

| Layer | Status |
|-------|--------|
| **IMPLEMENTATION_PROOF** | **PASS** |
| **STAGING_MIGRATION** | `HUMAN_DEPLOYMENT_REQUIRED` |
| **PRODUCTION_DEPLOYMENT_STATUS** | `HUMAN_DEPLOYMENT_REQUIRED` |
| **GLOBAL_ACTIVITY_ROW_PROJECTION_V2** | `DEFERRED` (does not block V1) |
| **LOCAL_SQLITE_SCHEMA_DRIFT** | `PRE_EXISTING_FOLLOW_UP` |

---

## 1. Runtime boot proof (Gate 1)

| Process | Port | PID | Command |
|---------|------|-----|---------|
| Core | `127.0.0.1:3001` | 17516 | `node --max-old-space-size=8192 --import tsx/esm scripts/dev-api-entry.mjs` |
| Dashboard | `0.0.0.0:5174` | 21024 | `vite --mode dev --host 0.0.0.0 --port 5174` |

- Core `/api/health` → `{ ok: true, env: "development" }`
- Dashboard `/` → HTTP 200
- Comment API live: `GET /api/activities/nonexistent/comments` → `404 {"ok":false,"error":"activity_not_found"}`
- Local DB: `file:.../prisma/dev-fresh.db`
- Comment table: ensured via `node scripts/ensure-comment-table.mjs` (no `prisma db push`)

---

## 2. Browser Post E2E proof (Gate 2)

Playwright: `tests/e2e/business-space-social-v1.spec.ts` — **PASSED** (16.1s)

Evidence (`apps/dashboard/.tmp/social-v1-e2e-evidence.json`):

```json
{
  "ok": true,
  "core": "http://127.0.0.1:3001",
  "dashboard": "http://127.0.0.1:5174",
  "storeId": "cmtwyewmd0001jv6wtd5tuaae",
  "ownerId": "cmtwyewhd003rjvu0a19w1kf3",
  "activityId": "60b25413-c1eb-43fa-8e7d-c5e34edcf94d",
  "publishStatus": 201,
  "postText": "Business Space social E2E post"
}
```

Proven:
- Owner opened `/space/:id` → **+ Post** → compose → submit
- Composer closed; card present without manual refresh (accessible name on feed link)
- Exactly one `StoreActivityEvent` (`SPACE_UPDATE`, `public_lifecycle`)
- Hard refresh: post still present; no duplicate event
- Actor = owner; store identity correct

Desktop sheet: primary “Update” action was previously outside the viewport; sheet max-height/overflow adjusted so Post actions remain usable on desktop (no architecture change).

---

## 3. Browser Comment E2E proof (Gate 3)

Same Playwright run:

```json
{
  "commentId": "cmtwyf4kt003wjvu0bk5f4z3g",
  "commentStatus": 201,
  "commentsCount": 1,
  "commentText": "Canonical comment E2E test"
}
```

Proven:
- Comment appears immediately in thread
- `data-comments-total` → 1
- Hard refresh: same comment remains
- `GET /api/activities/:activityId/comments` returns row
- Prisma `Comment` bound to same `activityId` / actor

---

## 4. Authorization negative proof (Gate 4)

| Attempt | Status | Side effect |
|---------|--------|-------------|
| Stranger `POST /api/stores/:storeId/space-updates` | **403** | Zero extra `SPACE_UPDATE` |
| Unauthenticated `POST /api/activities/:id/comments` | **401** | Zero Comment row |

---

## 5. Global regression proof (Gate 5)

- Publish response: `globalRankBumped: true` (V1 store-card rank bump)
- `GET /api/public/stores/feed?limit=20` → healthy (`200`)
- No Global activity-row V2 built
- **`GLOBAL_ACTIVITY_ROW_PROJECTION_V2 = DEFERRED`**

---

## 6. Migration SQL review (Gate 6a)

File: `prisma/postgres/migrations/20260911220000_activity_comment_v1/migration.sql`

- Additive only: `CREATE TABLE "Comment"` + six indexes
- No `DROP`, no data rewrite, no unrelated table changes
- Matches `prisma/postgres/schema.prisma` `Comment` model

---

## 7. Staging migration proof (Gate 6b)

**Status: `HUMAN_DEPLOYMENT_REQUIRED`**

Blocked in this workspace:
1. Social V1 Core files (migration, routes, service) are still **local untracked** — not on `origin/staging`
2. Staging API today: `GET .../api/activities/nonexistent/comments` → generic `{"error":"Not found"}` (route not deployed)
3. No staging Postgres `DATABASE_URL` available to this agent (local Core is SQLite)
4. Wrong `render` npm package on PATH (templating CLI, not Render.com)

### Human staging deploy sequence

```bash
# After merge of Social V1 to staging branch / Render auto-deploy:
cd /opt/render/project/src/apps/core/cardbey-core
npm run migrate:deploy
# ≡ node scripts/run-postgres-prisma.js migrate deploy
# ≡ npx prisma migrate deploy --schema prisma/postgres/schema.prisma

# Verify:
psql "$DATABASE_URL" -c '\d "Comment"'
# Smoke: authenticated POST /api/activities/:activityId/comments then GET list
```

Do **not** use `prisma db push` on staging/prod.

---

## 8. Production deployment status (Gate 6c)

**Status: `HUMAN_DEPLOYMENT_REQUIRED`**

Same migrate command after production merge/deploy. Smoke comment create/list on a non-customer test activity if available.

Does **not** downgrade IMPLEMENTATION_PROOF.

---

## 9. Local SQLite drift note (Gate 8)

**`LOCAL_SQLITE_SCHEMA_DRIFT = PRE_EXISTING_FOLLOW_UP`**

- Did not run `prisma db push` on the large historical SQLite DB
- Local E2E used `ensure-comment-table.mjs` on `dev-fresh.db` only
- Drift did **not** block browser E2E

---

## 10. Regression check (Gate 7)

| Suite | Result |
|-------|--------|
| Playwright `business-space-social-v1.spec.ts` | **PASS** |
| `activityCommentService.test.js` | **5/5 PASS** |
| `publishSpaceUpdate.test.js` | **6/6 PASS** |
| `BusinessActivityComposerSlot.test.ts` | **1/1 PASS** |

Unaffected by design: miniweb/storefront contracts unchanged; no second social domain.

---

## 11. Remaining issues

1. **Ship + migrate staging Postgres** (`20260911220000_activity_comment_v1`) — required to flip DATABASE gate and overall mission to PASS.
2. Production migrate after staging proof.
3. Pre-existing local SQLite index drift (out of scope).
4. Deferred: Global activity-row projection V2.

---

## Final verdict

### `BUSINESS_SPACE_SOCIAL_V1_PARTIAL`

**IMPLEMENTATION_PROOF = PASS** — browser Post + Comment E2E, auth negatives, Global V1 rank-bump, focused tests, additive migration SQL reviewed.

**Not full mission PASS** solely because staging Postgres `migrate deploy` was not executable from this environment (code not yet deployed; no staging DB credentials). Production correctly marked `HUMAN_DEPLOYMENT_REQUIRED`.
