# AIDock Store-Specialist Wiring

## Summary

Store-specialist assistant mode is now activated on the **public store preview** by passing real store context into the shared AIDock component. The **frontscreen** continues to run in global mode (no store context). No UI or architecture changes beyond wiring context.

---

## Mount points updated

| Surface | Route / context | Store context passed | Mode when context present |
|--------|------------------|----------------------|----------------------------|
| **Frontscreen** | `/frontscreen` | None (pathname, feedMode, feedType only) | `global` |
| **Public store preview** | `/preview/store/:storeId` (and draft-backed preview) | `storeId`, `storeName`, `storeSlug` (when available), `businessType` | `store_specialist` |

---

## Source of store context per surface

### Frontscreen (`CardbeyFrontscreenTopNavPreview.jsx`)

- **Pathname:** `routerLocation.pathname`
- **feedMode / feedType:** local state (`mode`, `feedType`)
- **Store context:** Not passed; frontscreen remains global. Optional future: derive “current store” from reels (e.g. `onStoreInView`) and pass into AIDock.

### Public store preview (`StorePreviewPage.tsx`)

- **Pathname:** `location.pathname` (from top-level `useLocation()`)
- **storeId:** `paramStoreId` (from route `params.storeId` or derived from pathname)
- **storeName:** `storeData.name` ← `finalPreviewData.storeName`
- **storeSlug:** `storeContext?.storeSlug` when `useStoreContext` is used (non–view-public); otherwise `undefined`
- **businessType:** `storeData.type` ← `finalPreviewData.storeType` (normalized in assistant layer via `normalizeBusinessType`)

---

## Files changed

| File | Change |
|------|--------|
| `apps/dashboard/cardbey-marketing-dashboard/src/components/assistant/AIDock.jsx` | **New.** Shared AIDock component with `mountPoint`, dev logs (mount point, pageType, mode, storeName, businessType). |
| `apps/dashboard/cardbey-marketing-dashboard/src/pages/CardbeyFrontscreenTopNavPreview.jsx` | Removed in-file AIDock; import and use shared `AIDock` with `mountPoint="frontscreen"`. No store props. |
| `apps/dashboard/cardbey-marketing-dashboard/src/pages/public/StorePreviewPage.tsx` | Import `AIDock`; add `aiOpen` state; define `assistantOverlay` (FAB + AIDock) with store context; render `assistantOverlay` in all “ready” layout branches (mobile grid, desktop grid, list view, final StoreShellLayout). |

---

## Fallback and safety

- **Incomplete store context:** `assistantRouter.resolveAssistantMode()` requires at least one of `storeId`, `storeSlug`, or `storeName`. If all are missing, mode stays `global`. No change to this behavior.
- **Rendering:** If store context is missing on store preview (e.g. before data load), AIDock still receives `storeId`/`storeName`/`businessType` from `storeData`/`finalPreviewData` once `fetchStatus === 'ready'`; `storeSlug` may be `undefined` on public view.
- **Bubble open/close:** Unchanged; same open/close behavior and FAB trigger.

---

## Dev logs

When `import.meta.env.DEV` is true or `localStorage.getItem('cardbey_debug_frontscreen_mount') === '1'`, opening the assistant logs:

- `mountPoint`: `"frontscreen"` or `"store-preview"`
- `pageType`: e.g. `explore`, `store`
- `mode`: `global` or `store_specialist`
- `storeName`, `businessType`: when in store context

---

## Manual verification checklist

- [ ] **Assistant open/close** – Opens and closes correctly from FAB (💬) and close button on both frontscreen and store preview.
- [ ] **Frontscreen** – No store context; greeting and starters remain global (e.g. “Find products or services”, “What is trending?”).
- [ ] **Public store preview** – With store loaded, opening the assistant shows **store-specialist** welcome and business-type-specific starters where applicable.
- [ ] **Business-type starters** – For a store with type e.g. “cafe” or “clothing”, starters match `storeSpecialistConfig` for that type.
- [ ] **Missing context** – If store data is missing or incomplete, assistant falls back to global mode and does not break (no crash, no blank UI).
- [ ] **No regressions** – Public browsing, store/catalog rendering, dashboard, mission flows, onboarding, publishing, and promotion flows behave as before.
- [ ] **Store preview layouts** – Assistant FAB and AIDock appear and work in grid (mobile/desktop) and list views and in the final StoreShellLayout branch.
