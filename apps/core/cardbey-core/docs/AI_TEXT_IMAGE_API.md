# AI Text & Image Generation API

## Overview

Complete AI-powered text and image generation endpoints for the Content Studio. These endpoints use OpenAI's GPT-4o-mini for text generation and DALL-E 3 for image generation.

## Security

✅ **API key stays server-side** - Never exposed to the browser  
✅ **Input sanitization** - Prompts are validated and length-limited  
✅ **Error handling** - Clean error messages, no sensitive data leaked  
✅ **Timeouts** - Requests timeout after 30 seconds (60s for image downloads)  
✅ **Rate limit handling** - Proper HTTP status codes and retry-after headers

## Endpoints

### POST /api/ai/text

Generate text content using AI.

**Request:**
```json
{
  "prompt": "Create a catchy headline for a summer sale",
  "language": "en",
  "tone": "friendly",
  "context": {
    "templateName": "Summer Sale Poster",
    "section": "headline",
    "brandNotes": "Brand colors: blue and white, target audience: young adults"
  }
}
```

**Response (Success):**
```json
{
  "ok": true,
  "data": {
    "text": "Summer Sale: Cool Deals You Can't Miss!",
    "prompt": "Create a catchy headline for a summer sale",
    "language": "en",
    "tone": "friendly",
    "section": "headline"
  },
  "source": "ai"
}
```

**Response (Error):**
```json
{
  "ok": false,
  "error": "rate_limit_exceeded",
  "message": "AI service is temporarily busy. Please try again in a moment.",
  "retryAfter": 60
}
```

**Parameters:**
- `prompt` (required, string, 1-2000 chars): The text prompt describing what to generate
- `language` (optional, enum): `"en"` | `"vi"` (default: `"en"`)
- `tone` (optional, enum): `"neutral"` | `"friendly"` | `"professional"` | `"playful"` (default: `"neutral"`)
- `context` (optional, object):
  - `templateName` (optional, string): Name of the template being used
  - `section` (optional, enum): `"headline"` | `"subheadline"` | `"body"` | `"cta"` | `"generic"` (default: `"generic"`)
  - `brandNotes` (optional, string | null): Brand guidelines or notes

**Error Codes:**
- `400` - Validation failed (invalid parameters)
- `429` - Rate limit exceeded
- `500` - Invalid API key or service error
- `504` - Request timeout

---

### POST /api/ai/image

Generate image using DALL-E 3 and automatically save to uploads.

**Request:**
```json
{
  "prompt": "A vibrant summer beach scene with palm trees",
  "style": "photo",
  "aspectRatio": "landscape"
}
```

**Response (Success):**
```json
{
  "ok": true,
  "data": {
    "id": "cmi3abc123...",
    "url": "/uploads/ai-1234567890-abc123.png",
    "mime": "image/png",
    "width": 1792,
    "height": 1024,
    "sizeBytes": 2456789,
    "kind": "IMAGE",
    "prompt": "A vibrant summer beach scene with palm trees",
    "style": "photo",
    "aspectRatio": "landscape"
  },
  "source": "ai"
}
```

**Response (Error):**
```json
{
  "ok": false,
  "error": "timeout",
  "message": "AI service request timed out. Please try again."
}
```

**Parameters:**
- `prompt` (required, string, 1-1000 chars): The image description
- `style` (optional, enum): `"photo"` | `"illustration"` | `"flat"` | `"poster"` (default: `"photo"`)
- `aspectRatio` (optional, enum): `"square"` | `"landscape"` | `"portrait"` (default: `"square"`)

**Image Sizes:**
- `square`: 1024x1024
- `landscape`: 1792x1024
- `portrait`: 1024x1792

**Error Codes:**
- `400` - Validation failed (invalid parameters)
- `429` - Rate limit exceeded
- `500` - Invalid API key, service error, or image download failed
- `504` - Request timeout

**Note:** Generated images are automatically:
1. Downloaded from OpenAI
2. Saved to `/uploads` directory
3. Added to the Media database
4. Returned with a ready-to-use URL

---

## Usage Examples

### Generate Headline
```bash
curl -X POST http://localhost:3001/api/ai/text \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Create a headline for a coffee shop grand opening",
    "tone": "friendly",
    "context": {
      "section": "headline"
    }
  }'
```

### Generate Image
```bash
curl -X POST http://localhost:3001/api/ai/image \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Modern coffee shop interior with warm lighting",
    "style": "photo",
    "aspectRatio": "landscape"
  }'
```

### Generate Vietnamese Text
```bash
curl -X POST http://localhost:3001/api/ai/text \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Tạo tiêu đề cho cửa hàng cà phê mới khai trương",
    "language": "vi",
    "tone": "friendly",
    "context": {
      "section": "headline"
    }
  }'
```

## Implementation Details

### Text Generation
- **Model:** GPT-4o-mini
- **Temperature:** 
  - Professional: 0.5
  - Playful: 0.9
  - Default: 0.7
- **Max Tokens:**
  - CTA: 50
  - Headline: 100
  - Other: 200

### Image Generation
- **Model:** DALL-E 3
- **Quality:** Standard
- **Format:** PNG
- **Download Timeout:** 60 seconds
- **Auto-save:** Yes (to `/uploads` and Media database)

### Error Handling
All errors are mapped to user-friendly messages:
- Rate limits → 429 with retry-after
- Timeouts → 504
- Invalid API key → 500 (generic message, no key exposed)
- Network errors → 500 with generic message

### Input Validation
- Prompts are trimmed and length-checked
- Text prompts: max 2000 characters
- Image prompts: max 1000 characters
- All enum values are validated
- Empty prompts are rejected

## Configuration

Set in `.env`:
```env
OPENAI_API_KEY=sk-your-api-key-here
```

The service automatically:
- Detects if API key is configured
- Falls back gracefully if not available
- Logs all AI operations for debugging

## Cost Considerations

- **Text (GPT-4o-mini):** ~$0.001-0.002 per request
- **Image (DALL-E 3):** ~$0.04 per image (standard quality)
- Monitor usage: https://platform.openai.com/usage

## Frontend Integration

The frontend can call these endpoints directly:

```javascript
// Generate text
const response = await fetch('/api/ai/text', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    prompt: 'Create a headline for...',
    tone: 'friendly',
    context: { section: 'headline' }
  })
});

const { data } = await response.json();
console.log(data.text); // Use the generated text

// Generate image
const imageResponse = await fetch('/api/ai/image', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    prompt: 'A beautiful sunset',
    style: 'photo',
    aspectRatio: 'landscape'
  })
});

const { data: imageData } = await imageResponse.json();
console.log(imageData.url); // Use the image URL directly
```








