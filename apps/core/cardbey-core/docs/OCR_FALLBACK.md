# OCR Fallback (Agent Chat)

Agent Chat attachment OCR uses a **primary + fallback** pipeline. Store-creation OCR is unchanged and does not use this pipeline.

## Flow

1. **Primary:** OpenAI Vision (business-card strict prompt) via `ocrProvider.js` → `runOcr(..., { task: 'business_card' })`.
2. **Invalid/refusal detection:** If the primary result is refusal text (e.g. "I can't assist") or invalid for business cards (too short, no digits/email/URL), the pipeline tries the fallback when enabled.
3. **Fallback:** Google Cloud Vision DOCUMENT_TEXT_DETECTION (non-LLM), only when configured and when primary was refusal/invalid.

## Enabling fallback

Set in `.env`:

- `GOOGLE_CLOUD_VISION_ENABLED=true` (or `1`)
- `GOOGLE_CLOUD_VISION_API_KEY=<your-api-key>`

Alternatively, for service-account auth (not used by the current REST implementation):

- `GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json`

The current implementation uses the **REST API with API key** only. To get an API key:

1. Open [Google Cloud Console](https://console.cloud.google.com/).
2. Enable the **Cloud Vision API** for your project.
3. Create an API key (Credentials → Create credentials → API key) and restrict it to the Vision API if desired.

## Required env vars (fallback)

| Variable | Required for fallback | Description |
|----------|------------------------|-------------|
| `GOOGLE_CLOUD_VISION_ENABLED` | Yes | `true` or `1` to enable fallback |
| `GOOGLE_CLOUD_VISION_API_KEY` | Yes | API key for Vision REST API |

## Safety and limits

- **No raw OCR text in production logs:** Only `providerUsed` and `didFallback` are logged in dev; raw extracted text is never logged.
- **Image size:** Images larger than 5 MB (decoded) are rejected by the fallback; the attachment route rejects payloads larger than 8 MB (data URL length).
- **Timeout:** Each OCR call (primary and fallback) has a 20s timeout; on timeout the pipeline fails gracefully and the user sees "OCR failed. Please confirm key details in chat."

## Where it runs

- **Agent Chat only:** POST `/api/agent-chat/attachments/ocr` and the in-process OCR agent run (when a user attaches an image to a mission).
- **Store creation:** Unchanged; continues to use `performMenuOcr` → `runOcr(imageUrl)` with no fallback.

## Troubleshooting

- **Fallback never runs:** Ensure `GOOGLE_CLOUD_VISION_ENABLED=true` and `GOOGLE_CLOUD_VISION_API_KEY` is set. Fallback runs only when the primary returns refusal or invalid text (e.g. empty, or no contact-like content).
- **Google Vision API error 403:** Enable the Cloud Vision API in your GCP project and check the API key.
- **Google Vision API error 400:** Image may be too large or invalid format; ensure JPEG/PNG and under 5 MB.
- **OCR timeout:** Image or network may be slow; the 20s timeout will surface as a generic OCR failure.

## Research result payload

When OCR succeeds (primary or fallback), the research_result message includes:

- `payload.meta.providerUsed`: `"openai_vision"` or `"google_vision"`
- `payload.details.rawText`: truncated raw text (for Details collapsible)
- `payload.extractedEntities`: parsed business card entities
- `Mission.context.businessProfile`: merged for the planner
