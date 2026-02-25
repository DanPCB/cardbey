# Phase 0 image assignment – verification checklist

After deploying the image↔item mismatch guards (generateImageForDraftItem, Pexels confidence, mismatch rules, QA issues):

## 1. Create draft with images

- Create a new draft (quick start or full AI flow) with **images enabled**.
- Wait until draft is **ready**.
- **Check:** Preview items have `imageUrl` and, when filled by the new path, also `imageSource`, `imageQuery`, `imageConfidence`.

## 2. Autofill images (MI worker)

- Open a draft that has **items without images** (or create one, then trigger autofill).
- Trigger **autofill product images** (or let the MI orchestrator run it).
- **Check:** Items that get an image have `imageUrl`, `imageSource` (`pexels` or `openai`), `imageQuery`, `imageConfidence`.
- **Check:** No workflow errors; task completes with summary like "Filled N images".

## 3. Duplicates drop

- Create or use a draft with many similar items (e.g. same category).
- Run image autofill.
- Open **Store review** or draft preview and note **QA report**.
- **Check:** If the same image URL was assigned to more than 2 items, `qaReport.issues` includes a **Duplicate image used for >2 items** line and `issueCodes` includes `DUPLICATE_IMAGE`.
- **Check:** Over multiple runs, duplicate assignments are reduced (usedUrls dedup in assignment).

## 4. Drink items not showing bread

- Create a draft with items whose **names** include drink terms: e.g. "Iced Coffee", "Orange Juice", "Sparkling Water", "Lemonade".
- Run image autofill (or create draft with images).
- **Check:** Assigned images do not show bread/buns/pastry/steak/salad (mismatch rules reject those Pexels candidates for drink-named items).
- Optionally set `DEBUG_IMAGE_ASSIGNMENT=1` and inspect logs for confidence and rejected candidates.

## 5. Bread/salad not showing drinks

- Draft with items like "Garlic Bread", "Toast", "Caesar Salad".
- **Check:** Assigned images do not show coffee/tea/drinks for bread items, or cake/pastry/dessert for salad.

## 6. Low confidence in QA

- Ensure some items have `imageConfidence < 0.6` (e.g. after a run where Pexels had no good match and OpenAI was used, or confidence was low).
- **Check:** `qaReport.issues` includes **Low confidence image (items: …)** and `issueCodes` includes `LOW_IMAGE_CONFIDENCE`.

## 7. Backward compatibility

- **Check:** Any caller that still uses `generateImageUrlForDraftItem` (e.g. hero generation, menuRoutes) still receives a string URL and does not break.
- **Check:** PATCH draft preview with only `imageUrl`/`imageSource` (or with `imageQuery`/`imageConfidence`) still merges correctly and does not clear existing fields.

## Debug

- Set `DEBUG_IMAGE_ASSIGNMENT=1` (or `true`) to enable console logs in `generateImageForDraftItem` (per-candidate confidence and alt snippet).
