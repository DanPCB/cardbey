# MI Greeting Cards - Implementation Summary

## Overview
Added backend support for MI Greeting Cards without changing existing profile/account/contact logic. This is a fully additive feature.

## Changes Made

### 1. Prisma Schema (`prisma/schema.prisma`)
- **Added `GreetingCard` model** with the following fields:
  - `id`: String (cuid)
  - `ownerId`: String (FK to User)
  - `type`: String (e.g., "christmas_2025", "newyear_2026", "generic")
  - `templateKey`: String (e.g., "C1_CLASSIC_GOLD", "NY1_FIREWORKS")
  - `title`: String? (optional user-friendly title)
  - `message`: String? (optional greeting text)
  - `coverImageUrl`: String? (thumbnail/preview)
  - `mediaUrl`: String? (generated video/animation URL)
  - `payloadJson`: Json? (arbitrary template data, MI parameters, config)
  - `shareSlug`: String (unique, for public sharing)
  - `isPublished`: Boolean (default: false)
  - `publishedAt`: DateTime?
  - `createdAt`: DateTime
  - `updatedAt`: DateTime

- **Added relation** to User model:
  - `greetingCards GreetingCard[]` in User model
  - `owner User @relation(...)` in GreetingCard model

- **Indexes added**:
  - `@@index([ownerId])`
  - `@@index([shareSlug])`
  - `@@index([isPublished])`
  - `@@index([type])`

### 2. Migration
**Status**: Migration needs to be created and applied

Run:
```bash
npx prisma migrate dev --name add_greeting_card_model
```

Then generate Prisma client:
```bash
npx prisma generate
```

### 3. Slug Generation Helper (`src/utils/greetingCardSlug.js`)
- **Function**: `generateGreetingCardSlug(prisma, card)`
- Generates unique share slugs for greeting cards
- Uses card title (if available) as base, adds random suffix
- Ensures uniqueness by checking database
- Falls back to timestamp-based slug if too many collisions

### 4. Routes (`src/routes/greetingCards.js`)
Implemented 5 endpoints:

#### 4.1 GET /api/greeting-cards (auth required)
- Lists all greeting cards for authenticated user
- Returns: `{ ok: true, cards: [...] }`
- Ordered by `updatedAt` descending

#### 4.2 GET /api/greeting-cards/:id (auth required)
- Gets specific card by ID
- Verifies ownership (403 if not owner)
- Returns: `{ ok: true, card: {...} }`
- Includes full details including `payloadJson` and `message`

#### 4.3 POST /api/greeting-cards (auth required)
- Creates new card OR updates existing draft
- If `id` provided: updates existing card (must belong to user)
- If no `id`: creates new card
- Required for new cards: `type`, `templateKey`
- Automatically generates `shareSlug` for new cards
- Returns: `{ ok: true, card: {...} }`

#### 4.4 POST /api/greeting-cards/:id/publish (auth required)
- Publishes a card and ensures it has a share slug
- Optional body fields: `title`, `message`, `coverImageUrl`, `mediaUrl`
- Sets `isPublished = true`
- Sets `publishedAt = now()` if not already set
- Generates `shareSlug` if missing
- Returns: `{ ok: true, card: {...} }`

#### 4.5 GET /api/greeting-cards/public/:shareSlug (NO auth)
- Public endpoint for viewing shared cards
- Only returns published cards (`isPublished = true`)
- Includes owner profile info (safe, public fields only)
- Returns:
  ```json
  {
    "ok": true,
    "card": {
      "id": "...",
      "type": "...",
      "templateKey": "...",
      "title": "...",
      "message": "...",
      "coverImageUrl": "...",
      "mediaUrl": "...",
      "payloadJson": {...},
      "publishedAt": "..."
    },
    "owner": {
      "handle": "...",
      "fullName": "...",
      "avatarUrl": "...",
      "accountType": "...",
      "tagline": "...",
      "stores": [...],
      "publicProfileUrl": "/api/public/users/:handle"
    }
  }
  ```

### 5. Server Integration (`src/server.js`)
- Imported `greetingCardsRoutes`
- Registered at `/api/greeting-cards`

## User Model Details
- **Model Name**: `User`
- **ID Type**: `String @id @default(cuid())`
- **Public Profile Fields**:
  - `handle`: String? (unique, for `/api/public/users/:handle`)
  - `displayName`: String?
  - `fullName`: String?
  - `avatarUrl`: String?
  - `tagline`: String?

## Public Profile URL Construction
- Uses existing pattern: `/api/public/users/:handle`
- Constructed from `PUBLIC_BASE_URL` env var or request headers
- Reuses `toPublicUserProfile()` utility from `src/utils/publicProfileMapper.js`

## Authentication
- All endpoints except `/public/:shareSlug` use `requireAuth` middleware
- Follows existing auth patterns (JWT tokens, dev tokens)
- Ownership verification for update/publish operations

## Error Handling
- Follows existing error response patterns
- Returns `{ ok: false, error: "...", message: "..." }` format
- 404 for not found
- 403 for access denied
- 400 for validation errors
- 503 if Prisma model not available (needs migration)

## Testing Checklist

### Manual Testing Steps:

1. **Create a card**:
   ```bash
   POST /api/greeting-cards
   Authorization: Bearer <token>
   {
     "type": "christmas_2025",
     "templateKey": "C1_CLASSIC_GOLD",
     "title": "Merry Christmas",
     "message": "Happy holidays!"
   }
   ```

2. **List cards**:
   ```bash
   GET /api/greeting-cards
   Authorization: Bearer <token>
   ```

3. **Get specific card**:
   ```bash
   GET /api/greeting-cards/:id
   Authorization: Bearer <token>
   ```

4. **Publish card**:
   ```bash
   POST /api/greeting-cards/:id/publish
   Authorization: Bearer <token>
   {
     "title": "Merry Christmas from John",
     "message": "Happy holidays!"
   }
   ```

5. **View public card**:
   ```bash
   GET /api/greeting-cards/public/:shareSlug
   (no auth required)
   ```

## Next Steps

1. **Run migration**:
   ```bash
   npx prisma migrate dev --name add_greeting_card_model
   npx prisma generate
   ```

2. **Restart server** (if running) to load new routes

3. **Test endpoints** using Postman, curl, or Thunder Client

4. **Frontend integration** - Connect dashboard UI to these endpoints

## Files Created/Modified

### Created:
- `src/routes/greetingCards.js` - All greeting card endpoints
- `src/utils/greetingCardSlug.js` - Slug generation helper
- `docs/GREETING_CARDS_IMPLEMENTATION.md` - This file

### Modified:
- `prisma/schema.prisma` - Added GreetingCard model and User relation
- `src/server.js` - Registered greeting cards routes

## Backward Compatibility
✅ All changes are **additive only**:
- No existing models modified (except adding optional relation to User)
- No existing routes changed
- No breaking changes to existing APIs
- Safe to deploy without affecting existing functionality

