# Hero/Avatar Restore Report (last known working before 2026-02-02 17:10:41)

## 1) Git log

**Not run.** The workspace at `C:\Projects\cardbey` has no `.git` directory (`git status` returns "fatal: not a git repository"). Commits since 2026-02-02 17:10:41 could not be listed. To do the intended analysis, run from a clone that has git history:

```bash
git log --since="2026-02-02 17:10:41" --name-only
```

---

## 2) Files that affect hero/avatar (for manual git/diff review)

If you have git elsewhere, focus diffs in these areas:

| Area | Files |
|------|--------|
| StoreDraftReview | `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/StoreDraftReview.tsx` |
| Header hero / StoreReviewHero | `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/review/StoreReviewHero.tsx` |
| Draft fetching / preview merge | `apps/dashboard/cardbey-marketing-dashboard/src/pages/store/StoreReviewPage.tsx` |
| Draft normalization | `apps/dashboard/cardbey-marketing-dashboard/src/lib/draftNormalize.ts` |
| URL resolution | `apps/dashboard/cardbey-marketing-dashboard/src/lib/resolveImageUrl.ts` |
| Core GET draft | `apps/core/cardbey-core/src/routes/stores.js` (GET `/:storeId/draft`) |
| Core draft service | `apps/core/cardbey-core/src/services/draftStore/draftStoreService.js` (`getDraft`, `patchDraftPreview`) |

Also relevant: ProductEditDrawer (if it shows hero), useAuth/canEdit (only if edit gating hides hero/avatar).

---

## 3) What to look for in diffs (no redesign)

- **Renamed fields:** `heroImageUrl` / `avatarImageUrl` moved or renamed so the UI no longer reads them (e.g. from `preview.hero.imageUrl` vs `preview.heroImageUrl`).
- **Preview merge removed:** Replacing functional `setDraft(prev => ({ ...storeDraft, preview: incoming ?? prev?.preview }))` with a direct set that drops `preview` when the response has none.
- **Draft data source switched:** Reading hero/avatar from published store or a different object instead of `draft.preview`.
- **URL building for /uploads:** Changes to how relative `/uploads/` or `uploads/` URLs are built (missing leading slash, wrong base, or stripping query params).

---

## 4) Minimal change applied (without git history)

Because git was unavailable, no commit was reverted. One **defensive fix** was applied so preview (and thus hero/avatar) is not dropped when the API sends it in a different shape:

**File:** `apps/dashboard/cardbey-marketing-dashboard/src/lib/draftNormalize.ts`

**Change:** If `response.draft.preview` is a **JSON string** (e.g. from DB or serialization), it is now parsed before we check for non-empty object. Previously we only treated `preview` as an object; a string failed the `typeof === 'object'` check and we set `incomingPreview = undefined`, so hero/avatar disappeared.

**Snippet added:**

- Read `draftObj.preview` (or equivalent).
- If `typeof incomingPreviewRaw === 'string'`, run `JSON.parse(incomingPreviewRaw)` and use the result; on parse error, keep undefined.
- Then keep the existing logic: treat empty object as undefined, otherwise set `result.preview = incomingPreview`.

This is the smallest change that restores correct behavior when preview is returned as a string while keeping all existing behavior for object preview and sticky preview in `StoreReviewPage`.

---

## 5) Short report summary

| Item | Result |
|------|--------|
| **Git log** | Not run (no .git in workspace). |
| **Which change broke it** | Not identified from history. Likely causes: (1) `draft.preview` sent as string and dropped by normalizer, or (2) a later response/refetch overwriting preview. |
| **Why it broke** | If the API or serialization returns `draft.preview` as a string, the normalizer treated it as invalid and set `incomingPreview = undefined`, so hero/avatar URLs were never set. |
| **What was reverted / fixed** | No revert (no git). **Fix applied:** In `draftNormalize.ts`, parse `draft.preview` when it is a string so hero/avatar are preserved. Sticky preview in `StoreReviewPage` and resolver in `resolveImageUrl.ts` were left unchanged. |

**Next step:** If hero/avatar are still broken after this, run `git log --since="2026-02-02 17:10:41" --name-only` from a repo with history and apply the checklist in section 3 to the files in section 2; revert only the smallest snippet that removed preview merge, renamed hero/avatar fields, or changed URL building.
