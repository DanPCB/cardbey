# commitDraft / publishDraft — transaction lifecycle audit

## Confirmed root cause (runtime evidence)

**Error:** Prisma `P2028` — *Transaction already closed: timeout 60000 ms exceeded*

**Hot path:** `draftStoreService.js` → `commitDraft()` → `tx.product.create(...)` inside a single `prisma.$transaction` loop (formerly ~line 3247).

**Observed workload:** 280+ catalog rows, each with sequential `create` + category/image normalization + `deleteMany` + draft status transition in the **same** interactive transaction.

This is not a schema/migration issue. The interactive transaction lifetime exceeds Prisma’s configured cap (`PRISMA_TRANSACTION_TIMEOUT_MS`, default 60s via `getPrismaInteractiveTransactionOptions()`).

The canonical publish path (`publishDraftService.js`) had the **same anti-pattern** (sequential `tx.product.create` after `deleteMany` in one tx).

---

## Pre-refactor transaction map

| Step | Location | Inside interactive tx? | Cost driver |
|------|----------|------------------------|-------------|
| User create | `commitDraft` | Yes | bcrypt hash (~100ms) |
| Business create/update + slug | `commitDraft` / `publishDraft` | Yes | 2–4 queries |
| `product.deleteMany` | both | Yes | 1 query |
| Category map build | both | **No** (already outside) | O(categories) |
| Image/price normalization | both | **Was inside loop in tx** | O(n) CPU per item |
| `product.create` × n | both | **Yes — dominant** | O(n) round-trips |
| `loadExistingStylePreferences` | `publishDraft` | Was inside tx | 1 query |
| miniWebsite id remap | `publishDraft` | Was after creates (in tx) | O(sections) |
| `business.update` | `publishDraft` | Yes | 1 query |
| `transitionDraftStoreStatus` | both | Yes | 2–4 queries |
| `activityEvent.create` | `publishDraft` | Yes | 1 query |
| `syncPublishSnapshotFromPreview` | `patchDraftPreview` | **No** | separate path |
| `buildPersistAndApplyPublishedProjection` | `publishDraft` | **No** (post-tx) | OK |

**Worst case:** 280 × (~15–50ms SQLite write) + bcrypt + deletes ≈ **60s+** in one tx → P2028.

---

## Staged architecture (implemented)

### Phase A — outside any transaction

- `prepareCatalogProductRows()` in `stagedCatalogPublish.js`
- Normalize names, prices, categories (`buildCategoryIdToNameMap`, `resolveDraftProductCategoryName`, `resolveDraftItemImageUrl`)
- Pre-assign `cuid()` per row (deterministic miniWebsite remap without `create` return values)
- Log: `[COMMIT_DRAFT_STAGE] phase_a_prepare_catalog`
- Oversized preview warning when JSON > 500KB

### Phase B — short shell transaction (~seconds)

- User create (commitDraft only, when needed)
- Business create/update + slug uniqueness
- `product.deleteMany` for target store
- Log: `phase_b_catalog_shell` / `phase_b_publish_shell`
- Uses `getPrismaInteractiveTransactionOptions()` (60s cap) but expected duration **< 5s**

### Phase C — batched writes (independent short txs)

- `replaceStoreCatalogInBatches()` — chunks of **50** (override: `COMMIT_DRAFT_CATALOG_CHUNK_SIZE`)
- Each chunk: `prisma.$transaction` + `product.createMany({ skipDuplicates: true })`
- Batch tx timeout: **20s** (`getPrismaCatalogBatchTransactionOptions()`)
- Log per chunk: `catalog_batch_write` with `durationMs`, `transactionOpenMs`
- Slow chunk warning if `durationMs >= 3000`

### Phase D — finalize short transaction

- `transitionDraftStoreStatus` (commitDraft)
- `business.update` + draft commit + activity event (publishDraft)
- Log: `phase_d_finalize_draft` / `phase_d_finalize_publish`
- Post-tx unchanged: `syncPublishedStoreFromDraft`, publish projection, QR refresh

### Reconciliation on partial failure

| Failure point | Store state | Draft state | Recovery |
|---------------|-------------|-------------|----------|
| Phase B | No change or empty shell | `ready` | Retry commit/publish |
| Phase C mid-batch | Partial products | `ready` | `rollbackPartialCatalogWrites` → `deleteMany` products; retry |
| Phase D | Full catalog, not committed | `ready` | Rollback products; retry (idempotent if already committed returns early) |

Draft remains **`ready`** until Phase D succeeds — no new `committing` status required.

---

## Code paths split

| File | Function | Change |
|------|----------|--------|
| `stagedCatalogPublish.js` | **new** | Phase A/C helpers, instrumentation |
| `prismaTransactionOptions.js` | `getPrismaCatalogBatchTransactionOptions` | 20s batch txs |
| `draftStoreService.js` | `commitDraft` | 3-stage tx + batched catalog |
| `publishDraftService.js` | `publishDraft` | Same staging for catalog writes |

**Unchanged:** `patchDraftPreview`, `publishSnapshotService`, `buildPersistAndApplyPublishedProjection`, multi-store identity (`storeIdentity.js`).

---

## Batching strategy

- **Chunk size:** 50 products (env: `COMMIT_DRAFT_CATALOG_CHUNK_SIZE`)
- **Write pattern:** `createMany` with pre-generated `id`
- **520 products:** ~11 batch txs × ~20s max each vs 1 × 60s monolith
- **Write amplification logs:** `writeAmplification: { batches, insertOps }` on phase C

---

## Performance estimate

| Catalog size | Before (1 tx) | After (staged) |
|--------------|---------------|----------------|
| 50 items | ~3–8s, OK | ~2–4s (similar) |
| 280 items | **P2028 @ 60s** | ~15–25s total, **no single tx > 20s** |
| 520 items | fails | ~25–45s, bounded batches |

Dominant win: **eliminates P2028** and SQLite write-lock hold time per interactive tx.

---

## Tests

- `stagedCatalogPublish.test.js` — unit: prepare + chunk mocking
- `commitDraft.stagedCatalog.load.test.js` — 520 products (sqlite only, 120s timeout)
- `commitDraft.multiStore.test.js` — regression for Store A/B isolation

---

## Instrumentation example

```json
[COMMIT_DRAFT_STAGE] {"stage":"phase_a_prepare_catalog","itemCount":280,"durationMs":12,"transactionOpenMs":null,"draftId":"..."}
[COMMIT_DRAFT_STAGE] {"stage":"phase_b_catalog_shell","itemCount":280,"durationMs":890,"transactionOpenMs":885,"draftId":"..."}
[COMMIT_DRAFT_STAGE] {"stage":"catalog_batch_write","itemCount":50,"durationMs":420,"transactionOpenMs":418,"chunkIndex":0,"totalChunks":6}
[COMMIT_DRAFT_STAGE] {"stage":"phase_d_finalize_draft","itemCount":280,"durationMs":95,"transactionOpenMs":92,"draftId":"..."}
```

---

## Acceptance checklist

- [x] No giant interactive transaction for product loops
- [x] Shell + finalize txs bounded; batch txs 20s cap
- [x] Multi-store identity preserved (shell tx unchanged)
- [x] Publish snapshot / projection still post-commit
- [x] Partial failure rolls back products, draft stays `ready`
- [x] Did **not** increase global timeout as primary fix
- [x] Did **not** disable snapshot or integrity checks
