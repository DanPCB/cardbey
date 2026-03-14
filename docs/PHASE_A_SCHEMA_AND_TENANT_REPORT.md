# Phase A — Part 1: Prisma schema & tenant/store report

**Date:** 2026-03-02  
**Scope:** Inspect existing Campaign and related models; document tenant/store patterns; identify gaps for Phase A (validate-scope).

---

## 1. Prisma schema locations

- **SQLite:** `apps/core/cardbey-core/prisma/sqlite/schema.prisma` — used for local dev / unit tests; generate with `npx prisma generate --schema prisma/sqlite/schema.prisma`; do not use migrate (use `db push` if needed).
- **Postgres:** `apps/core/cardbey-core/prisma/postgres/schema.prisma` — used for contract tests, staging, production; migrations under `prisma/postgres/migrations/`.

Both schemas are kept in sync; same model set.

---

## 2. Existing Campaign and related models

### Campaign (existing)

- **Location:** Both schemas, after `Workflow` / `CampaignStatus` enum.
- **Fields:** `id`, `title`, `productId` (optional), `data` (Json), `status` (DRAFT | SCHEDULED | RUNNING | DONE), `createdAt`, `updatedAt`, `workflowId` (optional FK to Workflow).
- **Usage:** `scripts/marketing-agent-test-flow.js` creates Campaign with `title`, `productId`, `data` (scenario, storeName, socialPosts, etc.), `status: 'DRAFT'`. No `tenantKey`, `storeId`, or `draftStoreId`; linked to Workflow only.

### Workflow

- `id`, `name`, `prompt`, `status`, `trigger`, `actions` (Json), `campaigns` (Campaign[]). No tenant/store fields.

### AuditEvent (existing)

- `entityType`, `entityId`, `action`, `fromStatus`, `toStatus`, `actorType`, `actorId`, `correlationId`, `reason`, `metadata`, `createdAt`. Used for DraftStore, OrchestratorTask, Business; no CampaignPlan yet.

### Mission

- `id`, `tenantId`, `createdByUserId`, `title`, `status`, `context`. Used for agent-chat missions; `tenantId` is the canonical tenant.

### DraftStore

- `id`, `status`, `ownerUserId`, `committedStoreId` (Business.id when committed), `committedUserId`, `guestSessionId`, etc. No `tenantKey`; ownership by `ownerUserId`. Store identity: `committedStoreId` or draft id.

### Business (store)

- `id`, `userId`, `name`, `type`, `slug`, etc. Products linked via `Product.businessId`. So **storeId** in the app = `Business.id`.

### Product

- `businessId` (FK to Business), `imageUrl`, `images` (Json), `isPublished`, etc.

---

## 3. Tenant/store relationships

| Concept       | Source                    | Notes |
|---------------|---------------------------|--------|
| **tenantKey** | Same as Mission.tenantId  | From `getTenantId(user)` = `user?.business?.id ?? user?.id`. No `tenantKey` column on Campaign or DraftStore. |
| **storeId**   | Business.id              | Store = Business; products belong to Business. |
| **draftStoreId** | DraftStore.id         | Draft store before commit; may have `ownerUserId` and optionally `committedStoreId` later. |

**Tenant scoping for Phase A:**

- For **storeId:** ensure `Business.id === storeId` and `Business.userId === req.user.id` (user owns the store).
- For **draftStoreId:** ensure `DraftStore.id === draftStoreId` and `DraftStore.ownerUserId === req.user.id` (user owns the draft).

---

## 4. Gaps for Phase A

- **CampaignPlan (or CampaignDraft/PlanProposal):** Not present. Need additive model with `tenantKey`, `storeId?`, `draftStoreId?`, `objective`, `target` (Json), `timeWindow` (Json), `budget` (Json), `channelsRequested` (Json), `status` (draft | validated), `missionId?`, `createdAt`, `updatedAt`.
- **CampaignValidationResult:** Not present. Need model with `tenantKey`, `planId` (FK CampaignPlan), `checks` (Json), `blockers` (Json), `warnings` (Json), `risk`, `confidence`, `createdAt`, `updatedAt`.
- **Validate-scope API:** Not present. Need POST endpoint with auth, tenant scoping, validations, and persistence of plan + validation + AuditEvent.
- **AuditEvent** already supports any `entityType`/`action`; add `campaign_plan_validated` with `entityType: 'CampaignPlan'`, `entityId: planId`, `metadata` (risk, confidence, blocker count).

No changes to DraftStore, Store (Business), Product, or Media for Phase A.
