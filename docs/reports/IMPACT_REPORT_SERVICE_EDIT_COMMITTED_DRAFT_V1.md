# Impact Report: Edit Service — “Failed to create an editable revision”

## Symptom

Website preview **Edit Service** Save shows:

> This store draft is already published. Failed to create an editable revision.

## Root cause

`POST /api/draft-store/create-from-store` uses `resolveDraftForStore()`, which:

1. Prefers any draft with `committedStoreId` including **`committed`** snapshots (newest by `updatedAt`).
2. Maps **`committed` → status `ready`**.

The create-from-store idempotent early-return then treats that committed snapshot as an editable draft and returns it. Dashboard `ensureDraftForStore` correctly rejects a committed id → the exact error above.

Catalog items that are preview-only (not live `Product` rows) cannot PATCH `/products/:id`, so Save depends on minting a new draft revision.

## What could break

| Risk | Why | Mitigation |
|------|-----|------------|
| Callers that assumed `resolved.status === 'ready'` for committed drafts | Status mapping change | Prefer checking `draft.status`; website-edit init already wants a new revision when only committed exists |
| Multiple editable drafts per store | create-from-store may mint when only committed exists (intended) | Still idempotent when a ready/draft/generating revision already exists |
| by-store returns committed when an editable also exists | Lookup order | Prefer editable statuses before falling back to committed |

## Impact scope

- Core: `resolveDraftForStore`, `POST create-from-store`, `ensureEditableRevisionForBusiness`
- Dashboard: no required change (already calls `ensureDraftForStore`); Service / Story / any create-from-store consumer benefits

## Smallest safe patch

1. Prefer editable drafts (`draft` / `generating` / `ready`) when resolving by store; fall back to committed only if none.
2. Do **not** map `committed` → `ready` in `resolveDraftForStore`.
3. create-from-store / ensureEditableRevision: gate reuse on **`draft.status`**, not the mapped `resolved.status`.
