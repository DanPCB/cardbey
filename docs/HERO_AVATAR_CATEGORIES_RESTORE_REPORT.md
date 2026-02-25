# Hero/Avatar + Categories Panel Restore Report

**Goal:** Restore Draft Store Review (`/app/store/temp/review?mode=draft&jobId=...`) to the state that worked on Mon 2 Feb 2026 ~2:56–5:10 PM: hero background image + avatar tile + Categories panel visible.

---

## 1) Git confirmation

- **`git rev-parse --is-inside-work-tree`** — Not run: workspace at `C:\Projects\cardbey` has **no `.git`** (`git status` → "fatal: not a git repository").
- **`git log --since="2026-02-02 14:50"`** — Could not run; no history available.

**If you have a clone with git:** Run from repo root:
```bash
git rev-parse --is-inside-work-tree
git status
git log --since="2026-02-02 14:50" --name-only --pretty=oneline
```
Then focus changes under: `apps/dashboard/**/storeDraft/**`, `StoreDraftReview*`, `StoreReview*`, `draftNormalize*`, `resolveImageUrl*`, `StoreReviewPage*`, and Core `stores.js`, `draftStoreService.js`.

---

## 2) Code archaeology (rg) – suspect conditions

Search patterns used: `StoreDraftReview|draftNormalize|resolveImageUrl|hero|avatar|Categories|CategoryIndex`.

### Suspect files and conditions that can hide hero/avatar/categories

| File | Line / condition | Effect |
|------|------------------|--------|
| **draftNormalize.ts** | `incomingPreviewRaw && typeof incomingPreviewRaw === 'object'` | If `response.draft.preview` is a **string** (e.g. DB/serialization), it was treated as invalid and `incomingPreview` set to `undefined` → hero/avatar lost. |
| **StoreReviewPage.tsx** | `setDraft(prev => ({ ...storeDraft, preview: mergedPreview }))` with `mergedPreview = incomingPreview ?? prev?.preview` | If a later response has no preview and we didn’t merge with `prev`, we’d overwrite and drop hero/avatar. (Current code merges; no bug.) |
| **StoreReviewHero.tsx** | `{(heroImageUrl \|\| heroVideoUrl) && (...)}` | Hero block only renders when at least one URL is set. If both are null (e.g. preview dropped), hero disappears. |
| **CategoryIndex.tsx** | `if (categories.length === 0) return null;` | Categories **list** is hidden when `categoryIndex` is empty. Panel header and “+ Add Category” still render; only the list vanishes. |
| **StoreDraftReview.tsx** | `<aside className="hidden lg:block ...">` | Categories **sidebar** is hidden on viewports &lt; `lg`. On small screens the panel “disappears” by design. |

### No evidence found of

- Auth/canEdit hiding hero or categories (hero and categories render for guests; edit actions open auth modal).
- Draft data source switched to published-only (draft mode still uses GET draft and `baseDraft`).
- Renamed fields (resolver still reads `preview.hero.imageUrl`, `preview.heroImageUrl`, `preview.avatar.*`, etc.).

---

## 3) Why hero/avatar/categories vanish

1. **Hero/avatar**
   - **Cause:** `draft.preview` was dropped when the API (or serialization) returned it as a **JSON string**. The normalizer only accepted objects, so `incomingPreview` became `undefined` and preview (and thus hero/avatar URLs) was lost.
   - **Secondary:** Any code path that sets `draft.preview = undefined` without using `prev?.preview` in a functional update would also clear hero/avatar. Current StoreReviewPage uses sticky merge; no such path found.

2. **Categories panel**
   - **List empty:** `categoryIndex` comes from `intentModel.categoryIndexByIntent[activeIntent]`. If the active intent has no categories (e.g. “Eat” with only “Uncategorized” in “Buy”), the list is empty and `CategoryIndex` returns `null` (list disappears; header and “+ Add Category” stay).
   - **Sidebar hidden:** On viewports below `lg`, the Categories sidebar is `hidden lg:block`, so the whole panel is not shown. This is layout, not a regression.

---

## 4) Smallest patch applied (no redesign)

### A) Hero/avatar – already applied

**File:** `apps/dashboard/cardbey-marketing-dashboard/src/lib/draftNormalize.ts`

**Change:** If `response.draft.preview` is a **string**, parse it with `JSON.parse` before treating as preview object. On parse error, keep `incomingPreview` undefined. Otherwise keep existing logic (empty object → undefined, else set `result.preview = incomingPreview`).

**Why it restores:** When the API or DB returns `draft.preview` as a string, we no longer drop it, so hero/avatar URLs from preview are preserved and the hero block and avatar tile can render again.

### B) Categories – no code change

- Categories **list** is driven by `intentModel.categoryIndexByIntent[activeIntent]`. With products and at least “Uncategorized” (or any category), the model populates the index; when it’s empty for the active intent, the list correctly shows nothing.
- **Sidebar** visibility is intentional (`hidden lg:block`). Restoring “like Feb 2” does not require changing this.

If in your environment the Categories **list** is empty even when you have products and expect “Uncategorized”, the next place to check is that the draft response includes `categories` (and that they’re mapped into `catalog.categories`) and that `activeIntent` is the one that has entries (e.g. “All” or “Buy” for Uncategorized).

---

## 5) Deliverables summary

| Deliverable | Result |
|-------------|--------|
| **List of suspect commits** | None (no git). |
| **Suspect files** | `draftNormalize.ts` (preview string handling), `StoreReviewPage.tsx` (preview merge – verified correct), `StoreReviewHero.tsx` (hero only when URL set), `CategoryIndex.tsx` (returns null when no categories), `StoreDraftReview.tsx` (aside `hidden lg:block`). |
| **Exact conditions that hide hero/categories** | (1) Preview dropped when string → hero/avatar gone. (2) `categoryIndex.length === 0` → list hidden. (3) Viewport &lt; lg → sidebar hidden. |
| **Smallest patch to restore** | **Done:** Parse `draft.preview` when it is a string in `draftNormalize.ts`. No redesign; no other changes. |

---

## 6) Acceptance

- **Draft review** (`/app/store/temp/review?mode=draft&jobId=...`) should again show:
  - **Hero** background image when the draft has a hero URL (from preview or store).
  - **Avatar** tile when the draft has an avatar/logo URL (from preview or store).
  - **Categories panel** (on lg+): header, “+ Add Category”, and list (e.g. Uncategorized, or intent-specific categories) when the intent model has entries for the active intent.

If hero/avatar still disappear after this patch, the next step is to run the git commands above in a repo with history and revert only the smallest snippet that removed preview merge, renamed hero/avatar fields, or changed URL building.
