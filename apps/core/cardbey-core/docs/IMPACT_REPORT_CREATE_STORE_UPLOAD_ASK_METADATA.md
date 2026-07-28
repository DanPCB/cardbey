# Impact Report: Create-store Ask clarify “source type / client request id”

## Symptom (production)

After upload Ask → Create store, Core returns HTTP **200** `action:clarify`:

> I need source type and client request id to run that safely.

Options: Use Create Store / Use Scan Business Card / Use Store Performance Analytics.

Not a network outage. Not missing business name from the card.

## Exact failure boundary

**Strict `create_store` tool-parameter validation** after Ask chip selection.

1. Dashboard `chipBindingsFromOptions` / selection payload puts intake routing keys into `selectedParameters`:
   - `sourceType: 'business_card'`
   - `clientRequestId` (UUID)
   - plus often `evidenceId` / `attachmentId` / `contentHash` / `attachmentIds`
2. Core forces tool `create_store` with those parameters.
3. `normalizeCreateStoreToolParameters` strips some metadata (`source`, `intent`, `type`, …) but **not** `sourceType` / `clientRequestId`.
4. `validateToolParameters(..., { strictUnknownKeys: true })` → `unknown_field`.
5. `formatIntakeValidationClarifyMessage` formats unknown fields as “I need \<field\>…”.

Prior hollow-draft / early `MISSING_NAME` path masked this; after that fix, validation now runs and surfaces this clarify.

## Smallest safe patch

1. Extend `CREATE_STORE_INTAKE_METADATA_PARAM_KEYS` with upload-Ask spillover keys (`sourceType`, `clientRequestId`, evidence refs, etc.).
2. Skip `unknown_field` in `formatIntakeValidationClarifyMessage` so schema rejects never read as “I need X”.
3. Regression: normalize + validateIntakeClassification ok with upload-Ask parameter bag.

## What could break

- Genuine unknown **business** fields on create_store still fail validation (not in strip list).
- Other tools still strict-validate their own schemas.
- User-facing clarify for real missing required fields (e.g. storeId on store-bound tools) unchanged.
