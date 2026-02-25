# P0: Fully automatic Menu Item Images (reuse Assets photo search) — Impact Report

## 1) Risk assessment + what NOT touched

**Store creation spine:** No changes. The following were **not** modified:
- POST /api/mi/orchestra/start  
- GET /api/stores/temp/draft  
- PATCH /api/draft-store/:draftId  
- POST /api/store/publish  
- GET /api/store/:id/preview  

**Scope:** Only dashboard image-autofill pipeline (Assets proxy, guards, assign flow) and one toast string. No core routes added; no Prisma or publish logic changed.

---

## 2) What was wrong + root cause

- **Wrong vertical images (shoes/office/person for desserts):** Food vertical guard was missing some negative terms (e.g. jeans, interior, business meeting), so a few wrong-vertical candidates could pass.
- **Provider response shape:** Autofill provider (proxyPhotos) only read `data.results`; core now returns `items` (and `results`). Normalizing to accept `items`/`results`/`photos` avoids empty results if core sends only `items`.
- **Candidate metadata for guards:** Provider did not pass through `tags` from the API, so guard checks that use candidate text (title/alt/tags) could not reject by tag (e.g. "shoes" in tags).
- **Fewer candidates per item:** Default provider limit was 10; increasing to 24 aligns with “request ~24 photos” and improves chance of a passing candidate.

---

## 3) File-by-file changes

| File | Change |
|------|--------|
| `apps/dashboard/.../src/lib/images/providers/proxyPhotos.ts` | Normalize response: use `data.results ?? data.items ?? data.photos`. Pass through `tags` and include in candidate `title` for guard. |
| `apps/dashboard/.../src/lib/images/guards.ts` | Food vertical: add negative terms `jeans`, `interior`, `business meeting`; keep existing terms (shoe, office, lamp, etc.). |
| `apps/dashboard/.../src/lib/images/assignImages.ts` | Default `providerLimit` 10 → 24. |
| `apps/dashboard/.../src/features/storeDraft/StoreDraftReview.tsx` | Toast when no images filled: "No missing images found." → "No suitable images found." |
| `apps/dashboard/.../tests/imageAutofillGuards.test.ts` | Add test: food vertical rejects candidate with person/jeans/interior (P0 hard reject). |

---

## 4) Tests + commands + results

**Run dashboard image autofill guards:**

```bash
cd apps/dashboard/cardbey-marketing-dashboard
npx vitest run tests/imageAutofillGuards.test.ts
```

**Expected:** All tests pass (including new “rejects person/jeans/interior for food vertical”).

**Run replace-bad-autofill test:**

```bash
npx vitest run tests/replaceBadAutofill.test.ts
```

**Expected:** Pass (manual images not overwritten; autofill-wrong replaced).

---

## 5) Manual verification checklist

- [ ] **Enable:** `localStorage.setItem('cardbey.imageAutofill','1');` (optional auto: `localStorage.setItem('cardbey.imageAutofill.auto','1');`)
- [ ] **Desserts store:** Create or open Desserts store → Draft Review → run “Auto-fill missing images” (or wait for autorun). Expect only desserts/food images; no shoes, office, person, jeans, interior.
- [ ] **Plumbing store:** Create or open Plumbing store → run autofill. Expect tools/plumbing images; no cakes/coffee.
- [ ] **Single PATCH:** In Network tab, run autofill once; expect one PATCH to `/api/draft-store/:draftId` (batched), then one refetch.
- [ ] **Manual override:** Set one product image manually → run autofill again. That product’s image must remain unchanged.

---

## 6) Rollback steps

- **proxyPhotos.ts:** Revert to reading only `data.results` and remove `tags` from mapped candidate.
- **guards.ts:** Revert food.negativeTerms to previous list (remove jeans, interior, business meeting).
- **assignImages.ts:** Set `providerLimit` back to 10.
- **StoreDraftReview.tsx:** Restore toast "No missing images found." for zero filled.
- **imageAutofillGuards.test.ts:** Remove the new “rejects person/jeans/interior” test.

No DB or API contract rollback needed.
