# Phase 1 Image Quality Fix — Risk Assessment (Step 0)

## What could break store creation flow?

1. **Draft PATCH / normalization**  
   If we changed the shape of `patchBody` or how `draftNormalize` merges `preview.items[].imageUrl`, draft save could fail or overwrite user data.  
   **Mitigation:** We do **not** change `patchBody` shape or `draftNormalize`. We only change how the *query* is built and how *candidates* are ranked before assignment. PATCH payload and merge logic stay the same.

2. **Overwriting existing images**  
   If assign logic set `imageUrl` for an item that already has one, we would overwrite user content.  
   **Mitigation:** Rule unchanged: "only fill missing images." We do not assign when `hasImage(product)` is true.

3. **Stable-key mapping**  
   If we switched to index-based mapping, refetch/merge could attach the wrong image to the wrong product.  
   **Mitigation:** We keep stable-key only (`getItemStableKey`, `assignedByKey`). No index-based joins.

4. **Orchestration / new endpoints / polling**  
   New endpoints or polling could affect the creation spine.  
   **Mitigation:** No new backend endpoints, no new polling, no changes to orchestration. All changes are in `src/lib/images/*` and tests/docs.

5. **Autofill trigger**  
   If autofill ran automatically or on a timer, it could surprise users or conflict with publish.  
   **Mitigation:** Autofill remains a **single user-triggered action** (button click). No change to when it runs.

## How we avoid breaking

- New code lives in `src/lib/images/` (guards.ts, query.ts, plus updates to ranking.ts and assignImages.ts).
- No backend schema or API changes.
- No change to `draftNormalize` overwrite rules.
- `assignImagesToDraft` continues to return the same contract; we add optional debug fields (`assignedFrom`, `assignedQuery`) in memory only, not persisted to the server.
- Tests are deterministic (mock provider, no live calls); existing tests remain passing.
