# Business Builder JSON Enforcement

## Overview

Enforces strict JSON-only responses for Business Builder AI calls (`mode: "business_builder_v1"`). The system now guarantees that Business Builder requests return valid JSON that can be reliably parsed and applied as patches.

## Changes Made

### File: `apps/core/cardbey-core/src/routes/assistant.js`

1. **Updated System Prompt** (`buildBusinessBuilderSystemPrompt`)
   - Enforces minified JSON-only responses
   - Removes markdown, code fences, and extra text
   - Requires exact response structure: `{ ok, patch, meta }`
   - Uses `context.field` as the patch key

2. **Strict JSON Parsing** (lines 701-845)
   - Validates `context.field` is present (returns `missing_field` error if not)
   - Removes markdown code fences before parsing
   - Validates required fields (`ok`, `patch`, `meta`)
   - Enforces patch key matches `requestField`
   - Returns proper error JSON on parse failures

3. **Error Response Format**
   - All errors now use: `{ ok: false, error: "...", meta: { mode, task, field } }`
   - `raw` field truncated to max 2000 chars (dev-only)
   - Consistent error structure across all failure paths

4. **Enhanced Logging**
   - Logs `requiresJson: true` for Business Builder requests
   - Logs parsed JSON keys (`ok`, `patch` keys, `meta`) in debug mode
   - Logs field validation and patch key corrections

## Request Format

```json
{
  "message": "Help me write a business description",
  "mode": "business_builder_v1",
  "task": "fill_business_basics",
  "context": {
    "field": "businessDescription"
  },
  "schema": {
    "businessDescription": "Business Description"
  }
}
```

## Response Format

### Success Response

```json
{
  "ok": true,
  "patch": {
    "businessDescription": "A cozy neighborhood cafe serving artisanal coffee and fresh pastries."
  },
  "meta": {
    "mode": "business_builder_v1",
    "task": "fill_business_basics",
    "field": "businessDescription"
  }
}
```

### Error Responses

#### Missing Field
```json
{
  "ok": false,
  "error": "missing_field",
  "meta": {
    "mode": "business_builder_v1",
    "task": "fill_business_basics",
    "field": null
  }
}
```

#### Invalid JSON from Model
```json
{
  "ok": false,
  "error": "model_invalid_json",
  "meta": {
    "mode": "business_builder_v1",
    "task": "fill_business_basics",
    "field": "businessDescription"
  },
  "raw": "truncated raw response (max 2000 chars)"
}
```

#### AI Service Error
```json
{
  "ok": false,
  "error": "ai_service_error",
  "meta": {
    "mode": "business_builder_v1",
    "task": "fill_business_basics",
    "field": "businessDescription"
  },
  "raw": "error details (dev-only, max 2000 chars)"
}
```

#### AI Not Configured
```json
{
  "ok": false,
  "error": "ai_not_configured",
  "meta": {
    "mode": "business_builder_v1",
    "task": "fill_business_basics",
    "field": "businessDescription"
  }
}
```

## Testing

### cURL Example

```bash
curl -X POST http://localhost:3001/api/assistant/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "message": "Help me write a business description for a coffee shop",
    "mode": "business_builder_v1",
    "task": "fill_business_basics",
    "context": {
      "field": "businessDescription"
    },
    "schema": {
      "businessDescription": "Business Description"
    }
  }'
```

### Expected Response

```json
{
  "ok": true,
  "patch": {
    "businessDescription": "A cozy neighborhood cafe serving artisanal coffee and fresh pastries."
  },
  "meta": {
    "mode": "business_builder_v1",
    "task": "fill_business_basics",
    "field": "businessDescription"
  }
}
```

## Validation Rules

1. **Field Required**: `context.field` must be present, otherwise returns `missing_field` error
2. **Patch Key Match**: Patch object key must match `context.field` (auto-corrected if mismatch)
3. **JSON Only**: Response must be valid JSON (no markdown, no code fences)
4. **Meta Required**: `meta` object must contain `mode`, `task`, and `field`
5. **Error Truncation**: `raw` field in errors truncated to max 2000 chars

## Behavior

- **Business Builder Mode Only**: Strict JSON enforcement only applies when `mode === "business_builder_v1"` or detected via `detectBusinessBuilder()`
- **Other Modes Unaffected**: Regular chat, guest flows, and other assistant modes continue to work as before
- **Retry Logic**: On JSON parse failure, retries with stricter prompt (max 2 attempts)
- **Fallback**: If all retries fail, returns `model_invalid_json` error with truncated raw response

## Logging

Server logs include:
- `[Assistant] Business Builder request detected:` with `requiresJson: true`
- `[Assistant] Business Builder JSON parsed successfully:` with patch keys and meta
- `[Assistant] JSON parse error:` with error details and truncated raw response

