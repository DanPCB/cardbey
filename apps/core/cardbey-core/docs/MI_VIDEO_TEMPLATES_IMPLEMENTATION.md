# MI Video Templates - Implementation Summary

## Overview
Added support for MI video templates for greeting cards, backed by the database. This allows users to select video background templates when creating greeting cards.

## Changes Made

### 1. Prisma Schema (`prisma/schema.prisma`)
- **Added `MiVideoTemplate` model** with the following fields:
  - `id`: String (cuid)
  - `key`: String (unique) - e.g. "XMAS_GOLD_LOOP_1"
  - `label`: String - Human-readable name
  - `occasionType`: String - e.g. "christmas_2025", "newyear_2026", "generic"
  - `orientation`: String - "landscape" | "vertical"
  - `backgroundUrl`: String - MP4/WebM URL
  - `posterUrl`: String - Preview image URL
  - `textZonesJson`: Json - Config for title/message/signature zones
  - `textStylesJson`: Json - Config for text styles (colors, shadows, etc.)
  - `isActive`: Boolean (default: true)
  - `createdAt`: DateTime
  - `updatedAt`: DateTime

- **Indexes added**:
  - `@@index([occasionType])`
  - `@@index([orientation])`
  - `@@index([isActive])`

### 2. Migration
**Status**: Migration needs to be created and applied

Run:
```bash
npx prisma migrate dev --name add_mi_video_template_model
```

Then generate Prisma client:
```bash
npx prisma generate
```

### 3. Service Layer (`src/services/miVideoTemplatesService.ts`)
- **Function**: `listMiVideoTemplates(params)` - Lists templates with optional filters
- **Function**: `getMiVideoTemplateByKey(key)` - Gets a specific template by key
- Supports filtering by:
  - `occasionType` (e.g., "christmas_2025")
  - `orientation` (e.g., "landscape", "vertical")
  - `onlyActive` (default: true)

### 4. Routes (`src/routes/miVideoTemplates.js`)
Implemented 2 endpoints:

#### 4.1 GET /api/mi/video-templates (auth required)
- Lists MI video templates with optional filters
- Query parameters:
  - `occasionType` (optional) - Filter by occasion type
  - `orientation` (optional) - Filter by orientation
- Returns: `{ ok: true, templates: [...] }`
- Only returns active templates by default

#### 4.2 GET /api/mi/video-templates/:key (auth required)
- Gets a specific template by key
- Returns: `{ ok: true, template: {...} }`
- Returns 404 if template not found or not active

### 5. Server Integration (`src/server.js`)
- Imported `miVideoTemplatesRoutes`
- Registered at `/api/mi/video-templates`

### 6. Seed Script (`scripts/seedMiVideoTemplates.js`)
- Seeds 4 placeholder templates:
  - `XMAS_GOLD_LOOP_1` - Golden Christmas Lights (landscape)
  - `NY_FIREWORKS_LOOP_1` - New Year Fireworks (landscape)
  - `GENERIC_GRADIENT_LOOP_1` - Generic Gradient Loop (landscape)
  - `XMAS_VERTICAL_SNOW_1` - Christmas Snow (vertical)
- Uses upsert pattern (creates or updates existing)
- Includes text zones and styles configuration

**Usage:**
```bash
npm run seed:mi-video-templates
# or
node scripts/seedMiVideoTemplates.js
```

## Files Created/Modified

### Created:
1. `src/services/miVideoTemplatesService.ts` - Service layer for template operations
2. `src/routes/miVideoTemplates.js` - API routes
3. `scripts/seedMiVideoTemplates.js` - Seed script
4. `docs/MI_VIDEO_TEMPLATES_IMPLEMENTATION.md` - This file

### Modified:
1. `prisma/schema.prisma` - Added MiVideoTemplate model
2. `src/server.js` - Registered routes
3. `package.json` - Added `seed:mi-video-templates` script

## API Endpoints

