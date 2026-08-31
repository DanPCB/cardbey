# Fix Report: Performer Fake Understanding Process (Scoped Delivery)

**Date:** 2026-07-28  
**Status:** Shipped to `main` (await Render rebuild / hard refresh for live cardbey.com)

| Layer | PR | Merge tip |
|-------|-----|-----------|
| Dashboard | [cardbey-marketing-dashboard#12](https://github.com/DanPCB/cardbey-marketing-dashboard/pull/12) | `25e58ca` |
| Monorepo | [cardbey#25](https://github.com/DanPCB/cardbey/pull/25) | `ba4f36d6f` |

Related prior work (same day): stale handoff clear (#10 / #23), mission detach on new upload (#11 / #24).

---

## 1. Problem (verified)

Performer **looked** like it understood uploaded images but often did not:

1. **Fake progress copy** — On Ask → Create store, the UI immediately showed  
   `Reading business details from your image…`  
   before any OCR/understanding completed. That string was a hardcoded thinking placeholder in `useIntakeV2.handleSelection`, not an OCR or BUE gate.

2. **Sticky identity** — After a Vietnamese Restaurant create-store runway, later uploads (CA Handyman, Coffee logo, PTH International Furniture) still continued as **Create store: VIETNAMESE RESTAURANT**. Chat showed the new image; mission / handoff / seed still used the prior business.

3. **Fragmented identity** — Create-store used mixed sources (`cardExtraction`, `storeCandidate`, mission metadata, session pending) with no image-binding guarantee that fields belonged to the **current** pixels.

Audit conclusion (same session): Create Store does **not** wait for a completed canonical business understanding; BUE defaults off; execution proceeds on Intake V2 + optional OCR.

---

## 2. Scope decision (what we did **not** build)

The master prompt requested a new `CanonicalBusinessUnderstanding` SOT, force-enable BUE, decision-loop authority, and hard-block until name+category+location ≥70%.

That was **rejected as verbatim implementation** because it conflicts with locked rules:

- Intent Runtime Foundation — wrap, don’t rewrite; no parallel stack beside Kernel / `StoreCandidate` / Mission Runtime  
- Automation by Default — incomplete drafts may go to a checkpoint, not a hard wall for every field  
- Invisible Assistance — ask last  

Pre-change impact report:  
`apps/core/cardbey-core/docs/IMPACT_REPORT_PERFORMER_FAKE_UNDERSTANDING_SCOPED.md`

---

## 3. What was fixed

### 3.1 Honest progress (no fake “Reading…”)

**Before:** Always show `Reading business details from your image…` when tapping upload-Ask Create store.

**After:** Progress text comes from `assessUploadCreateStoreIdentity()`:

| Kind | Meaning | Example copy |
|------|---------|----------------|
| `no_image` | Block POST | Need an uploaded image… |
| `stale` | Clear prior OCR; continue from this upload only | Prior business details were cleared… |
| `ready` | Handoff identity matches this image | Creating store from this upload (name “PTH …”). |
| `incomplete` | Image present, name not confirmed yet | Starting store setup from this upload… extract from **this** image… |

**File:** `apps/dashboard/.../useIntakeV2.ts` (`handleSelection`)  
**Helper:** `apps/dashboard/.../lib/performerIntake/imageBoundStoreIdentity.ts`

### 3.2 Image-bound identity gate

- Session key: `cardbey.performer.currentImageHash.v1`  
- Hash = existing `attachmentImageFingerprint` (length + head/tail slices)  
- Bound when pending image is set (`ConsoleCentreColumn`) and on intake send / create-store selection  
- If session hash ≠ handoff image hash → treat as **stale**, clear OCR/candidate/evidence identity on handoff, do **not** seed `storeCreateForm` from prior business  
- `storeCreateForm` seeded only when assessment `kind === 'ready'`

### 3.3 Mission detach (prior PRs, still required)

Already shipped earlier the same day:

- New upload / `(Image attached)` while create-store mission active → detach  
- `freshStoreMission` ends prior store mission UI  
- Asset-intent Create store no longer re-injects stale `cardExtraction` onto new pixels  

Without those, honest UI alone would still leave the old mission title in the chrome.

---

## 4. Files changed (this delivery)

| File | Change |
|------|--------|
| `src/lib/performerIntake/imageBoundStoreIdentity.ts` | **New** — assess / bind / clear stale helpers |
| `src/lib/performerIntake/imageBoundStoreIdentity.test.ts` | **New** — no_image / stale / ready cases |
| `src/app/console/performer/useIntakeV2.ts` | Honest progress; gate; seed only when ready; bind hash on send |
| `src/app/console/ConsoleCentreColumn.tsx` | Bind hash on `setPendingImage` |
| `docs/IMPACT_REPORT_PERFORMER_FAKE_UNDERSTANDING_SCOPED.md` | Scope / risk record |

No Core create-store authority rewrite in this PR. No `BUE_PIPELINE_ENABLED=true` forced in repo.

---

## 5. Tests

```text
npx vitest run src/lib/performerIntake/imageBoundStoreIdentity.test.ts
```

Covered:

- Block when no image  
- Stale when session hash ≠ handoff image (Vietnamese vs Handyman)  
- Ready progress names PTH; never contains “Reading business details”

Also retained prior handoff clear tests (`createStoreFromUploadTransport.test.ts`).

---

## 6. Expected production behaviour after deploy

1. Hard refresh cardbey.com (dashboard `25e58ca` live).  
2. **End mission** if an old create-store is still open.  
3. Upload a **new** card/logo → Ask → Create store:  
   - Must **not** show fake “Reading business details…”  
   - Must **not** seed create-store from a previous business when pixels changed  
   - Progress should name the business only when handoff OCR is bound to **this** image  

Server-side OCR / draft projection may still fill fields after POST; this slice fixes **client honesty + stale seed**, not a full BUE product.

---

## 7. Deferred (explicit)

| Item | Reason deferred |
|------|-----------------|
| New platform `CanonicalBusinessUnderstanding` Map as SOT | Parallel stack vs `StoreCandidate` |
| Force `BUE_PIPELINE_ENABLED` / brand vision on Render | Env/ops + wrap-don’t-rewrite |
| Decision-loop as create-store authority | Feature hard-disabled / deprecated path |
| Hard-block until name+category+location ≥70% | Breaks logo-only / incomplete cards; violates automation-by-default |
| Soft/strict phased feature flag product | Not required for this honesty/stale-seed fix |

---

## 8. Success criteria for this slice

| Criterion | Status |
|-----------|--------|
| Fake “Reading…” removed from create-store chip path | Done |
| Progress reflects image-bound assessment | Done |
| Stale handoff OCR not seeded into `storeCreateForm` | Done |
| Current image hash bound on upload/send | Done |
| Regression tests for assess helpers | Done |
| Merged to dashboard `main` + monorepo `main` | Done (`25e58ca` / `ba4f36d6f`) |
| Live cardbey.com verified post-Render | Operator smoke after deploy |

---

## 9. One-line summary

**Performer no longer pretends to “read” the image with a hardcoded line, and Create store from upload no longer seeds business fields from a previous image’s handoff; full BUE-as-SOT remains deferred under wrap-don’t-rewrite.**
