# MI (Merged Intelligence) Process Flow

## Overview

The MI (Merged Intelligence) system automatically attaches "mini-brains" (MIEntity records) to all creative products across Cardbey. This document describes the complete process flow for how MI entities are created, updated, and queried.

## Core Concepts

### MIEntity Structure

Each MIEntity contains:
- **Product Identification**: `productId`, `productType`, `mediaType`
- **Format Information**: `fileUrl`, `previewUrl`, `dimensions`, `orientation`, `durationSec`
- **Origin Tracking**: `createdByUserId`, `createdByEngine`, `sourceProjectId`, `createdAt`
- **Context**: `tenantId`, `storeId`, `campaignId`
- **Links**: `creativeAssetId`, `reportId`, `screenItemId`, `packagingId` (unique constraints)
- **MI Brain**: Full `MIBrain` JSON object with role, intent, capabilities, etc.
- **Lifecycle**: `status`, `validFrom`, `validTo`

### MIBrain Structure

The `miBrain` JSON field contains:
- **Role**: `'menu_page'`, `'social_clip'`, `'ad_poster'`, `'creative_generic'`, etc.
- **Primary Intent**: `'generic_marketing_asset'`, `'promotional_content'`, etc.
- **Secondary Intents**: Array of additional intents
- **Context**: Tenant/store/channel information
- **Capabilities**: Personalization, localization, channel adaptation settings
- **Behavior Rules**: Custom behavior configuration
- **CTA Plan**: Call-to-action strategy
- **Analytics Plan**: KPIs and attribution
- **Lifecycle**: Status and validity periods

## Process Flows

### 1. Signage Asset Upload → MIEntity

**Trigger:** `POST /api/signage-assets/upload`

**Flow:**
```
User uploads asset
→ Asset saved to database
→ buildMIEntity() called with asset data
→ registerOrUpdateEntity() creates/updates MIEntity
→ MIEntity linked via creativeAssetId
→ Asset returned with miEntity field
```

**MI Registration:**
- `productType`: `'signage_asset'`
- `productId`: `asset.id`
- `mediaType`: Inferred from file (image/video)
- `role`: Inferred from asset metadata or defaults to `'ad_poster'`
- `links.creativeAssetId`: `asset.id`
- `tenantId`, `storeId`: From request context
- `channels`: `['cnet_screen']` (plus others if applicable)

**Files:**
- `src/routes/signageRoutes.js` - Asset upload handler
- `src/mi/buildMIEntity.ts` - MIEntity builder

### 2. Content Creation (Content Studio) → MIEntity

**Trigger:** `POST /api/contents`

**Flow:**
```
User creates Content design
→ Content saved to database
→ buildCreativeAssetMIBrain() called
→ registerOrUpdateEntity() creates MIEntity
→ MIEntity linked via productId (content.id)
→ Content returned with miEntity field
```

**MI Registration:**
- `productType`: `'creative_asset'`
- `productId`: `content.id`
- `mediaType`: Inferred from elements (image/video)
- `role`: Inferred via `inferCreativeRole()`:
  - `'menu_page'` - if menu layout detected
  - `'social_clip'` - if video elements present
  - `'ad_poster'` - if image elements present
  - `'creative_generic'` - fallback
- `primaryIntent`: From request or defaults to `'generic_marketing_asset'`
- `channels`: `['creative_engine']` (plus `'cnet_screen'` if storeId available)
- **Note**: No dedicated `contentId` link field; uses `productId` to link

**Files:**
- `src/routes/contents.js` - Content CRUD routes
- `src/mi/miCreativeHelpers.ts` - Creative asset MI helpers

### 3. Content Update → MIEntity Update

**Trigger:** `PUT /api/contents/:id`

**Flow:**
```
User updates Content design
→ Content updated in database
→ buildCreativeAssetMIBrain() called with updated data
→ registerOrUpdateEntity() updates existing MIEntity
→ MIEntity found by productId (content.id)
→ Updated Content returned with miEntity field
```

**MI Update:**
- Same pattern as creation
- Existing MIEntity found by `productId`
- All fields updated with new values

### 4. FilterStudio Export → Content → MIEntity

**Trigger:** User clicks "Apply & Save" or "Save as PNG" in FilterStudio

**Flow:**
```
User exports filtered image
→ Canvas processed with filters
→ Blob created from canvas
→ Upload to /api/uploads/create (creates Media record)
→ saveDesign() called → POST /api/contents
→ Backend creates Content record
→ Backend automatically registers MIEntity (via contents.js)
→ Content returned with contentId
→ MIEntity linked via productId
```

