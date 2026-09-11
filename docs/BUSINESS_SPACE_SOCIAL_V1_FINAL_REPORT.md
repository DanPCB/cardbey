# Business Space Social V1 — Final Report

**Date:** 2026-09-11  
**Verdict:** `BUSINESS_SPACE_SOCIAL_V1_PASS`

| Layer | Status |
|-------|--------|
| **IMPLEMENTATION_PROOF** | **PASS** |
| **STAGING_MIGRATION** | **PASS** (deployed + Comment create/list smoke) |
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
- Comment API: `GET /api/activities/nonexistent/comments` → `404 activity_not_found`
- Local DB: `file:.../prisma/dev-fresh.db`
- Comment table via `scripts/ensure-comment-table.mjs` (no `prisma db push`)

---

## 2. Browser Post E2E proof (Gate 2)

Playwright `tests/e2e/business-space-social-v1.spec.ts` — **PASSED** (reconfirmed 2026-09-11, ~18s)

Latest local evidence:

```json
{
  "ok": true,
  "storeId": "cmtwyw9tf0001jvmc7tn1r1lo",
  "ownerId": "cmtwyw9oj003zjvu0rrua0w3q",
  "activityId": "07879c31-a71d-43a9-88e0-7a2da43d74d9",
  "publishStatus": 201,
  "postText": "Business Space social E2E post",
  "globalRankBumped": true
}
```

Proven: + Post UI → composer close → immediate card → one `SPACE_UPDATE` → hard refresh, no duplicate → correct store/actor.

---

## 3. Browser Comment E2E proof (Gate 3)

Same Playwright run:

```json
{
  "commentId": "cmtwywjnj0044jvu0p8xt4xtb",
  "commentStatus": 201,
  "commentsCount": 1,
  "commentText": "Canonical comment E2E test"
}
```

Proven: immediate thread display, count=1, refresh persists, Comment bound to same `activityId`.

---

## 4. Authorization negative proof (Gate 4)

| Attempt | Local | Staging |
|---------|-------|---------|
| Stranger Space post | **403** | **403** |
| Unauthenticated comment | **401** | **401** |

Zero unauthorized `SPACE_UPDATE` / Comment rows.

---

## 5. Global regression proof (Gate 5)

- Local published store: `globalRankBumped: true`
- Staging unpublished new store: `globalRankBumped: false` (expected — no `publishedAt` yet; bump is V1 store-card rank, not a new Global activity row)
- Staging `GET /api/public/stores/feed` → `ok: true`
- **`GLOBAL_ACTIVITY_ROW_PROJECTION_V2 = DEFERRED`**

---

## 6. Migration SQL review (Gate 6a)

`prisma/postgres/migrations/20260911220000_activity_comment_v1/migration.sql`

- Additive only: `CREATE TABLE "Comment"` + six indexes
- No DROP / rewrite / unrelated tables

---

## 7. Staging migration proof (Gate 6b)

**PASS**

Shipped:
- Dashboard staging PR: https://github.com/DanPCB/cardbey-marketing-dashboard/pull/353
- Core staging PR: https://github.com/DanPCB/cardbey/pull/430

After Render redeploy (`cardbey-core-staging`):
- Route live: `GET .../api/activities/nonexistent/comments` → `activity_not_found`
- Smoke create/list Comment succeeded (table + indexes + API):

```json
{
  "ok": true,
  "staging": "https://cardbey-core-staging.onrender.com",
  "storeId": "cmtwzb7m7000bs5feb4zrpou0",
  "ownerId": "cmtwzb61z0009s5fe0090ywh9",
  "activityId": "3bfefd6f-608b-4ce9-8cc4-d9868e0d3955",
  "commentId": "cmtwzb8f7000cs5feoq6x5e6n",
  "commentsCount": 1,
  "publishStatus": 201,
  "commentStatus": 201
}
```

Migration applied via Render `npm prestart` bootstrap (`migrate deploy` against postgres schema). No `db push` used.

---

## 8. Production deployment status (Gate 6c)

**`HUMAN_DEPLOYMENT_REQUIRED`**

Preconditions:
1. Merge Social V1 Core (+ Dashboard) to production/`main` as per normal release process
2. Confirm production Core checkout includes `20260911220000_activity_comment_v1`
3. On production Core (Render shell or deploy prestart):

```bash
cd /opt/render/project/src/apps/core/cardbey-core
npm run migrate:deploy
# ≡ node scripts/run-postgres-prisma.js migrate deploy
# ≡ npx prisma migrate deploy --schema prisma/postgres/schema.prisma
```

4. Bounded smoke: authenticated `POST/GET /api/activities/:activityId/comments`

Do **not** use `prisma db push` on production.

This does **not** downgrade IMPLEMENTATION_PROOF or staging PASS.

---

## 9. Local SQLite drift note (Gate 8)

**`LOCAL_SQLITE_SCHEMA_DRIFT = PRE_EXISTING_FOLLOW_UP`**

Did not rewrite historical migrations or run `db push` on the large SQLite DB. Local E2E used `ensure-comment-table.mjs` only.

---

## 10. Remaining issues

1. Production merge + `migrate deploy` (human)
2. Pre-existing local SQLite index drift (out of scope)
3. Deferred Global activity-row V2

---

## 11. Final verdict

### `BUSINESS_SPACE_SOCIAL_V1_PASS`

All PASS conditions met for Post, Comment, Regression, and Staging database validation. Production remains explicitly `HUMAN_DEPLOYMENT_REQUIRED`.
