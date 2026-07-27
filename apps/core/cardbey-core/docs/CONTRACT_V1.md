# Contract V1 — NormalizedIntent + BuildStoreInput (Phase 0)

**Version:** 1.0 (documentation + golden fixtures only; implementation wiring is Phase 1+).  
**Scope:** Store / mini-website **creation** flow alignment (not entire Intake ontology).

---

## 1. NormalizedIntentV1

**Meaning:** Server-side or client-normalized intent **after** classification and optional validation, **before** policy and execution enqueue.

### Required shape (logical)

| Field | Type | Notes |
|-------|------|--------|
| `schemaVersion` | `1` | Literal for forward compatibility |
| `tool` | `string` | e.g. `create_store` |
| `parameters` | `object` | Tool-specific; see below |
| `intentText` | `string` | Original or normalized user text (for logging / rawUserText) |
| `originSurface` | `string` | e.g. `frontscreen`, `intake_rerun`, `mission_trigger`, `api` |

### `create_store` parameters (Intake registry alignment)

Aligned with `intakeToolRegistry` optional params:

- `storeName` — string | omitted  
- `location` — string | omitted  
- `storeType` — string | omitted  
- `intentMode` — `'store' \| 'website'`  
- `_autoSubmit` — boolean | omitted  

**Rule:** Execution layer MUST NOT require `storeName` as the only carrier of business name; **mapping** to `BuildStoreInputV1.businessName` happens at the **single execution door** (Phase 1).

---

## 2. BuildStoreInputV1

**Meaning:** Canonical payload that **job creation + draft seeding** should use so `runBuildStoreJob` sees consistent `draft.input` and `task.request`.

### Required shape (logical)

| Field | Type | Required | Notes |
|-------|------|----------|--------|
| `schemaVersion` | `1` | yes | Literal |
| `businessName` | `string` | yes* | *Non-empty for auto-run; clarify path may omit |
| `businessType` | `string` | no | Vertical / type; default e.g. `Other` |
| `storeType` | `string` | no | Often same as `businessType`; worker merges aliases |
| `location` | `string` | no | Structured location |
| `intentMode` | `'store' \| 'website'` | yes | Default `store` |
| `rawUserText` | `string` | no | Full user message; preferred over synthetic-only |
| `currencyCode` | `string` | no | ISO; infer if omitted |
| `preloadedCatalogItems` | `array` | no | Sanitized catalog seed |
| `websiteUrl` | `string` | no | URL-ingest flows |
| `sourceType` | `string` | no | `form`, `ocr`, `url`, `template`, … |

### Mapping from NormalizedIntentV1 (normative for Phase 1)

- `businessName` ← `parameters.storeName` (trimmed) or context fallback per product rules  
- `businessType` / `storeType` ← `parameters.storeType`  
- `location` ← `parameters.location`  
- `intentMode` ← `parameters.intentMode`  
- `rawUserText` ← `intentText` (or parallel channel text)

---

## 3. Golden tests

Fixtures live in `src/lib/contracts/__fixtures__/golden/`.  
Tests in `src/lib/contracts/__tests__/phase0Golden.contracts.test.js` assert:

1. Each fixture validates against the documented required keys.  
2. **Same logical user story** (e.g. “cafe in Melbourne”) yields **equivalent** `BuildStoreInputV1` after Phase 1 mappers (golden files document target now).

---

## 4. Trace ID (Phase 0.5 — implemented)

**Header:** `x-cardbey-trace-id` (see `src/lib/trace/cardbeyTraceId.js`). Clients may send a value; the server echoes one on responses.

**Surfaces:** Intake V2 + confirm; `POST /api/mi/orchestra/start`; `POST /api/missions/:id/run`; legacy performer intake (store path); store pipeline passes `cardbeyTraceId` on `OrchestratorTask.request`, `DraftStore.input`, `runBuildStoreJob` logs, and **`MissionPipeline.metadataJson.cardbeyTraceId`** when the mission transitions to executing via `executeStoreMissionPipelineRun`.
