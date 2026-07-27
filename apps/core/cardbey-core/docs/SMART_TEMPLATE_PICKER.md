# Smart Template Picker - Implementation Summary

## Problem
The Smart Template Picker endpoint `/api/mi/orchestrator/templates/suggestions` was throwing:
```
TypeError: Cannot read properties of undefined (reading 'findMany')
```
This occurred because `getTemplateSuggestionsForContext` was trying to access `prisma.mITemplate.findMany()`, but the correct model is `prisma.creativeTemplate`.

## Solution

### 1. Fixed `getTemplateSuggestionsForContext` function
**File:** `src/services/miOrchestratorService.ts`

- **Changed:** Replaced non-existent `prisma.mITemplate` with `prisma.creativeTemplate`
- **Added:** Defensive guard that checks if `prisma.creativeTemplate` exists before using it
- **Behavior:** If model is missing, returns `{ ok: true, templates: [] }` instead of throwing an error
- **Scoring logic:** Preserved existing scoring algorithm (role match: 40, intent match: 30, orientation: 15, channel: 10, tenant: 10, store: 5)

### 2. Improved error handling in route
**File:** `src/routes/miRoutes.js`

- **Changed:** Route now properly handles `ok: false` responses from service
- **Added:** Clean error messages without leaking stack traces
- **Pattern:** Returns `{ ok: false, error: '...' }` on failure, `{ ok: true, templates: [...] }` on success

### 3. Created seed script (optional)
**File:** `scripts/seedDevTemplates.ts`

- **Purpose:** Seeds 2-3 development templates for testing
- **Templates:**
  1. "Promo Attractor - Vertical" (role: `in_store_attractor`, channel: `cnet_screen`)
  2. "Menu Display - Horizontal" (role: `informer`, channel: `cnet_screen`)
  3. "Generic Promo Template" (no specific role/intent)
- **MIEntity:** Optionally creates MIEntity records for each template with matching `templateId` link

## Database Setup

Before using the endpoint, ensure:
1. **Prisma client is generated:**
   ```bash
   npx prisma generate
   ```

2. **Migrations are applied:**
   ```bash
   npx prisma migrate dev --name add_creative_template
   ```
   (Or ensure `CreativeTemplate` model exists in your database)

3. **Optional: Seed dev templates:**
   ```bash
   npx tsx scripts/seedDevTemplates.ts
   ```

## Testing

### Manual Test
```bash
# From apps/core/cardbey-core
curl -H "Authorization: Bearer dev-admin-token" \
  "http://localhost:3001/api/mi/orchestrator/templates/suggestions?tenantId=cmigvy38p0000jvx8vq6niqiu&storeId=cmigxh2rd0001jv28ojkb6zvg&channel=cnet_screen&limit=5"
```

**Expected response:**
```json
{
  "ok": true,
  "templates": [
    {
      "id": "...",
      "name": "...",
      "description": "...",
      "thumbnailUrl": null,
      "role": "in_store_attractor",
      "primaryIntent": "attract_attention_to_promo",
      "channels": ["cnet_screen"],
      "orientation": "vertical",
      "minDurationS": 6,
      "maxDurationS": 10,
      "tags": ["promo", "sale", "attractor"],
      "miEntity": { ... },
      "score": 80
    }
  ],
  "debug": {
    "totalCandidates": 3
  }
}
```

### Dashboard Test
1. Open `http://localhost:5174/app/creative-shell?channel=cnet_screen`
2. Click "Smart Templates" button
3. **Expected:** No red error message, ranked templates appear in drawer
4. Click a template card → should trigger `onTemplateChosen` callback

## Files Modified

1. `src/services/miOrchestratorService.ts`
   - Fixed model access (`prisma.creativeTemplate` instead of `prisma.mITemplate`)
   - Added defensive guard for missing model
   - Returns empty array instead of error when model unavailable

2. `src/routes/miRoutes.js`
   - Improved error handling
   - Clean error messages

3. `scripts/seedDevTemplates.ts` (NEW)
   - Development seed script for templates
   - Creates 3 sample templates with MIEntity links

## Notes

- **Defensive guard:** The endpoint will gracefully return empty suggestions if the `CreativeTemplate` model doesn't exist, preventing 500 errors
- **Scoring:** Templates are scored based on relevance to provided filters (role, intent, orientation, channel, tenant, store)
- **MIEntity linking:** Templates can optionally have associated MIEntity records for richer metadata
- **Global vs tenant-specific:** Templates can be global (`tenantId: null`) or tenant/store-specific

## Next Steps

1. Run migrations if `CreativeTemplate` table doesn't exist
2. Seed templates using `seedDevTemplates.ts` (optional, for testing)
3. Test endpoint manually with curl
4. Test in dashboard UI
5. Add more templates as needed for production use

