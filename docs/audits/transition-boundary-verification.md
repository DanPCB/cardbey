# Transition Boundary Verification

Manual verification checklist for the doctrine foundation (PR1 + PR2): state-machine centric transitions for DraftStore + OrchestratorTask with AuditEvent emission.

## Overview

All status transitions for `DraftStore` and `OrchestratorTask` now go through the kernel transition service (`src/kernel/transitions/transitionService.js`). Each successful transition writes an `AuditEvent` record.

## Manual Verification Steps

### 1. Orchestra/Start → OrchestratorTask transitions

1. Trigger `POST /api/mi/orchestra/start` with build_store goal (e.g. "French Baguette café").
2. Verify OrchestratorTask transitions are logged:
   - `queued` → `running` (atomic via updateMany)
   - `running` → `completed` (or `running` → `failed` on error)

**Query to inspect:**
```sql
SELECT id, "entityType", "entityId", action, "fromStatus", "toStatus", "actorType", reason, "createdAt"
FROM "AuditEvent"
WHERE "entityType" = 'OrchestratorTask'
ORDER BY "createdAt" DESC
LIMIT 20;
```

### 2. generateDraft → DraftStore transitions

1. After orchestra/start creates draft, the build_store job calls `generateDraft`.
2. Verify DraftStore transitions:
   - `generating` → `ready` (success)
   - or `generating` → `failed` (on error)
   - Expiry: `draft`/`generating` → `failed` (reason: EXPIRE)

**Query to inspect:**
```sql
SELECT id, "entityType", "entityId", action, "fromStatus", "toStatus", "actorType", reason, "correlationId", "createdAt"
FROM "AuditEvent"
WHERE "entityType" = 'DraftStore'
ORDER BY "createdAt" DESC
LIMIT 20;
```

### 3. French Baguette end-to-end flow

1. Create store via orchestra/start (French Baguette café).
2. Poll job until completed.
3. Add coffee product, create Smart Object promo via QR on cup, enable loyalty.
4. Publish draft.
5. Verify:
   - DraftStore: `ready` → `committed` (reason: PUBLISH)
   - Feed and store work unchanged

**Query for publish:**
```sql
SELECT * FROM "AuditEvent"
WHERE "entityType" = 'DraftStore' AND "toStatus" = 'committed' AND reason = 'PUBLISH'
ORDER BY "createdAt" DESC
LIMIT 5;
```

### 4. MI worker transitions (optional)

For MI goals (autofill_product_images, generate_tags, etc.):

1. Trigger job/run on a draft with generationRunId.
2. Verify `queued` → `running` → `completed`/`failed` transitions and AuditEvents.

## Quick Prisma Studio queries

```javascript
// AuditEvent by correlation (generationRunId)
prisma.auditEvent.findMany({
  where: { correlationId: '<your-generationRunId>' },
  orderBy: { createdAt: 'desc' }
});

// Recent DraftStore transitions
prisma.auditEvent.findMany({
  where: { entityType: 'DraftStore' },
  orderBy: { createdAt: 'desc' },
  take: 20
});

// Recent OrchestratorTask transitions
prisma.auditEvent.findMany({
  where: { entityType: 'OrchestratorTask' },
  orderBy: { createdAt: 'desc' },
  take: 20
});
```

## Expected Transition Reasons

| Entity           | Reason                  | From → To               |
|------------------|-------------------------|-------------------------|
| OrchestratorTask | BUILD_STORE_JOB         | queued→running, running→completed/failed |
| OrchestratorTask | DRAFT_CREATE_FAILED     | queued→failed           |
| OrchestratorTask | STALE_JOB_TIMEOUT       | running→failed          |
| OrchestratorTask | DRAFT_READY_SHORTCUT    | running/queued→completed |
| OrchestratorTask | MI_WORKER, JOB_RUN      | various                 |
| DraftStore       | GENERATE_DRAFT_START    | draft→generating        |
| DraftStore       | GENERATE_DRAFT_SUCCESS  | generating→ready        |
| DraftStore       | GENERATE_DRAFT_FAILED   | generating→failed       |
| DraftStore       | EXPIRE                  | draft/generating→failed |
| DraftStore       | PATCH_PREVIEW           | draft→ready             |
| DraftStore       | PUBLISH                 | ready→committed         |

## Acceptance Criteria (Quick Check)

- [ ] Prisma migration applies, app builds
- [ ] No behavior change besides AuditEvent rows
- [ ] No direct `prisma.draftStore.update` / `prisma.orchestratorTask.update` for status in: orchestraBuildStore.js, draftStoreService.js, miRoutes.js, publishDraftService.js
- [ ] `queued`→`running` remains atomic (updateMany)
- [ ] On transition failures (state mismatch), no crash; returns `{ ok: false }` gracefully
- [ ] French Baguette flow publishes and feed works unchanged
