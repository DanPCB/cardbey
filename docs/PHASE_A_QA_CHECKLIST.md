# Phase A: Validate campaign scope — QA checklist & example curl

**Date:** 2026-03-02  
**Scope:** Manual QA for POST /api/campaign/validate-scope and read endpoints (GET /plan, GET /plan/:planId, GET /validation/:validationId). No Phase B/C/D; no changes to /api/draft-store/* or preview/publish.

---

## Files changed

| File | Change |
|------|--------|
| `apps/core/cardbey-core/prisma/sqlite/schema.prisma` | Added CampaignPlan, CampaignValidationResult (additive) |
| `apps/core/cardbey-core/prisma/postgres/schema.prisma` | Same additive models |
| `apps/core/cardbey-core/prisma/postgres/migrations/20260302100000_add_campaign_plan_validation/migration.sql` | New Postgres migration |
| `apps/core/cardbey-core/src/routes/campaignRoutes.js` | POST /validate-scope (requireAuth, canAccessBusiness); GET /plan, GET /plan/:planId, GET /validation/:validationId (read-only, tenant-scoped) |
| `apps/core/cardbey-core/src/lib/tenant.js` | Added canAccessBusiness(prisma, { tenantKey, user, storeId }) for consistent store ownership |
| `apps/core/cardbey-core/src/server.js` | Mount campaignRoutes at /api/campaign; import campaignRoutes |
| `docs/PHASE_A_SCHEMA_AND_TENANT_REPORT.md` | Part 1 report (schema + tenant patterns) |
| `docs/PHASE_A_QA_CHECKLIST.md` | This file |

**Not changed:** DraftStore, Store (Business), Product, Media, draft-store routes, preview/publish flows, auth middleware. No schema changes in this update.

---

## Prisma

- **SQLite (local):** After pulling, run `npx prisma generate --schema prisma/sqlite/schema.prisma` then `npx prisma db push --schema prisma/sqlite/schema.prisma` if you use SQLite for dev.
- **Postgres:** Run `npx prisma migrate deploy --schema prisma/postgres/schema.prisma` (with `DATABASE_URL=postgresql://...`).

---

## Example curl

**1) Minimal payload (missing objective, no store) — expect status=blocked, blockers present**

```bash
curl -s -X POST http://localhost:3000/api/campaign/validate-scope \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_OR_DEV_TOKEN" \
  -d '{}'
```

Expected: `status: "blocked"`, `blockers` includes e.g. `MISSING_OBJECTIVE`.

**2) With objective only (no store) — can be validated if no store required**

```bash
curl -s -X POST http://localhost:3000/api/campaign/validate-scope \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_OR_DEV_TOKEN" \
  -d '{"objective":"Launch summer promo"}'
```

Expected: `status: "validated"`, `blockers: []`, `planId` and `validationId` present.

**3) Valid storeId + objective + budget — expect status=validated, blockers empty**

Use a real `storeId` (Business.id) that belongs to the authenticated user and has at least one product.

```bash
curl -s -X POST http://localhost:3000/api/campaign/validate-scope \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_OR_DEV_TOKEN" \
  -d '{
    "storeId": "YOUR_BUSINESS_ID",
    "objective": "Summer sale",
    "budget": {"amount": 500, "currency": "USD"},
    "channels": ["scheduled_posts"]
  }'
```

Expected: `status: "validated"`, `blockers: []`, `planId`, `validationId`.

**4) Requested channel missing OAuth — warning + degradedMode**

```bash
curl -s -X POST http://localhost:3000/api/campaign/validate-scope \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_OR_DEV_TOKEN" \
  -d '{
    "objective": "Summer sale",
    "channels": ["instagram", "scheduled_posts"]
  }'
```

Expected: `status: "validated"`, `warnings` includes `OAUTH_NOT_CONNECTED`, `degradedMode: { reasonCodes: ["OAUTH_NOT_CONNECTED"], allowedChannels: ["scheduled_posts"] }`.

**5) Dev token (non-production only)**

```bash
curl -s -X POST http://localhost:3000/api/campaign/validate-scope \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dev-admin-token" \
  -d '{"objective":"Test"}'
```

Expected: 200, `planId` and `validationId` in response (dev user has no business so storeId checks would block if you pass a storeId).

---

### Read endpoints (GET)

**6) GET /api/campaign/plan?missionId=... — latest plan + validation for mission**

Use a `missionId` for which you have already created a plan (e.g. via validate-scope with that missionId).

```bash
curl -s "http://localhost:3000/api/campaign/plan?missionId=YOUR_MISSION_ID" \
  -H "Authorization: Bearer YOUR_JWT_OR_DEV_TOKEN"
```

Expected: 200, `{ ok: true, plan: { ... }, validation: { ... } | null }`. 404 if no plan for that mission or wrong tenant.

**7) GET /api/campaign/plan/:planId — plan by id + latest validation**

```bash
curl -s "http://localhost:3000/api/campaign/plan/PLAN_ID" \
  -H "Authorization: Bearer YOUR_JWT_OR_DEV_TOKEN"
```

Expected: 200, `{ ok: true, plan, validation }`. 404 if plan not found or tenant mismatch.

**8) GET /api/campaign/validation/:validationId — validation by id + plan**

```bash
curl -s "http://localhost:3000/api/campaign/validation/VALIDATION_ID" \
  -H "Authorization: Bearer YOUR_JWT_OR_DEV_TOKEN"
```

Expected: 200, `{ ok: true, validation, plan }`. 404 if validation not found or tenant mismatch.

---

## QA checklist

- [ ] **1. Minimal payload (missing budget/channels acceptable, missing objective):** Response `status === "blocked"`, `blockers` array has at least one entry (e.g. MISSING_OBJECTIVE).
- [ ] **2. Valid storeId + objective + budget:** Response `status === "validated"`, `blockers.length === 0`, `planId` and `validationId` are non-empty. Store must exist and belong to the authenticated user; store must have at least one product.
- [ ] **3. Requested channel missing OAuth (e.g. channels: ["instagram"]):** Response includes `warnings` with an OAuth-related code and `degradedMode` with `reasonCodes` and `allowedChannels: ["scheduled_posts"]`.
- [ ] **4. AuditEvent:** After a successful call, query AuditEvent (e.g. by entityType = 'CampaignPlan', action = 'campaign_plan_validated'); one row exists with entityId = planId, metadata containing risk, confidence, blockerCount (no secrets).
- [ ] **5. No impact on draft-store/preview/publish:** Confirm no changes to /api/draft-store/* routes; run a quick draft-store generate or preview flow and ensure behavior unchanged.
- [ ] **6. Unauthorized:** Request without Authorization header returns 401.
- [ ] **7. Store/draft ownership:** Passing another user’s storeId or draftStoreId returns blockers (STORE_ACCESS_DENIED or DRAFT_STORE_ACCESS_DENIED).
- [ ] **8. Business-tenant user access:** User with a business (tenantKey = business.id) can only use storeId equal to that business.id in validate-scope; validate-scope returns validated when storeId matches.
- [ ] **9. Non-owner access denied:** User A cannot access User B’s storeId or draftStoreId; validate-scope returns STORE_ACCESS_DENIED or DRAFT_STORE_ACCESS_DENIED. User A cannot read User B’s plan/validation via GET /plan or GET /validation (404).
- [ ] **10. GET /plan?missionId=:** With valid missionId that has a plan, returns 200 and `{ plan, validation }`; without auth returns 401; wrong tenant or unknown missionId returns 404.
- [ ] **11. GET /plan/:planId:** With valid planId for tenant, returns 200 and `{ plan, validation }`; wrong tenant or invalid planId returns 404.
- [ ] **12. GET /validation/:validationId:** With valid validationId for tenant, returns 200 and `{ validation, plan }`; wrong tenant or invalid id returns 404.
- [ ] **13. No secrets in read responses:** GET responses do not include internal secrets; only plan/validation fields (id, tenantKey, objective, checks, blockers, etc.).

---

## API response shape (for Execution panel)

The response is suitable for the Execution panel to show Phase 1 result later (no PhaseOutputs UI in this change):

```json
{
  "ok": true,
  "planId": "...",
  "validationId": "...",
  "status": "blocked" | "validated",
  "checks": [{ "code": "...", "ok": true|false, "message": "..." }],
  "blockers": [{ "code": "...", "message": "..." }],
  "warnings": [{ "code": "...", "message": "..." }],
  "risk": "low" | "med" | "high",
  "confidence": "low" | "med" | "high",
  "degradedMode": { "reasonCodes": [], "allowedChannels": [] }
}
```

`degradedMode` is present only when channels were requested and OAuth is not connected (social channel requested).

**Read endpoints (for PhaseOutputs):**

- **GET /plan?missionId=** and **GET /plan/:planId:** `{ ok: true, plan: CampaignPlan, validation: CampaignValidationResult | null }`
- **GET /validation/:validationId:** `{ ok: true, validation: CampaignValidationResult, plan: CampaignPlan }`
