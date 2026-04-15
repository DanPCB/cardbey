# Smart Template Picker - Backend Implementation

**Date:** 2025-01-XX  
**Status:** ✅ Complete

## Overview

Implemented the backend foundation for Smart Template Picker, enabling AI-driven template suggestions for the Creative Engine. The implementation follows existing MI patterns (signage, reports, creative engine) and integrates seamlessly with the MIEntity system.

---

## Files Created/Modified

### Created Files

1. **`src/mi/miTemplateHelpers.ts`**
   - `registerTemplateMIEntity()` - Registers/updates MIEntity for CreativeTemplate
   - Handles JSON parsing for channels and tags
   - Builds MI Brain structure with proper capabilities

2. **`src/routes/creativeTemplates.js`**
   - `POST /api/creative-templates` - Create template
   - `PUT /api/creative-templates/:id` - Update template
   - `GET /api/creative-templates` - List templates with filters
   - Includes MIEntity registration on create/update
   - Attaches MIEntity to list responses

### Modified Files

1. **`prisma/schema.prisma`**
   - Added `CreativeTemplate` model with all required fields
   - Added `templateId` field to `MIEntity` model
   - Added unique constraint on `templateId` in MIEntity
   - Added indexes for efficient queries

2. **`src/services/miService.ts`**
   - Extended `MIRegisterInput.links` to include `templateId`
   - Extended `MIQueryFilters` to include `templateId`
   - Updated `registerOrUpdateEntity()` to handle `templateId` links
   - Updated `getEntityByLink()` to support `templateId` queries
   - Updated `getEntitiesByContext()` to filter by `templateId`

3. **`src/services/miOrchestratorService.ts`**
   - Added `getTemplateSuggestionsForContext()` function
   - Implements scoring algorithm with weighted matches
   - Returns ranked templates with MIEntity attached

4. **`src/routes/miRoutes.js`**
   - Added `GET /api/mi/orchestrator/templates/suggestions` route
   - Uses consistent tenant/store context extraction
   - Supports query parameters: channel, role, primaryIntent, orientation, limit

5. **`src/server.js`**
   - Imported `creativeTemplatesRoutes`
   - Mounted routes at `/api/creative-templates`

---

## Database Schema

### CreativeTemplate Model

```prisma
model CreativeTemplate {
  id            String   @id @default(cuid())
  tenantId      String?  // null = global/system template
  storeId       String?
  name          String
  description   String?
  thumbnailUrl  String?
  baseContentId String?  // Optional FK to Content/base design
  channels      String   @default("[]") // JSON array
  role          String?
  primaryIntent String?
  orientation   String?  // "horizontal" | "vertical" | "square"
  minDurationS  Int?
  maxDurationS  Int?
  tags          String   @default("[]") // JSON array
  isSystem      Boolean  @default(false)
  isActive      Boolean  @default(true)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@index([tenantId, storeId])
  @@index([role, primaryIntent])
  @@index([orientation])
  @@index([isActive])
  @@index([isSystem])
}
```

### MIEntity Updates

- Added `templateId String?` field
- Added `@@unique([templateId])` constraint
- Added `@@index([templateId])` for queries

---

## API Endpoints

### Template CRUD

#### `POST /api/creative-templates`
Create a new template.

**Request Body:**
```json
{
  "name": "Summer Sale Banner",
  "description": "Bright banner for summer promotions",
  "thumbnailUrl": "https://...",
  "channels": ["cnet_screen", "social_feed"],
  "role": "in_store_attractor",
  "primaryIntent": "attract_attention_to_promo",
  "orientation": "horizontal",
  "minDurationS": 6,
  "maxDurationS": 10,
  "tags": ["sale", "summer", "promo"]
}
```

**Response:**
```json
{
  "ok": true,
  "template": { ... }
}
```

#### `PUT /api/creative-templates/:id`
Update an existing template.

#### `GET /api/creative-templates`
List templates with optional filters.

**Query Parameters:**
- `role` - Filter by role
- `primaryIntent` - Filter by intent
- `orientation` - Filter by orientation
- `channel` - Filter by channel (checks channels array)
- `isSystem` - Filter system vs user templates
- `isActive` - Filter active templates

