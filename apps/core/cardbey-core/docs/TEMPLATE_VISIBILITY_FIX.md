# Template Visibility Fix - Summary

## Problem
SmartTemplatePicker showed "No templates match this context" because CreativeTemplate instances were missing required metadata fields used by MIOrchestrator for ranking:
- `channels` (empty array `[]`)
- `role` (null)
- `primaryIntent` (null)
- `orientation` (null)
- `tags` (empty array `[]`)
- `isActive` (false)

## Solution Implemented

### 1. Created Seed File
**File:** `prisma/seed.creativeTemplates.js`

- Seeds system templates with sensible default metadata
- Includes 5 sample templates with proper metadata:
  - Universal Promo Banner
  - Menu Display Card
  - Brand Identity Showcase
  - Event Announcement
  - Generic Marketing Asset
- Updates existing templates if they're missing metadata
- Default metadata values:
  ```javascript
  {
    channels: ['cnet_screen', 'storefront', 'social'],
    role: 'generic',
    primaryIntent: 'general_design',
    orientation: 'any',
    tags: ['universal', 'default'],
    isSystem: true,
    isActive: true,
  }
  ```

**Usage:**
```bash
node prisma/seed.creativeTemplates.js
```

### 2. Created Migration Script
**File:** `scripts/update-template-metadata.js`

- Updates existing CreativeTemplate records with default metadata
- Only updates templates missing required fields
- Safe to run multiple times (idempotent)

**Usage:**
```bash
node scripts/update-template-metadata.js
```

### 3. Updated Create/Update Routes
**File:** `src/routes/creativeTemplates.js`

**Changes:**
- **POST `/api/creative-templates`**: Applies default metadata when fields are not provided
- **PUT `/api/creative-templates/:id`**: Applies default metadata when updating templates with missing/null fields

**Default Values Applied:**
- `channels`: `['cnet_screen', 'storefront', 'social']`
- `role`: `'generic'`
- `primaryIntent`: `'general_design'`
- `orientation`: `'any'`
- `tags`: `['universal', 'default']`

### 4. Enhanced Scoring Logic
**File:** `src/services/miOrchestratorService.ts`

**Changes:**
- Added base score (1 point) for templates with default/generic values when filters are provided
- Ensures templates with default metadata still appear in results even when filters are applied
- Templates with default values now show up in SmartTemplatePicker even with context filters

**Scoring Logic:**
- Templates with `role='generic'`, `primaryIntent='general_design'`, `orientation='any'`, or default channels get a base score of 1
- This ensures they appear in results when filters are provided but no exact matches exist

## Files Modified

1. **`prisma/seed.creativeTemplates.js`** (NEW)
   - Seed file for system templates with default metadata

2. **`scripts/update-template-metadata.js`** (NEW)
   - Migration script to update existing templates

3. **`src/routes/creativeTemplates.js`** (MODIFIED)
   - Added default metadata application in POST and PUT routes

4. **`src/services/miOrchestratorService.ts`** (MODIFIED)
   - Enhanced scoring to give base score to default/generic templates

## Testing

### Step 1: Seed Templates
```bash
node prisma/seed.creativeTemplates.js
```

### Step 2: Update Existing Templates (if any)
```bash
node scripts/update-template-metadata.js
```

### Step 3: Test SmartTemplatePicker
The following queries should now return templates:

```bash
# With channel filter
GET /api/mi/orchestrator/templates/suggestions?channel=cnet_screen

# With role filter
GET /api/mi/orchestrator/templates/suggestions?role=generic

# With primaryIntent filter
GET /api/mi/orchestrator/templates/suggestions?primaryIntent=general_design

# With orientation filter
GET /api/mi/orchestrator/templates/suggestions?orientation=horizontal

# With multiple filters
GET /api/mi/orchestrator/templates/suggestions?channel=cnet_screen&role=generic&orientation=horizontal

# Without filters (should return all active templates)
GET /api/mi/orchestrator/templates/suggestions
```

## Expected Results

1. **Templates with default metadata** should appear in SmartTemplatePicker even when filters are provided
2. **Templates with specific metadata** should score higher and appear first
3. **New templates created** via API will automatically get default metadata if not provided
4. **Existing templates updated** via API will get default metadata for missing fields

## Backward Compatibility

- All changes are backward compatible
- Existing templates without metadata will be updated with defaults
- New templates can still provide custom metadata (defaults only apply when not provided)
- API responses remain unchanged (only internal behavior improved)

## Next Steps

1. Run the seed script to create system templates
2. Run the migration script to update existing templates
3. Test SmartTemplatePicker in the dashboard
4. Verify templates appear with various filter combinations

