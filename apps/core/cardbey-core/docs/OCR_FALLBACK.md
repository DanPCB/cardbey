# OCR Fallback (Vision Provider Fallback V1)

Business-card and Agent Chat attachment OCR use a **sequential, config-aware**
provider chain. Store Creation Entry UX V2 is unchanged; this extends the
canonical extract-card path only.

## Flow

1. **OpenAI Vision** (when `OPENAI_API_KEY` is set) via `ocrProvider.js` → `runOcr(..., { task: 'business_card' })`.
2. On recoverable failure (quota, rate limit, timeout, network, provider error, empty, refusal) → **Anthropic Vision** when `ANTHROPIC_API_KEY` is set and not disabled.
3. On further recoverable failure → **Google Cloud Vision** DOCUMENT_TEXT_DETECTION when `GOOGLE_CLOUD_VISION_ENABLED` + `GOOGLE_CLOUD_VISION_API_KEY`.
4. Terminal classifications:
   - `SUCCESS` — usable business-card OCR text
   - `UNREADABLE` — providers processed but no usable card text
   - `VISION_PROVIDERS_UNAVAILABLE` — infrastructure failure across configured providers (HTTP **503** on extract-card)

Providers are called **sequentially**. Success stops the chain.

## Enabling providers

| Variable | Role |
|----------|------|
| `OPENAI_API_KEY` | Primary vision OCR |
| `OPENAI_VISION_MODEL` / `OPENAI_CHAT_MODEL` | Optional model override |
| `ANTHROPIC_API_KEY` | Secondary vision OCR |
| `ANTHROPIC_DISABLED=1` | Skip Anthropic |
| `ANTHROPIC_MODEL` | Optional; resolved via `resolveAnthropicModel()` → `claude-sonnet-4-6` default |
| `GOOGLE_CLOUD_VISION_ENABLED=true` | Enable tertiary OCR |
| `GOOGLE_CLOUD_VISION_API_KEY` | Google Vision REST API key |

Missing optional providers are skipped. Core still boots without Google/Anthropic.

## Where it runs

- `POST /api/missions/extract-card` (Store Creation Golden Path)
- Agent Chat `POST /api/agent-chat/attachments/ocr`

Raw OCR still feeds `parseBusinessCardOCR` → business identity → approval.

## Observability

Logs `[vision.resilience]` per attempt: provider, attempt, classification, latencyMs.
No API keys or full image bodies.

## See also

`docs/reports/VISION_PROVIDER_FALLBACK_V1.md`