**MI Registration:**
- Same as Content Creation flow
- `productType`: `'creative_asset'`
- `productId`: `content.id`
- `role`: Inferred (typically `'ad_poster'` for filtered images)
- `settings.source`: `'filter_studio'`
- `thumbnailUrl`: Uploaded image URL

**Files:**
- `src/components/studio/FilterStudio.jsx` - Export handler
- `src/features/contents-studio/api/contents.ts` - saveDesign() API
- `src/routes/contents.js` - Content creation with MI registration

### 5. Playlist Item Creation → MIEntity

**Trigger:** Asset added to playlist via `POST /api/signage-playlists/:playlistId/items`

**Flow:**
```
Asset added to playlist
→ PlaylistItem created
→ registerPlaylistItemMIEntity() called
→ MIEntity created for playlist item
→ MIEntity linked via screenItemId (playlistItem.id)
→ Playlist returned with items[].miEntity
```

**MI Registration:**
- `productType`: `'screen_item'`
- `productId`: `playlistItem.id`
- `mediaType`: From asset
- `role`: From asset's MIEntity or inferred
- `links.screenItemId`: `playlistItem.id`
- `tenantId`, `storeId`: From playlist
- `channels`: `['cnet_screen']`

**Files:**
- `src/routes/signageRoutes.js` - Playlist item creation
- `src/engines/signage/addAssetsToPlaylist.ts` - Asset addition logic

### 6. Report Generation → MIEntity

**Trigger:** `POST /api/reports` (Insights reports)

**Flow:**
```
Report generated
→ Report saved to database
→ buildMIEntity() called for report
→ registerOrUpdateEntity() creates MIEntity
→ MIEntity linked via reportId
→ Report returned with miEntity field
```

**MI Registration:**
- `productType`: `'insights_report'`
- `productId`: `report.id`
- `mediaType`: `'document'` or `'image'` (for PDF/image exports)
- `role`: `'analytics_report'`
- `links.reportId`: `report.id`
- `tenantId`, `storeId`: From report context

**Files:**
- `src/routes/reports.js` - Report generation routes

### 7. Screen Item (Device Engine) → MIEntity

**Trigger:** Screen item created/updated in Device Engine

**Flow:**
```
Screen item created/updated
→ ScreenItem saved
→ MIEntity registered/updated
→ MIEntity linked via screenItemId
→ Screen item returned with miEntity
```

**MI Registration:**
- `productType`: `'screen_item'`
- `productId`: `screenItem.id`
- `mediaType`: From content type
- `role`: Inferred from screen item type
- `links.screenItemId`: `screenItem.id`
- `channels`: `['cnet_screen']`

## Service Methods

### `registerOrUpdateEntity(input: MIRegisterInput)`

**Location:** `src/services/miService.ts`

**Behavior:**
1. Check if MIEntity exists for provided link (`creativeAssetId`, `reportId`, `screenItemId`)
2. If exists: Update existing entity
3. If not: Create new entity
4. Return created/updated MIEntity

**Idempotency:**
- Safe to call multiple times
- Updates existing entity if link already exists
- Creates new entity if no link match

**Error Handling:**
- Non-blocking: Errors logged but don't prevent parent operation
- Used in try/catch blocks in all routes

### `getEntityByProductId(productId: string)`

**Location:** `src/services/miService.ts`

**Usage:**
- Fetch MIEntity for Content (uses `productId = content.id`)
- Used in `GET /api/contents` and `GET /api/contents/:id`

### `getEntityByLink(filters)`

**Location:** `src/services/miService.ts`

**Usage:**
- Fetch MIEntity by `creativeAssetId`, `reportId`, or `screenItemId`
- Used for Signage assets, Reports, Screen items

### `getEntitiesByContext(filters)`

**Location:** `src/services/miService.ts`

**Usage:**
- Query MIEntities by tenant/store/campaign/productType/status
- Role filtering done in-memory (can be optimized with raw SQL)

## API Endpoints Exposing MIEntity

### Read Endpoints

1. **`GET /api/contents`** - Lists Contents with `miEntity` field
2. **`GET /api/contents/:id`** - Gets Content with `miEntity` field
3. **`GET /api/signage-assets/:id`** - Gets SignageAsset with `miEntity` field
4. **`GET /api/signage/playlist/:playlistId`** - Gets Playlist with `items[].miEntity` and `items[].asset.miEntity`
5. **`GET /api/reports/:id`** - Gets Report with `miEntity` field

