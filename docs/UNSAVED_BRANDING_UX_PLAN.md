# Unsaved branding UX – Plan & implementation summary

## 1) PLAN (no code)

### Where state lives

- **Hero:** `heroOverride` and `optimisticHero` (useState in StoreDraftReview). Set when user picks hero from product/paste/upload/MI; cleared on refetch or on explicit Save.
- **Avatar:** `uploadedVisuals` (useState) and/or draft `preview.avatar` / `store.profileAvatarUrl`. Upload flow sets `uploadedVisuals.profileAvatarUrl`.
- **Dirty (catalog):** `useStoreDraftPatch` → `isDirty` (patch JSON !== lastSaved). Patch = products, categories, deletedProductIds; does **not** include hero/avatar.
- **Persisted branding:** What’s in `baseDraft` (from API). Display branding = what’s in `effectiveDraft` (merge of baseDraft + patch + heroOverride/uploadedVisuals in preview).

### How we mark dirty (branding)

- **hasUnsavedBranding:** `useMemo` comparing display vs persisted:
  - Persisted = `getResolvedStoreHeroUrl(baseDraft)`, `getResolvedStoreAvatarUrl(baseDraft, businessData)`.
  - Display = `getResolvedStoreHeroUrl(effectiveDraft)`, `getResolvedStoreAvatarUrl(effectiveDraft, businessData)`.
  - When `!readonly` and (displayHero !== persistedHero || displayAvatar !== persistedAvatar) → true.
- **Save draft button:** Enabled when `isDirty || hasDraftItems || hasUnsavedBranding` (so hero/avatar-only change enables Save).
- **Clear on save:** After successful PATCH in `handleSave`, call `setHeroOverride(null)`, `setOptimisticHero(null)`, `setUploadedVisuals(null)` so next render uses baseDraft (after onRefresh refetch) and badge clears.

### Where badge and guard live

- **Badge:** `StoreReviewHero` receives `hasUnsavedBranding`; renders “Unsaved changes” pill at top-right of hero banner (only when `hasUnsavedBranding` and not readonly).
- **View storefront guard:** In `handlePreviewStore` (same file): if `hasUnsavedBranding`, `await handleSave()`; if save returns false, return without navigating. Otherwise run existing navigate logic. Option 2 (auto-save then navigate); no dialog. `handleSave` returns `Promise<boolean>` (true on success, false on catch) so the guard can avoid navigating on save failure.

### Risks and mitigations

- **Risk:** Save could fail (network) → we still don’t navigate (handleSave throws, toast shown). User can click View storefront again after fixing.
- **Risk:** hasUnsavedBranding false-positive if baseDraft shape differs. Mitigation: use same resolvers (getResolvedStoreHeroUrl/AvatarUrl) for both sides; normalize empty vs null in comparison.
- **Risk:** Clearing heroOverride on save could flash old hero until onRefresh. Mitigation: onRefresh refetches baseDraft which will have the new hero; one frame of “saved” state before refetch is acceptable.

---

## 2) IMPLEMENTATION (files changed)

| File | Change |
|------|--------|
| **StoreDraftReview.tsx** | (1) Added `hasUnsavedBranding` useMemo (persisted from baseDraft, display from effectiveDraft; false when readonly). (2) Save button: `disabled={(!isDirty && !hasDraftItems && !hasUnsavedBranding) \|\| isSavingDraft}`; button uses violet style when `hasDraftItems \|\| hasUnsavedBranding`. (3) `handleSave`: returns `Promise<boolean>`; after successful `apiPATCH`, call `setHeroOverride(null)`, `setOptimisticHero(null)`, `setUploadedVisuals(null)` and return true; on catch return false. (4) `handlePreviewStore`: async; if `hasUnsavedBranding`, await `handleSave()` and if it returns false, return without navigating; else run existing navigate logic. (5) Pass `hasUnsavedBranding={hasUnsavedBranding}` to `StoreReviewHero`. |
| **StoreReviewHero.tsx** | Added prop `hasUnsavedBranding?: boolean`. When true, render “Unsaved changes” badge (amber pill) at top-right of hero banner. |

---

## 3) Manual test checklist

- [ ] **Change hero/avatar → Save draft activates + badge appears**  
  On draft review, open branding modal and upload a new hero or avatar. Confirm the “Save draft” button becomes enabled (if it was disabled) and an “Unsaved changes” badge appears on the hero section.

- [ ] **View storefront while unsaved → auto-save then navigate**  
  With unsaved hero/avatar, click “View storefront”. Confirm a save runs (e.g. “Draft saved” toast) then the app navigates to the public preview. Confirm the public page shows the new hero/avatar (no stale branding).

- [ ] **Save draft → badge disappears, public page matches**  
  With unsaved branding, click “Save draft”. Confirm the “Unsaved changes” badge disappears and the Save button becomes disabled (if no other changes). Open “View storefront” and confirm the public page shows the same hero/avatar as the review.

- [ ] **No regression when only catalog is dirty**  
  Change only a product (e.g. name). Confirm Save draft is enabled and there is no “Unsaved changes” badge (badge only for hero/avatar). Save and confirm behavior unchanged.

- [ ] **Publish-review (readonly)**  
  On publish-review, confirm there is no “Unsaved changes” badge and “View Public Storefront” navigates without triggering save.
