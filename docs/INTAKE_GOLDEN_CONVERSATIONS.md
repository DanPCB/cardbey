# Golden Conversation Spec — Intake Decision Loop

**Version:** Phase 0  
**Test file:** `apps/core/cardbey-core/src/lib/decision/__tests__/goldenConversations.test.js`

Each scenario defines expected outcomes per turn. Phase 1 tests assert **belief**; Phase 3+ asserts full **TurnResult**.

---

## Scenario 1 — Image only (upload ask)

| Turn | Input | Expected `nextStep` | Expected belief |
|------|-------|---------------------|-----------------|
| 1 | Image + `(image attached)` | `present_options` | `lastUpload` set, `pendingClarify.type = upload_goal` |

**Must NOT:** `create_store`, `_autoSubmit`, `_classificationOverride`

---

## Scenario 2 — Image + explicit create from upload

| Turn | Input | Expected |
|------|-------|----------|
| 1 | Image + "create store from this card" | `execute` → store draft with OCR prefill |

---

## Scenario 3 — Turn1 upload, Turn2 "create store" (no re-attach)

| Turn | Input | Expected |
|------|-------|----------|
| 1 | Image + placeholder | `present_options`, belief has OCR |
| 2 | "create store" + session id only | `execute`, draft name from belief OCR |

**Phase 1 gate:** Turn 2 `loadBelief` must retain `lastUpload` without client image.

---

## Scenario 4 — Turn1 upload, Turn2 "yes"

| Turn | Input | Expected |
|------|-------|----------|
| 1 | Image + placeholder | `pendingClarify` set |
| 2 | "yes" | Resolve pending → top option executed |

---

## Scenario 5 — Chip click Create store

| Turn | Input | Expected |
|------|-------|----------|
| 1 | Image + placeholder | options include create_store |
| 2 | `intakeV2Selection` create_store | `execute`, no re-ask |

---

## Scenario 6 — Guest + business card

| Turn | Input | Expected |
|------|-------|----------|
| 1–2 | Upload + create store | Draft OK |
| publish | | `guide_auth` checkpoint |

---

## Scenario 7 — Campaign without store

| Turn | Input | Expected |
|------|-------|----------|
| 1 | "launch a campaign" | `select_store_first` or clarify store |

---

## Scenario 8 — Active mission refinement

| Turn | Input | Expected |
|------|-------|----------|
| 1 | (mission active) "make it shorter" | `continue_workflow` |

---

## Scenario 9 — Mission pivot

| Turn | Input | Expected |
|------|-------|----------|
| 1 | (campaign mission) "build my store" | `create_store` wins over resume |

---

## Scenario 10 — Image + vague creation language

| Turn | Input | Expected |
|------|-------|----------|
| 1 | Image + "help me grow my business" | `present_options`, NOT campaign autoSubmit |

---

## Scenario 11 — OCR empty image

| Turn | Input | Expected |
|------|-------|----------|
| 1 | Blank/unreadable image | clarify / describe prompt |

---

## Scenario 12 — Refresh mid-clarify

| Turn | Input | Expected |
|------|-------|----------|
| 1 | Upload ask | pendingClarify persisted server-side |
| 2 | (new session, same user) | belief restores pending or graceful re-ask |

---

## Scenario 13 — Vietnamese store request

| Turn | Input | Expected |
|------|-------|----------|
| 1 | "tạo cửa hàng" | `create_store` intent |

---

## Scenario 14 — Concurrent tabs

Document: last-write-wins on belief delta (explicit in tests).

---

## Scenario 15 — Governance campaign checkpoint

| Turn | Input | Expected |
|------|-------|----------|
| 1 | "launch campaign" + store | `checkpoint`, `_autoSubmit: false` |

---

## Assertion shape (Phase 3+)

```javascript
expect(turnResult.nextStep).toBe('present_options');
expect(turnResult.chosen.intent).toBe('analyze_asset');
expect(turnResult.governance.confirmationState).toBe('not_required');
expect(turnResult.rationale).toMatch(/business/i);
expect(turnResult.trace).toBeDefined();
expect(classification._classificationOverride).toBeUndefined();
```