### GET /api/mi/video-templates
**Query Parameters:**
- `occasionType` (optional) - Filter by occasion type
- `orientation` (optional) - Filter by orientation

**Response:**
```json
{
  "ok": true,
  "templates": [
    {
      "id": "...",
      "key": "XMAS_GOLD_LOOP_1",
      "label": "Golden Christmas Lights",
      "occasionType": "christmas_2025",
      "orientation": "landscape",
      "backgroundUrl": "https://YOUR-CDN/mi/xmas/gold-loop-1.mp4",
      "posterUrl": "https://YOUR-CDN/mi/xmas/gold-loop-1.jpg",
      "textZonesJson": {
        "title": { "x": 0.5, "y": 0.30, "maxWidth": 0.7 },
        "message": { "x": 0.5, "y": 0.52, "maxWidth": 0.7 },
        "signature": { "x": 0.5, "y": 0.78, "maxWidth": 0.6 }
      },
      "textStylesJson": {
        "title": { "color": "#FFE9A6", "fontSize": 48, "shadow": true },
        "message": { "color": "#FFF8E7", "fontSize": 24 },
        "signature": { "color": "#FFE9A6", "fontSize": 18, "italic": true }
      },
      "isActive": true,
      "createdAt": "...",
      "updatedAt": "..."
    }
  ]
}
```

### GET /api/mi/video-templates/:key
**Path Parameters:**
- `key` - Template key (e.g., "XMAS_GOLD_LOOP_1")

**Response:**
```json
{
  "ok": true,
  "template": {
    "id": "...",
    "key": "XMAS_GOLD_LOOP_1",
    "label": "Golden Christmas Lights",
    ...
  }
}
```

## Text Zones Configuration

Each template includes `textZonesJson` and `textStylesJson` for configuring text placement and styling:

**textZonesJson** - Defines where text should be placed (normalized coordinates 0-1):
```json
{
  "title": { "x": 0.5, "y": 0.30, "maxWidth": 0.7 },
  "message": { "x": 0.5, "y": 0.52, "maxWidth": 0.7 },
  "signature": { "x": 0.5, "y": 0.78, "maxWidth": 0.6 }
}
```

**textStylesJson** - Defines text styling:
```json
{
  "title": { "color": "#FFE9A6", "fontSize": 48, "shadow": true },
  "message": { "color": "#FFF8E7", "fontSize": 24 },
  "signature": { "color": "#FFE9A6", "fontSize": 18, "italic": true }
}
```

## Next Steps

1. **Run migration**:
   ```bash
   npx prisma migrate dev --name add_mi_video_template_model
   npx prisma generate
   ```

2. **Seed templates**:
   ```bash
   npm run seed:mi-video-templates
   ```

3. **Update CDN URLs**:
   - Replace `https://YOUR-CDN/...` placeholders in seed script with actual CDN URLs
   - Re-run seed script to update URLs

4. **Restart server** (if running) to load new routes

5. **Test endpoints**:
   ```bash
   # List all templates
   GET /api/mi/video-templates
   Authorization: Bearer <token>
   
   # Filter by occasion
   GET /api/mi/video-templates?occasionType=christmas_2025
   Authorization: Bearer <token>
   
   # Filter by orientation
   GET /api/mi/video-templates?orientation=landscape
   Authorization: Bearer <token>
   
   # Get specific template
   GET /api/mi/video-templates/XMAS_GOLD_LOOP_1
   Authorization: Bearer <token>
   ```

## Integration with Greeting Cards

The `templateKey` field in `GreetingCard` model can reference `MiVideoTemplate.key`:
- When creating a greeting card, users can select a video template
- The `templateKey` stores the reference to the video template
- Frontend can fetch template details using `/api/mi/video-templates/:key` to get text zones and styles

## Backward Compatibility
✅ All changes are **additive only**:
- No existing models modified
- No existing routes changed
- No breaking changes to existing APIs
- Safe to deploy without affecting existing functionality

