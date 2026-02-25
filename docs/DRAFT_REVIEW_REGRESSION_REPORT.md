# Draft Review Editor Regression Report

**Goal:** Identify why hero/avatar/categories disappeared after 2026-02-02 17:10:41 (working screenshot) and provide minimal fix.

---

## Step A — Confirm we're looking at the same data

### Endpoint

- **Dashboard calls:** `apiGET(\`/stores/${currentStoreId}/draft${generationRunIdParam}\`)`  
  → Proxied to **GET /api/stores/temp/draft?generationRunId=...**
- **Old URL (working screenshot):** `jobId=cml4rtnoy002djv6oall` — use the same `jobId` and resolve `generationRunId` from job or query.

### Capture steps

1. Open **Draft Review:**  
   `http://localhost:5174/app/store/temp/review?mode=draft&jobId=cml4rtnoy002djv6oall`  
   (add `&generationRunId=...` if you have it).
2. Open **DevTools → Network → XHR/Fetch**.
3. Reload; find the request to **`draft`** (query `generationRunId=...`).
4. Open the response, **Copy** the JSON.
5. Save as **`tmp/draft_before.json`** (current run) for inspection.

### Expected response fields (for hero/avatar/categories)

| Field | Purpose |
|-------|--------|
| `draft.preview` | Object or **JSON string**. Must contain `hero.imageUrl`, `avatar.imageUrl` or `brand.logoUrl`, `categories` (or nested in `preview`). |
| `products` | Array (from `preview.items` on backend). |
| `categories` | Array (from `preview.categories` on backend). |

Backend (apps/core/cardbey-core/src/routes/stores.js) returns the full `draft` row; it does **not** strip `preview` for auth. Hero/avatar live inside `draft.preview` (or stringified `draft.preview`).

---

## Step B — Git forensic (since 2026-02-02 17:10:41)

**This repo has no `.git`** — `git rev-parse --is-inside-work-tree` fails. If you have history elsewhere (e.g. another clone), run:

```bash
git log --since="2026-02-02 17:10:41" --name-only --pretty=oneline
```

Then filter to files related to draft review + hero/avatar + categories + auth:

- `apps/dashboard/**/StoreReviewPage*`
- `apps/dashboard/**/StoreDraftReview*`
- `apps/dashboard/**/StoreReviewHero*`
- `apps/dashboard/**/CategoryIndex*`
- `apps/dashboard/**/draftNormalize*`
- `apps/dashboard/**/resolveImageUrl*`
- `apps/dashboard/**/useAuth*`
- `apps/core/**/routes/stores*`
- `apps/core/**/routes/mi*`

For each commit touching these, run:

```bash
git show <sha> -- <file>
```

---

## Step C — Failure mode (which is true?)

| # | Hypothesis | Check | Result |
|---|------------|--------|--------|
| **1** | Backend stopped returning hero/avatar/categories (field removed/renamed or optionalAuth strips it) | Core API GET `/:storeId/draft` returns full `draft` row; uses `requireAuth`, does not strip `preview`. | **No** — backend returns full draft. |
| **2** | Backend returns them, frontend normalization drops them (preview string not parsed, empty object → undefined, later refetch overwrites state) | draftNormalize parses `draft.preview` when string; treats empty `{}` as undefined; StoreReviewPage uses functional `setDraft` to keep `prev.preview`. | **Fixed** — normalization and state merge already addressed. |
| **3** | Data present and kept, but rendering condition hides UI (early return, wrong route, CategoryIndex returns null) | Error branch only when `!draft`; CategoryIndex has no `return null`; hero banner always rendered (fallback gradient). | **Fixed** — branch logic and CategoryIndex/hero rendering fixed. |
| **4** | URL built wrong (relative /uploads or query params stripped) | resolveImageUrl keeps absolute URLs and query params; prefixes relative with `/`. | **No** — resolver is correct. |

**Conclusion:** The regression was most likely **(2) + (3)**: normalization/state overwrite plus rendering conditions. Current codebase already includes fixes for (2) and (3). If the issue persists, the next check is **(1)** with your actual payload: save `tmp/draft_before.json` and confirm `draft.preview` (or parsed preview) contains `hero`, `avatar`/`brand`, and `categories`.

---

## Step D — Output

### Symptom → Root cause → Fix (short table)

| Symptom | Root cause | Fix |
|--------|------------|-----|
| Hero/avatar show placeholders | `draft.preview` dropped (string not parsed, or empty `{}` overwrote state, or refetch replaced state without merging) | **Done:** draftNormalize parses string `preview`; empty object → undefined; StoreReviewPage `setDraft(prev => ({ ...storeDraft, preview: incomingPreview ?? prev?.preview }))`. |
| Categories panel disappears | CategoryIndex returned `null` when `categories.length === 0` | **Done:** CategoryIndex always renders; when no categories but products exist, show "Uncategorized (N)" via `totalProductCount`. |
| Error UI instead of editor | Error branch ran when `error` was set even when `draft` existed | **Done:** Error UI only when `!draft` (branch === 'error'); when draft exists, always render editor. |
| Hero banner missing | Hero area only rendered when `heroImageUrl \|\| heroVideoUrl` | **Done:** Hero banner always rendered; fallback gradient when no URL. |

### Minimal code state (no refactor; keep changes minimal)

Already applied in this codebase:

1. **StoreReviewPage.tsx**  
   - Use `getStoreReviewPageBranch()`; show error UI only when `branch === 'error'` (i.e. `!draft`).  
   - Merge preview in `setDraft`: `preview: incomingPreview ?? prev?.preview`.

2. **draftNormalize.ts**  
   - Parse `draft.preview` when it is a string; treat empty object as undefined so `incomingPreview` does not overwrite good state with `{}`.

3. **CategoryIndex.tsx**  
   - No early `return null`.  
   - Accept `totalProductCount`; when `categories.length === 0` and `totalProductCount > 0`, show "Uncategorized (N)".

4. **StoreReviewHero.tsx**  
   - Hero banner always present; when no hero URL, show fallback gradient.

5. **resolveImageUrl.ts**  
   - Keep absolute URLs and query params; prefix relative paths with `/`.

No further revert or refactor is required for the above. If you still see missing hero/avatar after saving `tmp/draft_before.json`, compare that file to `tmp/draft_before_schema.json` and confirm the API actually returns `draft.preview` with `hero` / `avatar` / `brand` and `categories`.

### How to verify (3–5 steps)

1. **Draft Review loads**  
   Open `/app/store/temp/review?mode=draft&jobId=<jobId>` (e.g. `cml4rtnoy002djv6oall` if still valid). Page shows editor (store name, "Edit names, categories", product count), not "Failed to load store" or infinite spinner.

2. **Hero**  
   If the draft has a hero URL: hero image appears. If not: hero area shows fallback gradient and "AI Suggestion: Upload a hero image." No blank collapse.

3. **Avatar**  
   If the draft has avatar/logo URL: avatar tile shows image. If not: placeholder icon with pencil. No blank collapse.

4. **Categories panel**  
   Left sidebar (desktop) or Categories strip (mobile) is always visible. With products but no categories: shows "Uncategorized (N)". With no products: shows "No categories yet."

5. **Network**  
   In DevTools → Network, the request to `.../draft?generationRunId=...` returns 200. Response body has `draft.preview` (object or string) and `products` / `categories`. Save as `tmp/draft_before.json` if debugging.

---

**No refactor. No route renames. Changes are minimal and safe.**
