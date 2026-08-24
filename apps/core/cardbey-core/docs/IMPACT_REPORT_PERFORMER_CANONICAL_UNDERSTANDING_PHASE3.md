# Impact Report: Performer Canonical Understanding Phase 3

**Date:** 2026-07-28  
**Status:** Implementation  
**Branch:** `fix/canonical-understanding-create-store`  
**Depends on:** Phase 1–2

---

## 1. Goal

Real **UI progress states** for create-store understanding (not fake “Reading…”), show **confidence / missing fields / validation errors**, and a **Retry understanding** action — all inside the Performer agent stream (no new mandatory screen).

---

## 2. What could break

| Risk | Why | Impact |
|------|-----|--------|
| New `FormCard` variant unhandled | Renderer miss → blank UI | Upload Ask → Create store blocked path |
| Retry re-runs extract-card | Extra API / OCR cost | User taps Retry |
| Progress patches fight other patchMessage | Race on same thinkingId | Brief wrong subtitle |
| Chip “Retry understanding” collisions | Label used elsewhere | Wrong tool dispatch |

---

## 3. Smallest safe patch

1. Add `FormCard` type `create_store_understanding` + `UnderstandingStatusCard` (inline).  
2. `UnderstandingPipeline` helpers: build card payload, `retryCreateStoreUnderstanding` (re-extract-card → rematch SOT).  
3. `prepareUploadCreateStoreUnderstanding({ onProgress })` emits hashing → ocr → bue → validation.  
4. `useIntakeV2` shows/updates the card during prepare; on block shows errors + Retry chip (`__client_retry_understanding__`).  
5. Render card in `ConsoleCentreColumn` agent bubble.  
6. Unit tests for card builders + retry merge.

**Not in Phase 3:** Quality dashboard, server audit API, full E2E matrix, deleting env flags.

---

## 4. No-parallel-stack / agent-first proof

| Concern | Proof |
|---------|--------|
| New wizard screen? | No — stream `formCard` only |
| Second understanding engine? | Reuses Phase 1–2 SOT + extract-card |
| Automation by Default | Ready path still auto-proceeds; Retry only when blocked/incomplete |

---

## 5. Success checks

- [ ] Progress never shows fake “Reading business details from your image…”  
- [ ] Blocked card lists confidence, missing fields, errors  
- [ ] Retry re-binds image hash and refreshes CanonicalUnderstanding  
- [ ] Existing ready create-store path unchanged when validation passes  
