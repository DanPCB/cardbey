# Business Space Social V1 — Final Report

**Date:** 2026-09-11  
**Verdict:** `BUSINESS_SPACE_SOCIAL_V1_PASS`

| Layer | Status |
|-------|--------|
| **IMPLEMENTATION_PROOF** | **PASS** |
| **STAGING_DEPLOYMENT** | **PASS** (`STAGING_SOCIAL_V1_PASS`) |
| **PRODUCTION_DEPLOYMENT** | **PASS** (smoke against live Core) |
| **GLOBAL_ACTIVITY_ROW_PROJECTION_V2** | `DEFERRED` |
| **LOCAL_SQLITE_SCHEMA_DRIFT** | `PRE_EXISTING_FOLLOW_UP` |

---

## Production promotion (Gates 7–8)

### Artifacts promoted

| Surface | Proven staging SHA | Production |
|---------|-------------------|------------|
| Core Social V1 | `ba80bf660` (cherry-picked → `e6a20b818`) | Merged [#433](https://github.com/DanPCB/cardbey/pull/433) → `fc3cb8e9d` on `main` |
| Dashboard Social V1 | `41ae807f` | Already on `main` via [#354](https://github.com/DanPCB/cardbey-marketing-dashboard/pull/354) |

Migration: `20260911220000_activity_comment_v1` — applied via Render production `prestart` / `migrate deploy` (no `db push`). Proven by successful Comment create on production Postgres.

### Production smoke evidence

```json
{
  "ok": true,
  "production": "https://cardbey-core.onrender.com",
  "storeId": "cmtx0713b000uphb9s33hhldg",
  "ownerId": "cmtx06zgj000sphb953bzul0d",
  "activityId": "7fde453e-161d-4d64-b0d4-eaec6a4e0af5",
  "commentId": "cmtx071nx000vphb9n31fno25",
  "publishStatus": 201,
  "commentStatus": 201,
  "commentsCountBefore": 0,
  "commentsCountAfter": 1,
  "commentPersisted": true,
  "postPersisted": true,
  "unauthorizedPublishStatus": 403,
  "unauthCommentStatus": 401,
  "feedOk": true,
  "eventType": "SPACE_UPDATE",
  "mergeCommit": "fc3cb8e9d4ac88f8aae6417b1099dc6e523171cc",
  "sourceCommit": "ba80bf660"
}
```

Notes:
- Test-only accounts/stores (`social-prod-*@example.com`); no real customer content.
- `globalRankBumped: false` on unpublished new test store is expected V1 behavior (same as staging); Global feed remained healthy (`feedOk: true`). Local/staging published-store proof already showed bump=`true`.

---

## Staging (prior)

Staging Comment route + create/list + 403/401 proven earlier; Core [#430](https://github.com/DanPCB/cardbey/pull/430), Dashboard [#353](https://github.com/DanPCB/cardbey-marketing-dashboard/pull/353).

---

## Local implementation proof (prior)

Playwright + unit suites PASS; Core `:3001` / Dashboard `:5174`.

---

## Deferred / follow-ups

- `GLOBAL_ACTIVITY_ROW_PROJECTION_V2 = DEFERRED`
- `LOCAL_SQLITE_SCHEMA_DRIFT = PRE_EXISTING_FOLLOW_UP`
