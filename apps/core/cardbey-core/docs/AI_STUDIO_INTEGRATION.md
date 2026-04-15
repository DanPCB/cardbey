# AI Studio Integration - OpenAI

## Overview

The contents studio now supports real AI-powered content generation using OpenAI's GPT-4o-mini model. All endpoints automatically use AI when an API key is configured, and gracefully fall back to mock responses when AI is unavailable.

## Setup

### 1. Install Dependencies

The OpenAI SDK is already installed. If you need to reinstall:

```bash
npm install openai
```

### 2. Configure API Key

Add your OpenAI API key to your `.env` file:

```env
OPENAI_API_KEY=sk-your-api-key-here
```

### 3. Restart Server

Restart the server to load the new environment variable:

```bash
npm run dev
```

## Available AI Features

### 1. Design Suggestions (`POST /api/studio/suggestions`)

**AI-Powered:** Generates intelligent design suggestions based on the current design state.

**Request:**
```json
{
  "snapshot": {
    "elements": [...],
    "selectedIds": ["element-id"],
    "exportFormat": "png"
  },
  "lastEvent": {
    "event": "export.started"
  }
}
```

**Response:**
```json
{
  "ok": true,
  "suggestions": [
    {
      "label": "Improve text readability",
      "action": "patch",
      "payload": [...]
    }
  ],
  "source": "ai"  // or "mock" if AI unavailable
}
```

### 2. Caption Generation (`POST /api/ai/caption`)

**AI-Powered:** Generates creative, engaging marketing captions for elements.

**Request:**
```json
{
  "elementId": "element-id",
  "snapshot": {
    "elements": [...]
  },
  "tone": "Fresh"
}
```

**Response:**
```json
{
  "variants": [
    "Your product — Fresh deal just for today!",
    "Treat yourself with your product. Limited slots!",
    "Your product lovers rejoice! Visit us & save more."
  ],
  "source": "ai"
}
```

### 3. Color Palette Generation (`POST /api/ai/palette`)

**AI-Powered:** Generates professional color palettes based on theme and mood.

**Request:**
```json
{
  "snapshot": {
    "elements": [...]
  },
  "theme": "modern",
  "mood": "uplifting"
}
```

**Response:**
```json
{
  "palette": ["#2563EB", "#E0F2FE", "#0F172A", "#FFFFFF"],
  "patches": [...],
  "source": "ai"
}
```

### 4. Design Layout Generation (`POST /api/ai/generate-design`)

**AI-Powered:** Generates complete design layouts from text prompts.

**Request:**
```json
{
  "intent": {
    "prompt": "Create a vibrant summer sale poster",
    "goal": "promo",
    "language": "en"
  },
  "size": {
    "width": 1080,
    "height": 1920
  },
  "theme": "tropical",
  "mood": "energetic"
}
```

**Response:**
```json
{
  "layoutId": "abc123",
  "elements": [...],
  "palette": ["#FF5400", "#FFBD00", "#00B4D8", "#0077B6"],
  "notes": [
    "Generated from prompt: \"Create a vibrant summer sale poster\"",
    "Theme: tropical",
    "Mood: energetic",
    "Source: AI (OpenAI)"
  ],
  "source": "ai"
}
```

## Fallback Behavior

All endpoints automatically fall back to mock responses when:
- `OPENAI_API_KEY` is not set
- OpenAI API returns an error
- Network issues occur

The response includes a `source` field indicating whether the response came from `"ai"` or `"mock"`.

## AI Service Configuration

The AI service uses:
- **Model:** `gpt-4o-mini` (cost-effective, fast)
- **Temperature:** 0.7-0.8 (balanced creativity)
- **Max Tokens:** 200-500 (depending on endpoint)

You can modify these settings in `src/services/aiService.js`.

## Error Handling

All AI calls are wrapped in try-catch blocks. Errors are logged to the console but don't break the API - endpoints always return a valid response (either AI-generated or mock).

## Cost Considerations

- **gpt-4o-mini** is very cost-effective (~$0.15 per 1M input tokens, ~$0.60 per 1M output tokens)
- Typical request costs: $0.001-0.005 per request
- Monitor usage in OpenAI dashboard: https://platform.openai.com/usage

## Testing

### Test with AI:
```bash
# Set API key
export OPENAI_API_KEY=sk-your-key

# Start server
npm run dev

# Test endpoint
curl -X POST http://localhost:3001/api/studio/suggestions \
  -H "Content-Type: application/json" \
  -d '{"snapshot":{"elements":[]}}'
```

### Test without AI (mock fallback):
```bash
# Don't set OPENAI_API_KEY
npm run dev

# Same request will return mock data
curl -X POST http://localhost:3001/api/studio/suggestions \
  -H "Content-Type: application/json" \
  -d '{"snapshot":{"elements":[]}}'
```

## Monitoring

Check server logs for AI usage:
```
[Studio] AI generated 3 suggestions
[AI] Generated 3 AI captions
[AI] Generated AI palette with 4 colors
[AI] Generated AI design layout
```

If AI fails, you'll see:
```
[Studio] AI suggestion generation failed, falling back to mock: [error]
```

## Future Enhancements

Potential improvements:
- Support for other AI providers (Anthropic Claude, Google Gemini)
- Image generation integration (DALL-E, Stable Diffusion)
- Caching of common AI responses
- User-specific AI preferences
- Fine-tuned models for design-specific tasks