### Write Endpoints (Auto-Register MIEntity)

1. **`POST /api/contents`** - Creates Content + MIEntity
2. **`PUT /api/contents/:id`** - Updates Content + MIEntity
3. **`POST /api/signage-assets/upload`** - Creates SignageAsset + MIEntity
4. **`POST /api/signage-playlists/:playlistId/items`** - Creates PlaylistItem + MIEntity
5. **`POST /api/reports`** - Creates Report + MIEntity

## Frontend Integration

### MIInspectorPanel

**Component:** `src/components/MIInspectorPanel.tsx`

**Usage:**
- Displays MI Brain metadata for selected asset
- Shows role, intent, capabilities, analytics plan
- Shows "No MI Brain attached" if `miEntity` is null

**Integration Points:**
- Creative Engine: `/app/creative-shell` - Shows MI for selected Content
- Signage: Playlist editor - Shows MI for selected playlist items/assets

### MIBadge

**Component:** `src/components/MIBadge.tsx`

**Usage:**
- Small badge indicating presence of MIEntity
- Shows on content cards, asset cards
- Emerald color scheme

## Error Handling

### Non-Blocking Registration

All MI registration is **non-blocking**:
- Errors logged but don't prevent parent operation
- Content/Asset/Report creation succeeds even if MI registration fails
- User experience not impacted by MI errors

**Pattern:**
```javascript
try {
  await registerOrUpdateEntity(...);
  console.log('MIEntity registered');
} catch (miError) {
  console.warn('MIEntity registration failed:', miError.message);
  // Continue with parent operation
}
```

### Graceful Degradation

- Frontend handles missing `miEntity` gracefully
- `MIInspectorPanel` shows "No MI Brain attached" if null
- `MIBadge` only shows if `miEntity` exists
- All null checks in place (`entity?.miEntity ?? null`)

## Backfill Process

For existing records created before MI was implemented:

**Script:** `scripts/backfillMIForSignage.js`

**Process:**
1. Find all SignageAssets without MIEntity
2. Find all PlaylistItems without MIEntity
3. Create MIEntity for each
4. Idempotent: Safe to run multiple times

**Run:**
```bash
cd apps/core/cardbey-core
npm run backfill:mi-signage
```

## Best Practices

### 1. Always Use `registerOrUpdateEntity()`

Don't manually create MIEntity records. Use the service method which handles:
- Existence checks
- Updates vs creates
- Link field management

### 2. Non-Blocking Registration

Wrap MI registration in try/catch:
```javascript
try {
  await registerOrUpdateEntity(...);
} catch (error) {
  console.warn('MI registration failed:', error);
  // Don't throw - parent operation should succeed
}
```

### 3. Consistent Linking

- Use `productId` for Content (no dedicated link field)
- Use `creativeAssetId` for SignageAssets
- Use `screenItemId` for PlaylistItems
- Use `reportId` for Reports

### 4. Role Inference

- Use helper functions (`inferCreativeRole()`, `buildCreativeAssetMIBrain()`)
- Don't hardcode roles
- Allow overrides via request payload when needed

### 5. Context Preservation

Always pass:
- `tenantId` - From request context
- `storeId` - From request context
- `createdByUserId` - From authenticated user
- `createdByEngine` - Engine identifier

## Troubleshooting

### MIEntity Not Created

1. Check backend logs for MI registration errors
2. Verify `registerOrUpdateEntity()` is called
3. Check Prisma client is generated (`npx prisma generate`)
4. Verify database migration applied

### MIEntity Not Returned in API

1. Check `getEntityByProductId()` or `getEntityByLink()` is called
2. Verify MIEntity exists in database
3. Check API response includes `miEntity` field
4. Verify frontend preserves `miEntity` from API response

### Missing MI Badge

1. Verify `miEntity` exists in data
2. Check `MIBadge` component receives `hasBrain={!!entity.miEntity}`
3. Verify `miEntity` is preserved through API → frontend flow

## Future Enhancements

1. **ContentId Link Field** - Add dedicated `contentId` link field to MIEntity schema
2. **Role Refinement** - Improve role inference with ML/content analysis
3. **Bulk Operations** - Batch MI registration for multiple assets
4. **MI Analytics** - Track MI usage, role distribution, intent patterns
5. **MI Versioning** - Track MIEntity changes over time
6. **MI Templates** - Pre-configured MI brains for common use cases

