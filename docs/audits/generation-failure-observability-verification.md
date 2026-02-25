# Generation Failure Observability – Manual Verification Checklist

**Context:** MI orchestra jobs can end in `status=failed` and DraftStore with `status=failed`. This doc provides reproducible steps to verify error propagation and env validation.

## Prerequisites

- Backend on `http://127.0.0.1:3001`
- Frontend (Vite) on `:5174`
- Auth token for `/create` flow (guest or user)

## 1. Verify env presence log on startup

**Command:** Start the backend (e.g. `pnpm run dev` in `apps/core/cardbey-core`).

**Expected:** Console shows one-time log:
```json
[env] generation-critical (post-loadEnv): {"NODE_ENV":"development","dotenvLoaded":true,"OPENAI_API_KEY":"present","ANTHROPIC_API_KEY":"missing","GUEST_MAX_DRAFTS":"not set"}
```

- If `OPENAI_API_KEY` is `"missing"` and `.env` has it, `.env` may be loaded in wrong process or path.
- No secrets are logged; only `present`/`missing`/`set`/`not set`.

## 2. Verify MISSING_PROVIDER_KEY pre-validation (400 before job start)

**Setup:** Remove or unset `OPENAI_API_KEY` and restart backend. Ensure the request would use AI mode (e.g. form input with credits/bundle).

**Request:**
```bash
curl -X POST http://127.0.0.1:3001/api/mi/orchestra/start \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"goal":"build_store","rawInput":"French Baguette café","businessType":"cafe"}'
```

**Expected:** `400` with:
```json
{
  "ok": false,
  "error": "MISSING_PROVIDER_KEY",
  "errorCode": "MISSING_PROVIDER_KEY",
  "message": "AI provider is not configured. Set OPENAI_API_KEY in your environment.",
  "recommendedAction": "retry"
}
```

- No OrchestratorTask or DraftStore should be created.

## 3. Verify failed job returns error + errorCode (GET orchestra/job)

**Setup:** Let a job fail (e.g. wrong API key, or temporarily break a dependency). Obtain `jobId` from `POST /api/mi/orchestra/start` response.

**Request:**
```bash
curl "http://127.0.0.1:3001/api/mi/orchestra/job/<jobId>" -H "Authorization: Bearer <token>"
```

**Expected:** `200` with `status: "failed"` and top-level `error` and `errorCode`:
```json
{
  "ok": true,
  "jobId": "...",
  "status": "failed",
  "generationRunId": "...",
  "error": "AI provider is not configured...",
  "errorCode": "MISSING_PROVIDER_KEY",
  "result": { "ok": false, "errorCode": "MISSING_PROVIDER_KEY", ... },
  "updatedAt": "...",
  "meta": { "pollAfterMs": 1000 }
}
```

## 4. Verify failed draft returns error + errorCode (GET stores/temp/draft)

**Request:**
```bash
curl "http://127.0.0.1:3001/api/stores/temp/draft?generationRunId=<runId>" -H "Authorization: Bearer <token>"
```

**Expected:** `200` with `status: "failed"` and top-level `error`, `errorCode`:
```json
{
  "ok": true,
  "storeId": "temp",
  "generationRunId": "...",
  "status": "failed",
  "error": "AI provider is not configured...",
  "errorCode": "MISSING_PROVIDER_KEY",
  "recommendedAction": "retry",
  "draftId": "...",
  "draft": { "status": "failed", "error": "...", "errorCode": "MISSING_PROVIDER_KEY", ... },
  ...
}
```

## 5. Verify frontend shows real error (not generic "Something went wrong")

**Setup:** Trigger a failure (e.g. unset OPENAI_API_KEY, start AI generation).

**Expected:** UI shows:
- Title: "AI provider not configured" (for MISSING_PROVIDER_KEY) or specific title per errorCode
- Message: Backend-provided message (e.g. "AI provider is not configured. Set OPENAI_API_KEY in your environment.")
- When backend returns errorCode, message includes it: `... (MISSING_PROVIDER_KEY)` for support/debug

**Components updated:** StoreReviewPage, QuickStartProgress, MagicMomentOverlay, orchestraClient.

## 6. Verify successful flow (job completed, draft ready)

**Setup:** Set `OPENAI_API_KEY` in `.env`, restart backend.

**Steps:**
1. Open `/create` (QuickStart).
2. Enter business (e.g. "French Baguette café") and trigger generate.
3. Watch Network tab:
   - `POST /api/mi/orchestra/start` → `200` with `jobId`, `generationRunId`
   - `GET /api/mi/orchestra/job/<id>` → eventually `status: "completed"`
   - `GET /api/stores/temp/draft?generationRunId=...` → `status: "ready"`

**Expected:** Job status transitions `queued` → `running` → `completed`. Draft status becomes `ready`. No `status: "failed"` in either endpoint.

## Regression test (unit)

```bash
cd apps/core/cardbey-core && pnpm test mapErrorToDraftFailure
```

- `MISSING_PROVIDER_KEY` mapping is covered by new tests.
