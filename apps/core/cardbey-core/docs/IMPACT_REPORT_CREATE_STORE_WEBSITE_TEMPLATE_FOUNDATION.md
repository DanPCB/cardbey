# Impact report: create-store post-review failure (`websiteTemplateFoundation`)

## Observed

After “Store input reviewed”, Performer create-store failed with safe customer copy *“We couldn't finish preparing your store draft.”* (Inspector truncates to “We couldn't finis…”).

Root cause: `draftStoreService.js` dynamically imports `./websiteTemplateFoundation.js` in `finalizeDraft` / legacy finalize / `patchDraftPreview`, but that file was never committed (only referenced since `d93166976`). Plain Node throws `ERR_MODULE_NOT_FOUND` → `STORE_BUILD_RUNTIME_DEPENDENCY_MISSING`.

## What could break

| Risk | Why | Scope |
|------|-----|--------|
| Create-store still fails if foundation load/Prisma errors | Template resolve hits DB when `websiteTemplateId` set | Template-selected create-store only |
| Adaptive preview theme/order change when foundation present | `mergeWebsiteIntoPreview` now applies foundation | Template gallery Phase 2 path |
| Static import of foundation from sections generator | Pulls prisma into website merge module graph | Draft preview generation |

## Smallest safe patch

1. Restore `websiteTemplateFoundation.js` (+ unit tests) — Adaptive (no `websiteTemplateId`) is a no-op passthrough.
2. Wire foundation into `mergeWebsiteIntoPreview` (theme + section order when foundation set).
3. Fail-open try/catch around hard finalize imports so Adaptive continues if foundation resolution throws.
4. Add foundation/sections modules to `smoke-create-store-runtime-graph.mjs`.

## Not in this patch

- Enabling `PERFORMER_STAGE_SOURCED_CATALOG_PENDING_REVIEW`
- Dashboard UI truncation of Inspector summary
