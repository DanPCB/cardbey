# Impact Report: Create-store-from-upload early MISSING_NAME

## Symptom

Ask → Create store returns HTTP 400 `validation_error` / `MISSING_NAME` even when the card shows a business name (e.g. PTH International Furniture). Frontend previously mislabelled this as a connection error (Part A, dashboard).

## Exact failure boundary

**Request serialization / payload-guard rewrite → early form validation** — before OCR / `buildCreateStoreDraftIntakeResponseFromUpload`.

`freshStoreMission: true` + Ask selection entered `normalizeFreshStoreCreationBody`, which forced:

- `source` / `intentSource` = `store_creation_draft`
- `_autoSubmit: true`
- empty `storeCreateForm`

Then `performerIntakeV2Routes` ~4292 / ~4920 ran `validateCreateStorePayload` and returned 400. Draft projection never ran.

Named stack (`BusinessCardUnderstandingProvider` / `VerifiedInputEnvelope` / `CreateStoreReadinessPolicy`) is **not on disk**; functional path is `cardExtraction` / `storeCandidate` → `buildCreateStoreDraftIntakeResponseFromUpload`.

## Smallest safe patch

1. Do not coerce create-store-from-upload into hollow draft confirmation.
2. Seed form fields from `intentSourceContext.cardExtraction` / `storeCandidate` when present.
3. Skip early full-form validation for upload turns so draft projection can run.
4. Dashboard: validation_error → store details checkpoint (Edit details / Cancel / FOCUS_*), never connection copy.

## What could break

- Genuine empty form confirm (`_autoSubmit` + completed draft) must still 400 on missing fields.
- Non-upload `freshStoreMission` draft submits unchanged.
