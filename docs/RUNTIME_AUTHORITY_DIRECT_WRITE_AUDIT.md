# Runtime Authority Direct Write Audit

**Date:** 2026-06-16  
**Scope:** Dashboard UI mutations that must not trigger `RUNTIME_AUTHORITY_BYPASS` in development.

## Authority models

| Model | Guard | Client path |
|-------|--------|-------------|
| **UI write authority** | `assertUiWriteAuthority` / `assertLegacyUploadAuthority` | `POST /api/performer/runtime/ui-action` or `x-cardbey-runtime-authority: 1` |
| **Hybrid confirmation** | `wrapHybridRoute` + `confirmed: true` body | `confirmedDelete()` or unified dispatch `http_delete` channel |
| **Storage-only** | Exempt | `POST /api/uploads/create` (no draft attach) |

## Audit results

### Publish (fixed prior + this pass)

| Operation | Status | Path |
|-----------|--------|------|
| Publish store (snapshot) | ✅ Fixed | `unifiedDispatch('publish_store')` → ui-action |
| Publish Cardbey (modal) | ✅ Fixed | `unifiedDispatch('publish_cardbey')` |
| Legacy `publishStore()` | ✅ Fixed | `unifiedDispatch('publish_store')` |

### Delete

| Operation | Status | Path |
|-----------|--------|------|
| Store delete | ✅ Fixed | `deleteViaDispatch('delete_store')` → hybrid `confirmedDelete` |
| Content / design delete | ✅ Fixed | `deleteViaDispatch('delete_content')` |
| Product delete (`api.deleteProduct`) | ✅ Fixed | `deleteViaDispatch('delete_product')` |
| Campaign delete | ⚠️ Hybrid | `api/campaigns.ts` — uses hybrid DELETE; confirm in UI |
| Suitcase / docs delete | ⚠️ Hybrid | `wrapHybridRoute` on backend; low traffic |
| Explore video delete | ✅ Fixed | Runtime authority header on DELETE |

### Upload

| Operation | Status | Path |
|-----------|--------|------|
| Hero media | ✅ Fixed | `/api/performer/runtime/ui-action/upload-hero` (legacy fallback removed) |
| Logo / avatar | ✅ Fixed | `uploadLogoThroughRuntime` / `businessProfileUpload.ts` |
| Explore video upload | ✅ Fixed | `/api/performer/runtime/ui-action/upload-explore-video` |
| Menu item image | ℹ️ Storage-only | `/api/uploads/create` — exempt |
| Product image (multipart) | ⚠️ Open | No dedicated runtime multipart route in active UI paths |
| Signage assets | ℹ️ Legacy | Signage module — separate governance |

### Draft save / patch

| Operation | Status | Path |
|-----------|--------|------|
| Draft preview save | ✅ Fixed | `patchDraftPreviewViaRuntime` / `save_draft_preview` ui-action |
| StoreDraftReview draft patches | ✅ Fixed | Migrated from `apiPATCH /api/draft-store/:id` |
| Onboarding autosave | ✅ Fixed | `patchDraftPreviewViaRuntime` |
| Hero PATCH (store draft) | ✅ Fixed | `patchHeroThroughRuntime` in StoreDraftReview |
| Publish snapshot PATCH | ℹ️ OK | `PATCH .../publish-snapshot` — not authority-guarded |
| WebsitePreviewPage draft GET/PATCH | ⚠️ Review | Some direct draft-store calls remain for read/sync |

### Remaining low-risk / out of scope

- **Admin / discovery** deletes — super-admin tooling
- **Auth profile** PATCH — user account, not store mutation
- **Contents studio** render — should use `renderCreativeAssetViaRuntime` where used
- **Agent chat** uploads — intake paths

## Files changed (this pass)

- `src/lib/runtime/deleteClient.ts` — shared delete dispatch helper
- `src/lib/intake/capabilitySelector.ts` — `delete_content`, `delete_product`
- `src/lib/intake/runtimeKernel.ts` — generic resource id for `http_delete`
- `src/lib/api.ts` — `deleteProduct` via dispatch
- `src/features/contents-studio/api/contents.ts` — `deleteDesign` via dispatch
- `src/features/business-builder/pages/OverviewPage.tsx` — store delete
- `src/components/account/AccountUserMenu.tsx` — store delete
- `src/lib/explore/exploreVideosApi.ts` — runtime upload + authority headers
- `src/lib/heroMediaUpload.ts` — removed legacy direct upload fallback
- `src/features/storeDraft/StoreDraftReview.tsx` — draft/hero runtime saves
- `src/features/business-builder/onboarding/steps/Step1BusinessBasics.tsx` — autosave
- `apps/core/.../runtimeActionTypes.js` — delete + save action registry

## Verification

```bash
cd apps/dashboard/cardbey-marketing-dashboard
npx vitest run src/lib/intake/unifiedDispatch.test.ts src/lib/runtime/deleteClient.test.ts src/lib/heroMediaUpload.test.ts
```

Manual: in dev, exercise store delete, design delete, hero upload, draft save, explore upload — Network tab should show ui-action or hybrid DELETE with `confirmed: true`, not bare guarded legacy URLs without authority.
