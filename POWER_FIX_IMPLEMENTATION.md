# Power Fix (AI) Implementation Summary

## Overview
Implemented "Power Fix (AI)" feature for catalog that auto-fixes missing product fields (tags, category, description, image, price) using MI pipeline. Scales to 300+ products with batch processing and real-time updates.

## Files Created/Modified

### Backend

1. **`apps/core/cardbey-core/src/services/catalog/powerFixService.ts`** (NEW)
   - `detectProductsNeedingFix()` - Detects products with missing fields
   - `fixProduct()` - Fixes a single product using AI (MI inference)
   - `powerFixCatalog()` - Main function that processes all products in batches
   - Features:
     - Batch processing (10 products at a time)
     - SSE broadcasting for real-time updates
     - ActivityEvent logging
     - SystemInsight creation
     - Error handling and progress tracking

2. **`apps/core/cardbey-core/src/routes/miRoutes.js`** (MODIFIED)
   - Added `POST /api/mi/catalog/power-fix` endpoint
   - Validates storeId and generationRunId
   - Calls `powerFixCatalog()` service
   - Applies fixes to draft via patch system
   - Returns jobId, progress, and results

### Frontend (TODO - needs implementation)

1. **`apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/StoreDraftReview.tsx`** (MODIFIED)
   - Added `Wand2` icon import
   - TODO: Add Power Fix button next to Auto-fill Images button
   - TODO: Add state for Power Fix (isPowerFixing, powerFixProgress, powerFixResults)
   - TODO: Add helper function to detect products needing fix
   - TODO: Add confirmation modal
   - TODO: Add SSE listener for real-time updates
   - TODO: Add summary modal showing per-product results

## API Endpoint

### POST /api/mi/catalog/power-fix

**Request:**
```json
{
  "storeId": "string (required)",
  "generationRunId": "string (optional)",
  "productIds": ["string"] (optional, if provided only fix these products)
}
```

**Response:**
```json
{
  "ok": true,
  "jobId": "string",
  "total": 10,
  "processed": 10,
  "successful": 8,
  "failed": 2,
  "results": [
    {
      "productId": "string",
      "productName": "string",
      "fixed": {
        "tags": true,
        "category": true,
        "description": false,
        "image": false,
        "price": true
      },
      "errors": []
    }
  ]
}
```

## SSE Events

The service broadcasts the following SSE events:

1. **`catalog.power_fix.started`** - Job started
   ```json
   {
     "jobId": "string",
     "storeId": "string",
     "total": 10,
     "startedAt": "ISO timestamp"
   }
   ```

2. **`catalog.power_fix.progress`** - Product fixed
   ```json
   {
     "jobId": "string",
     "current": 5,
     "total": 10,
     "productId": "string",
     "productName": "string",
     "result": { ... }
   }
   ```

3. **`catalog.power_fix.completed`** - Job completed
   ```json
   {
     "jobId": "string",
     "storeId": "string",
     "total": 10,
     "successful": 8,
     "failed": 2,
     "completedAt": "ISO timestamp"
   }
   ```

4. **`catalog.power_fix.error`** - Job failed
   ```json
   {
     "jobId": "string",
     "error": "string",
     "failedAt": "ISO timestamp"
   }
   ```

## Logging

1. **ActivityEvent** - Logged for each product fixed:
   - Type: `catalog_power_fix`
   - Payload: `{ productId, productName, fixed, missingFields, generationRunId }`

2. **SystemInsight** - Created on completion:
   - Title: `Power Fix completed for {storeName}`
   - Severity: `info`
   - Category: `catalog_enhancement`
   - Summary: `Fixed {successful} products out of {processed} processed. {failed} failed.`
   - Payload: `{ storeId, jobId, total, successful, failed, results }`

## How It Works

1. **Detection**: Scans products for missing fields (tags, category, description, image, price)
2. **AI Enhancement**: Uses MI inference (`chatMI`) to generate fixes for missing fields
3. **Batch Processing**: Processes products in batches of 10 for scalability
4. **Real-time Updates**: Broadcasts SSE events for each product fixed
5. **Draft Updates**: Applies fixes to draft via patch system
6. **Logging**: Creates ActivityEvent for each product and SystemInsight on completion

## Frontend Integration (TODO)

1. Add Power Fix button next to "Auto-fill images" button
2. Show confirmation modal with count of products needing fix
3. Listen to SSE events for real-time progress updates
4. Update UI as each product is fixed
5. Show summary modal with per-product results after completion

## Testing

1. Create a store with products missing fields
2. Click "Power Fix (AI)" button
3. Confirm modal shows correct count
4. Verify SSE events are received
5. Check UI updates in real-time
6. Verify summary modal shows correct results
7. Check ActivityEvent and SystemInsight are created

## Notes

- Manual Quick Edit workflow is preserved (not removed)
- Scales to 300+ products via batch processing
- Non-blocking: continues even if individual products fail
- Real-time updates via SSE
- Comprehensive logging for analytics


