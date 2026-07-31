# Impact Report — Staging create-store skips name/type/location card

**Date:** 2026-07-31  
**Surface:** Performer Quick Create / Create store pill + card upload (staging)

## Root cause

1. **Hollow Create store invents `storeName: "New Store"`** in `intentReasoner._createStoreGoalFromFormSignals` when `action: create_store` / `primaryModeHint: store_creation` arrive with no form → `_autoSubmit: true` → mission completes as “Create store: New Store” and skips the input card.
2. **Upload Create store** puts `sourceType` / `clientRequestId` into tool `selectedParameters`; Core strict schema rejects them as `unknown_field`; `formatIntakeValidationClarifyMessage` phrases that as “I need source type and client request id…”.
3. **Scan card** grey is expected without `storeId` (product scan API) — not the create-from-card path.

## What could break

- Explicit `action: create_store` without a real name no longer auto-submits a placeholder store (desired).
- Upload transport metadata stripped / ignored — create_store from card must still carry image via body/intentSourceContext.
- Unknown-field clarify copy becomes generic need-more-detail (safer).

## Smallest safe patch

- Core: do not invent “New Store”; expand create_store metadata strip keys; skip `unknown_field` in clarify phrasing.
- Dashboard: keep `sourceType` / `clientRequestId` off tool params; drop fake “Reading business details…” chip copy.
