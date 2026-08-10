# Impact Report: Live Create-Store from Uploaded Business Card

**Date:** 2026-08-04  
**Status:** FIX IMPLEMENTED (awaiting live acceptance)  
**Scope:** Performer create-store from prior-turn business-card upload

---

## Exact root cause

After the user uploads a card, the client auto-sends `(Image attached)`. Intake returns `action: 'chat'` (Upload Ask / acknowledgment).

In `useIntakeV2`, the `chat` branch **unconditionally called `clearPerformerAttachmentHandoff()`**, wiping:

- `imageDataUrl` (pixels)
- `cardExtraction` (client OCR)
- `evidenceId` / `attachmentId`
- `storeCandidate` / `documentExtraction`

The image still appeared in the mission conversation UI (message history), but the **canonical handoff** used for turn-2 create-store was empty.

When the user then typed `Create a store from uploaded card`:

1. Composer divert → `startCreateStore` → `beginNewStoreCreation`
2. No pixels / no cardExtraction in handoff → hollow `Create a store for my business`
3. Checkpoint → `needs_form` (missing `businessName`) → blank Store name / Location / Category form

**Classification:** card was OCR’d (client) and briefly persisted, then **cleared on Ask chat**, so the later text turn could not resolve it → `CONVERSATION_ATTACHMENT_CONTEXT_MISSING` / hollow create.

Conversation Spine is **not** cut over for attachments in this monorepo; the split was **legacy handoff cleared by chat**, not Spine vs mission-chat dual stores.

---

## Frontend attachment path

| Step | Component | Behavior (before → after) |
|------|-----------|---------------------------|
| Upload | `ConsoleCentreColumn` + client OCR | Sets handoff (`imageDataUrl`, `cardExtraction`) |
| Auto-send | `(Image attached)` → Intake V2 | Ask / chat response |
| Chat handler | `useIntakeV2` `case 'chat'` | **Cleared handoff → now preserves unconsumed upload** |
| Turn-2 text | divert / `beginNewStoreCreation` / `sendGoal` | Hollow create → **resolver + handoff promote** |
| Template gate | pending create-store | Stashed without image → **includes handoff pixels + cardExtraction** |

Canonical resolver (client): `resolveCreateStoreAttachmentContext` in `performerAttachmentHandoff.ts`.

Precedence: current message → conversation-recent handoff → mission artifact → none.

Consumed only after `store_mission_started` / campaign confirm (or replace upload).

---

## Backend intake path

`POST /api/performer/intake/v2`

→ intent / create_store  
→ `isExplicitCreateStoreFromUploadContext`  
→ **`resolveCreateStoreAttachmentContext`** (session workflow + ISC)  
→ `resolveCreateStoreUploadImageRef`  
→ `buildCreateStoreDraftIntakeResponseFromUpload` / BusinessCardUnderstanding / preflight  
→ checkpoint (`needs_form` only when name genuinely missing)

Diagnostics:

- `performer.create_store_card_context_resolved`
- `performer.create_store_card_context_failed` (+ stable codes)

`needs_form` body may include `fallbackReason: CREATE_STORE_PREFLIGHT_MISSING_FIELDS`.

---

## Conversation / mission identity

- Same `conversationSessionId` / asset session key used for workflow stash.
- Stage E Conversation Spine: attachments remain outside Spine cutover; no second attachment store added.
- Fix restores continuity via **unconsumed handoff + session workflow hydration**.

---

## OCR / card extraction

- Client OCR still runs on pending image; results written to handoff before Ask.
- After fix, Ask chat no longer drops those fields.
- Server may still OCR when pixels are re-sent (`preferPixels` create-store-from-upload).

---

## Preflight input (before → after)

**Before (broken turn-2):** no attachments, no `cardExtraction`, hollow greenfield → blank form.

**After:** ISC includes `CREATE_STORE_FROM_UPLOAD` + `cardExtraction` and/or re-sent `imageDataUrl`; known name/phone preserved; only missing fields requested via draft missingFields.

---

## Manual-form fallback cause

