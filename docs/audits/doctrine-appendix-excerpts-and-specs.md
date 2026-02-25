# Doctrine Audit Appendix: Option A (Excerpts) + Option B (Status Spec)

Use these excerpts for boundary-insertion planning and Transition Spec v1.

---

## Option A: File Excerpts for Boundary Insertion

### 1. miRoutes.js — orchestration handlers (L760–1038)

```javascript
// apps/core/cardbey-core/src/routes/miRoutes.js

// Job create
const job = await prisma.orchestratorTask.create({
  data: {
    tenantId: finalTenantId,
    userId: req.userId || finalTenantId,
    insightId: null,
    entryPoint: finalEntryPoint,
    status: 'queued',
    request: requestPayload,
  },
});

// Task update (generationRunId)
await prisma.orchestratorTask.update({
  where: { id: job.id },
  data: { request: { ...requestPayload, generationRunId: resolvedRunId }, updatedAt: new Date() },
}).catch(() => {});

// Draft create
const createdDraft = await prisma.draftStore.create({
  data: {
    expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
    mode: baseInput.mode,
    status: 'generating',
    generationRunId: resolvedRunId,
    input: baseInput,
    committedStoreId: finalStoreId || null,
  },
});

// On draft create failure
await prisma.orchestratorTask.update({
  where: { id: job.id },
  data: { status: 'failed', result: {...}, updatedAt: new Date() },
}).catch(() => {});

// Auto-run build_store
if (isBuildStore && needDraft && createdDraftId) {
  runBuildStoreJob(prisma, job.id, createdDraftId, resolvedRunId, traceId);
}
```

---

### 2. orchestraBuildStore.js — runBuildStoreJob (L19–204)

```javascript
// apps/core/cardbey-core/src/services/draftStore/orchestraBuildStore.js

export function runBuildStoreJob(prisma, jobId, draftId, generationRunId, traceId = newTraceId()) {
  setImmediate(async () => {
    const markFailed = async (errorCode, messageOrResult) => {
      await prisma.orchestratorTask.update({
        where: { id: jobId },
        data: { status: 'failed', result: {...}, updatedAt: new Date() },
      }).catch(() => {});
    };

    const task = await prisma.orchestratorTask.findUnique({ where: { id: jobId } });
    if (status === 'running' || status === 'completed') return; // idempotent skip

    // Atomic transition queued → running
    const { count } = await prisma.orchestratorTask.updateMany({
      where: { id: jobId, status: 'queued' },
      data: { status: 'running', updatedAt: new Date() },
    });
    if (count === 0) return;

    const draft = await prisma.draftStore.findUnique({ where: { id: draftId } });
    // ... status checks (ready, committed, failed)

    await generateDraft(draft.id, { userId: task.userId || null });

    await prisma.orchestratorTask.update({
      where: { id: jobId },
      data: { status: 'completed', result: { ok: true, generationRunId }, updatedAt: new Date() },
    }).catch(() => {});
  });
}
```

---

### 3. draftStoreService.js — status-changing functions

```javascript
// apps/core/cardbey-core/src/services/draftStore/draftStoreService.js

// generateDraft (L360–400): status → generating, failed (expiry)
await prisma.draftStore.update({
  where: { id: draftId },
  data: { status: 'generating' },
});
// or on expiry:
await prisma.draftStore.update({
  where: { id: draftId },
  data: { status: 'failed', error: 'Draft expired', errorCode: ..., recommendedAction: ... },
});

// patchDraftPreview (L1180–1187): status → ready when generating
await prisma.draftStore.update({
  where: { id: draftId },
  data: {
    preview: merged,
    status: draft.status === 'generating' ? draft.status : 'ready',
    updatedAt: new Date(),
  },
});

// commitDraft (L1257+): idempotent when status === 'committed'
if (draft.status === 'committed') { /* return existing */ }
```

---

### 4. Publish handler — stores.js + publishDraftService

