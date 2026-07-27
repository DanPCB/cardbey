# Greeting Cards AI Message Generation - Implementation Summary

## Overview
Added AI-powered greeting message generation endpoint for MI Greeting Cards, allowing the dashboard to automatically generate personalized greeting messages.

## Changes Made

### 1. Service Layer (`src/services/greetingCardsAiService.ts`)
- **Function**: `generateGreetingMessage(input)` - Generates greeting messages using AI
- Uses existing `generateText` function from `aiService.js`
- Supports English and Vietnamese languages
- Supports custom tone (warm, friendly, professional, playful)
- Includes fallback messages if AI generation fails

**Input Parameters:**
- `type`: string - Occasion type (e.g., "christmas_2025", "generic")
- `templateKey`: string - Template key (e.g., "GEN_CARD_BEY_BG_1")
- `tone`: string (optional) - Message tone (default: "warm")
- `language`: string (optional) - Language code ("en" or "vi", default: "en")

**Returns:**
- Generated greeting message string (2-4 lines)

### 2. Route (`src/routes/greetingCards.js`)
- **Endpoint**: `POST /api/greeting-cards/ai-message`
- **Auth**: Required (`requireAuth` middleware)
- **Request Body**:
  ```json
  {
    "type": "christmas_2025",
    "templateKey": "XMAS_COZY_FIREPLACE_1",
    "tone": "warm",
    "language": "en"
  }
  ```
- **Response**:
  ```json
  {
    "ok": true,
    "message": "Wishing you a warm holiday season filled with love, joy and little moments of magic."
  }
  ```

### 3. Fixed MI Video Templates Route
- Updated `src/routes/miVideoTemplates.js` to properly check for model availability
- Fixed Prisma client disconnection to prevent memory leaks

## Prisma Client Regeneration

**Important**: The Prisma client must be regenerated for `MiVideoTemplate` to be available.

If you see errors like:
```
MiVideoTemplate model not available. Please run: npx prisma generate && npx prisma migrate dev
```

**Solution**:
1. Stop the server if it's running
2. Run: `npx prisma generate`
3. Restart the server

**Note**: On Windows, if you get a "EPERM: operation not permitted" error, it means the server is still running and has locked the Prisma query engine DLL. Stop the server first, then run `npx prisma generate`.

## Testing

### Manual Testing

1. **Generate English message**:
   ```bash
   POST /api/greeting-cards/ai-message
   Authorization: Bearer <token>
   {
     "type": "christmas_2025",
     "templateKey": "XMAS_COZY_FIREPLACE_1",
     "tone": "warm",
     "language": "en"
   }
   ```

2. **Generate Vietnamese message**:
   ```bash
   POST /api/greeting-cards/ai-message
   Authorization: Bearer <token>
   {
     "type": "christmas_2025",
     "templateKey": "XMAS_COZY_FIREPLACE_1",
     "tone": "warm",
     "language": "vi"
   }
   ```

3. **Generate with different tone**:
   ```bash
   POST /api/greeting-cards/ai-message
   Authorization: Bearer <token>
   {
     "type": "generic",
     "templateKey": "GEN_CARD_BEY_BG_1",
     "tone": "playful",
     "language": "en"
   }
   ```

### Expected Behavior

- **Success**: Returns `{ ok: true, message: "..." }` with generated text
- **Missing parameters**: Returns `400` with `{ ok: false, error: "invalid_input" }`
- **AI failure**: Returns fallback message (still returns 200 with ok: true)

## Integration with Frontend

The dashboard's "Generate with MI" button should:
1. Call `POST /api/greeting-cards/ai-message` with current card type and templateKey
2. Receive the generated message
3. Fill the message textarea with the generated text

## Files Created/Modified

### Created:
1. `src/services/greetingCardsAiService.ts` - AI message generation service
2. `docs/GREETING_CARDS_AI_MESSAGE.md` - This file

### Modified:
1. `src/routes/greetingCards.js` - Added `/ai-message` endpoint
2. `src/routes/miVideoTemplates.js` - Fixed Prisma client handling

## Dependencies

- Uses existing `generateText` from `src/services/aiService.js`
- Requires `OPENAI_API_KEY` environment variable to be set
- Falls back to default messages if AI is unavailable

## Error Handling

- **Missing parameters**: Returns 400 with validation error
- **AI service unavailable**: Returns fallback message (still 200 OK)
- **AI generation failure**: Returns fallback message (still 200 OK)
- **Server errors**: Returns 500 with error details

## Next Steps

1. **Regenerate Prisma client** (if not done):
   ```bash
   npx prisma generate
   ```

2. **Restart server** to load new routes

3. **Test the endpoint** from the dashboard

4. **Verify** that "Generate with MI" button works in the greeting card editor