| Code | Meaning |
|------|---------|
| `CARD_ATTACHMENT_NOT_RESOLVED` | No current/recent/mission attachment |
| `CARD_OCR_PENDING` | Media present, identity not ready |
| `CARD_EXTRACTION_EMPTY` | Attachment without usable facts |
| `CARD_CANDIDATE_DROPPED` | Consumed / stale |
| `CREATE_STORE_PREFLIGHT_MISSING_FIELDS` | Upload path but name still missing |
| `CONVERSATION_ATTACHMENT_CONTEXT_MISSING` | Hollow beginNewStoreCreation |

---

## Files changed

**Dashboard**

- `src/app/console/performer/performerAttachmentHandoff.ts` — resolver, consume flag, diagnostics
- `src/app/console/performer/useIntakeV2.ts` — preserve handoff on chat; wire resolver on create-store send
- `src/app/console/performer/usePerformerConsole.ts` — `beginNewStoreCreation` uses resolver
- `src/app/console/ConsoleCentreColumn.tsx` — template pending + divert pass handoff image; OCR copy
- `src/lib/performerIntake/createStoreFromUploadTransport.test.ts` — continuity tests

**Core**

- `src/lib/intake/resolveCreateStoreAttachmentContext.js` — server resolver + events
- `src/lib/intake/__tests__/resolveCreateStoreAttachmentContext.test.js`
- `src/routes/performerIntakeV2Routes.js` — hydrate before upload create-store
- `src/lib/intake/createStoreCheckpointDispatch.js` — `fallbackReason` on needs_form

---

## Conversation Spine integration

No Spine cutover for attachments in-repo. When unified-assistant Spine is enabled later, hydrator must call the same resolver precedence and forward into Intake V2 — **no parallel OCR subsystem**.

Flag-off / legacy path: preserve-handoff + resolver are additive; hollow greenfield create-store unchanged when no upload context.

---

## Tests and results

- FE: handoff preserved after chat; previous-turn resolve; same-turn precedence; consumed isolation; partial extraction.
- BE: current message; session workflow; ISC-only identity; none → `CARD_ATTACHMENT_NOT_RESOLVED`.

Run results (2026-08-04):

- Dashboard: `createStoreFromUploadTransport.test.ts` — **9/9 passed**
- Core: `resolveCreateStoreAttachmentContext.test.js` + `createStoreCheckpointDispatch.test.js` — **24/24 passed**

---

## Production flag behavior

- No new feature flag required for the handoff-preserve fix (regression repair).
- Existing create-store / template-library / prefer-pixels paths unchanged when no card handoff exists.

---

## Deployment and rollback

1. Deploy **dashboard** first (or with core): stops clearing handoff on Ask chat.
2. Deploy **core**: server resolver + diagnostics.
3. Rollback: revert the listed commits; worst case returns to blank-form regression.

---

## Live acceptance evidence (required)

1. Upload business card → appears in conversation.
2. Confirm handoff remains after Ask (`sessionStorage` key `cardbey.performer.attachmentHandoff.v1` still has `cardExtraction` / image).
3. Send `Create a store from uploaded card`.
4. Expect: card resolved automatically; OCR reused or re-run; facts in preflight; **do not** re-ask known name; research/store build when ready.
5. Logs: `performer.create_store_card_context_resolved` with `attachmentSource` ≠ `none`.

**Not sufficient:** blank Store name / Location / Category form alone.

---

## What could break / impact scope / smallest safe patch

| Risk | Why | Scope | Mitigation |
|------|-----|-------|------------|
| Stale card reused on unrelated chat | Handoff no longer cleared on every chat | Performer chat after upload | Clear only when unconsumed empty; consume on store/campaign start; casual omit still clears; new image invalidates prior OCR |
| Larger create-store payloads | Prefer re-send pixels | Multi-instance OCR | Already required for Render; quota drop still uses refs + cardExtraction |
| Template pending behavior | Pending now carries handoff image | Template Library gate | Same create-store resume; no auto-submit |

**Smallest safe patch (applied):** stop clearing unconsumed upload handoff on `action:chat` + canonical resolver + diagnostics. No form-UI-first rewrite; no parallel OCR pipeline.
