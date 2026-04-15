# Template Instantiation Implementation

## Overview

Implemented the backend functionality to instantiate Smart Templates into Creative Engine canvas. When a user selects a template and clicks "Use template", it creates a new Content record cloned from the template's base Content, with proper tenant/store context and MIEntity registration.

## Implementation Details

### 1. Service Function: `instantiateCreativeTemplateForContext`

**File**: `src/services/miOrchestratorService.ts`

**Function Signature**:
```typescript
export async function instantiateCreativeTemplateForContext(
  params: {
    templateContentId: string;  // CreativeTemplate.id
    tenantId: string;
    storeId?: string | null;
    channel?: string | null;
    orientation?: 'vertical' | 'horizontal' | null;
    userId?: string | null;
  }
): Promise<{ content: Content & { miEntity?: any } }>
```

**Flow**:
1. Loads the `CreativeTemplate` by ID
2. Validates that the template has a `baseContentId` (references a Content record)
3. Loads the base `Content` record that contains the actual design
4. Retrieves the template's `MIEntity` (if exists) to reuse role/primaryIntent
5. Creates a new `Content` record by cloning:
   - New unique ID
   - Name: `"Template – ${template.name}"`
   - Copies `elements`, `settings`, `renderSlide`, `thumbnailUrl`
   - Sets `userId` from params or falls back to template's userId
   - Version starts at 1
6. Registers a new `MIEntity` for the instantiated content:
   - `productType: 'creative_asset'`
   - Reuses role/primaryIntent from template's MIEntity if available
   - Falls back to template's `role`/`primaryIntent` fields
   - Combines template channels with provided channel
   - Sets `sourceProjectId` to template.id (links back to template)
   - Uses `buildCreativeAssetMIBrain` pattern from `miCreativeHelpers`
7. Returns the new Content with MIEntity attached

### 2. API Route: `POST /api/mi/orchestrator/templates/:templateId/instantiate`

**File**: `src/routes/miRoutes.js`

**Authentication**: Requires `requireAuth` middleware

**Request**:
- **URL Parameter**: `templateId` (CreativeTemplate.id)
- **Body** (optional):
  - `channel`: string (e.g. "cnet_screen")
  - `orientation`: "horizontal" | "vertical"
  - `tenantId`: string (optional, extracted from context if not provided)
  - `storeId`: string (optional, extracted from context if not provided)

**Response** (200):
```json
{
  "ok": true,
  "content": {
    "id": "...",
    "name": "Template – Summer Sale Banner",
    "userId": "...",
    "elements": [...],
    "settings": {...},
    "renderSlide": {...},
    "thumbnailUrl": "...",
    "version": 1,
    "createdAt": "...",
    "updatedAt": "...",
    "miEntity": {
      "id": "...",
      "productId": "...",
      "productType": "creative_asset",
      "miBrain": {
        "role": "in_store_attractor",
        "primaryIntent": "attract_attention_to_promo",
        ...
      },
      ...
    }
  }
}
```

**Error Responses**:
- `400`: Missing template ID or tenant ID
- `404`: Template not found
- `400`: Template has no baseContentId
- `500`: Internal server error

**Tenant/Store Context Extraction**:
- Uses the same pattern as other MI routes (`requireTenantStoreContext`)
- Extracts from query params → body params → auth context → dev defaults
- Ensures consistent behavior across all MI endpoints

## Integration Points

### Content Model
- Uses existing `Content` model (no schema changes needed)
- Content fields: `id`, `name`, `userId`, `elements`, `settings`, `renderSlide`, `thumbnailUrl`, `version`

### CreativeTemplate Model
- Requires `baseContentId` field (optional FK to Content)
- Template metadata: `name`, `role`, `primaryIntent`, `channels`, `orientation`, `thumbnailUrl`

### MIEntity Registration
- Uses `miService.registerOrUpdateEntity()` with `productType: 'creative_asset'`
- Links via `productId` (Content.id), not a separate link field
- Reuses template's MI context (role, primaryIntent, channels)
- Sets `sourceProjectId` to template.id for traceability

### MI Helpers
- Uses `buildCreativeAssetMIBrain()` from `miCreativeHelpers.ts`
- Follows the same pattern as regular Content creation
- Non-blocking: MI registration errors don't fail the request

## Usage Example

```javascript
// Frontend: Instantiate a template
const response = await fetch('/api/mi/orchestrator/templates/tmpl_123/instantiate', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer <token>',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    channel: 'cnet_screen',
    orientation: 'horizontal',
    tenantId: 'tenant_123',  // Optional, extracted from context if not provided
    storeId: 'store_456',    // Optional
  }),
});

const { ok, content } = await response.json();

if (ok) {
  // Navigate to Creative Engine with content.id
  // Content is ready to edit in Filter Studio
  navigate(`/creative-engine/${content.id}`);
}
```

## Next Steps (Frontend)

1. **Update Smart Template Picker UI**:
   - Add "Use template" button/action
   - Call the instantiation endpoint on click
   - Show loading state during instantiation

2. **Navigate to Creative Engine**:
   - After successful instantiation, navigate to Creative Engine
   - Pass the new `content.id` to load it in Filter Studio
   - Content should be ready to edit immediately

3. **Error Handling**:
   - Handle 404 (template not found)
   - Handle 400 (template has no base content)
   - Show user-friendly error messages

## Testing Checklist

- [ ] Create a CreativeTemplate with baseContentId
- [ ] Call instantiation endpoint with valid template ID
- [ ] Verify new Content is created with correct fields
- [ ] Verify MIEntity is registered for new Content
- [ ] Verify MIEntity reuses template's role/primaryIntent
- [ ] Verify channels include provided channel
- [ ] Test with missing template (404)
- [ ] Test with template without baseContentId (400)
- [ ] Test tenant/store context extraction
- [ ] Verify Content can be loaded in Creative Engine

## Notes

- The instantiated Content is a **copy** - editing it doesn't affect the template
- The template's base Content remains unchanged
- MIEntity links back to template via `sourceProjectId`
- Content name format: `"Template – ${template.name}"` (keeps it readable)
- Non-blocking MI registration ensures content creation succeeds even if MI fails