```javascript
// apps/core/cardbey-core/src/routes/stores.js (L1239–1256)

router.post('/publish', requireAuth, async (req, res, next) => {
  const { storeId: rawStoreId, generationRunId } = req.body ?? {};
  const storeId = rawStoreId && typeof rawStoreId === 'string' ? rawStoreId : null;
  if (!storeId) return res.status(400).json({ ok: false, error: 'storeId_required', ... });

  const result = await publishDraft(prisma, {
    storeId,
    generationRunId: generationRunId || undefined,
    userId: req.userId,
  });

  return res.status(200).json({
    ok: true,
    publishedStoreId: result.storeId,
    publishedAt: publishedAt.toISOString(),
    storefrontUrl: result.storefrontUrl,
  });
});
```

```javascript
// apps/core/cardbey-core/src/services/draftStore/publishDraftService.js (L85+)

export async function publishDraft(prisma, { storeId, generationRunId, userId }) {
  if (!userId) throw PublishDraftError('AUTH_REQUIRED', ...);
  const draft = await findTargetDraft(prisma, storeId, generationRunId);
  if (!draft) throw PublishDraftError('DRAFT_NOT_FOUND', ...);
  // ownership check via isDraftOwnedByUser
  // ... parseDraftPreview, Business create/update, Product create
}
```

---

### 5. Frontend publish call — StoreDraftReview.tsx

```typescript
// apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/StoreDraftReview.tsx
// handlePublish → runWithOwnershipGate → runWithAuth → publishStore()

const result = await publishStore({
  storeId: effectiveStoreId,
  generationRunId: generationRunIdRef.current ?? undefined,
});
```

```typescript
// apps/dashboard/cardbey-marketing-dashboard/src/api/storeDraft.ts

export async function publishStore(request: PublishStoreRequest) {
  const res = await fetch(buildApiUrl(API.STORE_PUBLISH), {
    method: 'POST',
    headers: { ...buildAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      storeId: request.storeId,
      generationRunId: request.generationRunId ?? undefined,
    }),
    credentials: 'include',
  });
  // ...
}
```

---

## Option B: Canonical Status Enums

### DraftStore.status

**Schema** (`prisma/schema.prisma` L1297):

```prisma
status  String  @default("draft") // 'draft' | 'generating' | 'ready' | 'failed' | 'committed' | 'abandoned'
```

**Canonical values:**

| Value        | Meaning                                      | Set by                                  |
|--------------|----------------------------------------------|-----------------------------------------|
| `draft`      | Initial/editable state                       | Default                                 |
| `generating` | AI/template generation in progress           | miRoutes (create), generateDraft        |
| `ready`      | Generation complete; user can edit/publish   | patchDraftPreview, generateDraft success|
| `failed`     | Generation or expiry failed                  | generateDraft (error), getDraft (expiry)|
| `committed`  | Published to Business                        | commitDraft, publishDraft               |
| `abandoned`  | User abandoned; cannot commit                | (manual/legacy)                         |

---

### OrchestratorTask.status

**Schema** (`prisma/schema.prisma` L1078):

```prisma
status  String  // "queued" | "running" | "completed" | "failed"
```

**Canonical values:**

| Value       | Meaning                         | Set by                              |
|-------------|---------------------------------|-------------------------------------|
| `queued`    | Job created; not yet running    | miRoutes create                     |
| `running`   | Job executing                   | orchestraBuildStore (atomic updateMany) |
| `completed` | Job finished successfully       | orchestraBuildStore after generateDraft |
| `failed`    | Job failed                      | orchestraBuildStore (markFailed), miRoutes (draft create error) |

---

## Transition Spec v1 (Input for Kernel Contract)

**Allowed DraftStore transitions:**

- `draft` → `generating` (start generation)
- `generating` → `ready` (success)
- `generating` → `failed` (error or expiry)
- `ready` → `committed` (publish)
- `draft` → `ready` (template/seed without generation)
- (no reverse from `committed` or `failed`)

**Allowed OrchestratorTask transitions:**

- `queued` → `running` (atomic, updateMany)
- `running` → `completed`
- `running` → `failed`
- `queued` → `failed` (early abort, e.g. draft create error)

**Risk tier (placeholder):**

- Green: read-only, status checks
- Yellow: publish, commit
- Red: delete, abandon

**Reversibility:** `committed` and `failed` are terminal for DraftStore. `completed` and `failed` are terminal for OrchestratorTask.