**Response:**
```json
{
  "ok": true,
  "templates": [
    {
      "id": "...",
      "name": "...",
      "channels": ["cnet_screen"],
      "tags": ["sale"],
      "miEntity": { ... } | null
    }
  ]
}
```

### Template Suggestions

#### `GET /api/mi/orchestrator/templates/suggestions`
Get AI-driven template suggestions for a context.

**Query Parameters:**
- `tenantId` (optional, from context)
- `storeId` (optional, from context)
- `channel` (optional, e.g. "cnet_screen")
- `role` (optional, e.g. "in_store_attractor")
- `primaryIntent` (optional, e.g. "attract_attention_to_promo")
- `orientation` (optional, "horizontal" | "vertical" | "square")
- `limit` (optional, default 20)

**Response:**
```json
{
  "ok": true,
  "templates": [
    {
      "id": "...",
      "name": "...",
      "description": "...",
      "thumbnailUrl": "...",
      "role": "...",
      "primaryIntent": "...",
      "channels": ["..."],
      "orientation": "...",
      "minDurationS": 6,
      "maxDurationS": 10,
      "tags": ["..."],
      "miEntity": { ... } | null,
      "score": 85
    }
  ],
  "debug": {
    "totalCandidates": 42
  }
}
```

---

## Scoring Algorithm

Templates are scored based on relevance to the provided filters:

- **+40 points** - Exact role match
- **+30 points** - Exact primaryIntent match
- **+15 points** - Orientation match
- **+10 points** - Channel included in template's channels array
- **+10 points** - Tenant match (prefer tenant-specific over global)
- **+5 points** - Store match (prefer store-specific)

Templates are sorted by score (descending) and limited to the specified limit.

---

## MIEntity Integration

### Automatic Registration

When a template is created or updated:
1. `registerTemplateMIEntity()` is called
2. MIEntity is created/updated with:
   - `productType: 'creative_template'`
   - `link.templateId: template.id`
   - MI Brain built from template fields (role, primaryIntent, channels, etc.)
   - Capabilities configured for templates

### MIEntity Retrieval

- List endpoints attach MIEntity to each template
- Suggestions endpoint includes MIEntity in response
- Uses `miService.getEntityByLink({ templateId })` for lookups

---

## Next Steps / TODOs

1. **Run Migration**
   ```bash
   npx prisma migrate dev --name add_creative_template
   ```

2. **Seed Initial Templates**
   - Create 2-3 system templates via Prisma Studio or seed script
   - Examples:
     - "In-Store Attractor" (role: in_store_attractor, channel: cnet_screen)
     - "Menu Page" (role: menu_page, channel: cnet_screen)
     - "Social Promo" (role: social_promo, channel: social_feed)

3. **Test Endpoints**
   ```bash
   # Create template
   curl -X POST http://localhost:3001/api/creative-templates \
     -H "Authorization: Bearer <token>" \
     -H "Content-Type: application/json" \
     -d '{"name": "Test Template", "channels": ["cnet_screen"]}'

   # Get suggestions
   curl "http://localhost:3001/api/mi/orchestrator/templates/suggestions?channel=cnet_screen&role=in_store_attractor&orientation=horizontal" \
     -H "Authorization: Bearer <token>"
   ```

4. **Future Enhancements**
   - Add template preview/rendering endpoint
   - Add template versioning
   - Add template usage analytics
   - Enhance scoring with ML/AI
   - Add template categories/groups

---

## Testing Checklist

- [ ] Run Prisma migration successfully
- [ ] Create a template via POST endpoint
- [ ] Verify MIEntity is created for template
- [ ] Update template via PUT endpoint
- [ ] Verify MIEntity is updated
- [ ] List templates with filters
- [ ] Test suggestions endpoint with various filters
- [ ] Verify scoring algorithm works correctly
- [ ] Test tenant/store filtering
- [ ] Verify global templates are included

---

## Notes

- Templates use JSON strings for `channels` and `tags` arrays (SQLite limitation)
- MIEntity registration is non-blocking (errors are logged but don't fail requests)
- Scoring algorithm is simple and can be enhanced with ML/AI later
- Template suggestions include both global and tenant/store-specific templates
- All endpoints require authentication (`requireAuth` middleware)



