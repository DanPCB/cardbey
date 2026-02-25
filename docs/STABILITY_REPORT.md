# Cardbey Stability Report

Repo-level status for Draft Review Editor and critical flows.

---

## PHASE 1: Reproduce failures with instrumentation

**Status:** Instrumentation added. E2E smoke tests for Draft Review Editor are in place.

### E2E smoke tests (Draft Review)

- **Location:** `apps/dashboard/cardbey-marketing-dashboard/tests/e2e/store-draft-review.spec.ts`
- **Run:** From dashboard: `pnpm run e2e -- tests/e2e/store-draft-review.spec.ts`  
  First-time: `pnpm exec playwright install` (in dashboard directory)

| Test | Purpose |
|------|--------|
| Navigates to draft review URL and page loads | Ensures `/app/store/temp/review?mode=draft` shows spinner, editor, or error (no blank page). |
| Draft-only route uses draft endpoint | Ensures no GET `/stores/temp` (published); only `/stores/temp/draft` is used when storeId=temp. |
| When editor visible, hero + categories present | When editor renders, hero area and categories panel (or "Uncategorized"/"No categories yet") are visible. |

### Baseline

- Run full E2E from dashboard: `pnpm run e2e`. Requires Playwright browsers installed and (for draft review) backend available for `/api/stores/temp/draft`; without backend, draft fetch may 404/502 and page shows error (expected).

### Related fixes (pre–PHASE 1)

- **Draft vs published mix:** `StoreReviewPage` uses draft-only path when `mode === 'draft' || currentStoreId === 'temp'` (see `docs/DRAFT_VS_PUBLISHED_MIX_REPORT.md`).
- **Hero/avatar/categories:** Normalization, canonical `draftMedia.ts`, backend merge in `patchDraftPreview` (see `docs/DRAFT_REVIEW_HERO_AVATAR_FIX_REPORT.md`, `docs/DRAFT_REVIEW_REGRESSION_REPORT.md`).
- **Auth:** Anonymous can load `GET /api/stores/temp/draft` (optionalAuth); mutate actions trigger auth modal (see `docs/AUTH_IMPACT_REPORT.md`).

---

## Workflow under test (must pass E2E)

- **A)** Store creation → draft at `/app/store/temp/review?mode=draft&jobId=...`
- **B)** Draft Review Editor: hero, avatar, categories panel (or "Uncategorized (N)")
- **C)** Auto-categorize end-to-end and persist
- **D)** Auth: logged-out view temp draft read-only; mutate → auth modal, return after login
- **E)** Smart Promo: creation opens creative shell; save/deploy works

---

## Next (PHASE 2+)

- Contract layer: Zod schemas for `DraftReviewPayload`, `PromoPayload`
- Expand E2E to cover auth gating (D) and Smart Promo (E)
- CI: wire `test:e2e` (or dashboard `e2e`) into `.github/workflows`
