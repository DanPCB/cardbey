# Impact: Upload Ask vs Intent Engine image carrier

## Symptom (live 2026-09-01)

HP SERVICES card attached in Performer → response **“How can I help you today?”** with
Run next step / Add special requirements / What can you do?  
(Not upload Ask: Create store / Import catalog / Analyze document.)

## Exact loss boundary

1. Dashboard Ask POSTs pixels as **top-level `imageDataUrl`** (not `attachments[]`).
2. `hasIntakeImageAttachment()` only inspected `attachments[]` → **false**.
3. With `INTENT_ENGINE_PRIMARY=true`, Intent Engine classified `(Image attached)` as
   generic **question** → “How can I help you today?”
4. Upload Ask panel never won when pixels were missing or the carrier was ignored.

This is **not** a STRICT threshold issue and not OCR identity alone — the turn never entered upload Ask.

## What could break

- Hero / attachment helpers that assumed `hasIntakeImageAttachment` meant “attachments array only”
  — now also true for top-level `imageDataUrl` (correct for Intent Engine gates).
- Intent Engine no longer greets for attachment placeholders; upload Ask / recovery clarify runs.

## Smallest safe patch

1. Expand `hasIntakeImageAttachment` to accept top-level / context `imageDataUrl`.
2. Skip casual shortcircuit + Intent Engine primary for attachment placeholders and
   `resolveIntakeHasAttachment`.
3. IntentClassifier: attachment placeholders → clarify (upload), not generic help.
4. `maybeRespondUploadAskBeforeClassifier`: placeholder without pixels → recovery clarify.
5. Dashboard: refuse `(Image attached)` POST when no `data:` pixels after resolve.

## Not changed

- STRICT 70% threshold
- No pixel-only STRICT bypass
- No invented business identity
