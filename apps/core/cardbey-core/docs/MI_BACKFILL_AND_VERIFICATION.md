# MI Backfill and Verification Guide

## Overview

This document describes the MIEntity backfill process and verification steps for ensuring playlist items and assets have MI data displayed in the UI.

## Endpoint Used by Playlist Editor

**Frontend Function:** `getSignagePlaylist()` in `apps/dashboard/cardbey-marketing-dashboard/src/lib/api.ts`

**Backend Endpoint:** `GET /api/signage/playlist/:playlistId`

**Status:** ✅ Already includes MIEntity at both `item.asset.miEntity` and `item.miEntity`

## Frontend Implementation

### PlaylistPreviewPane
- **File:** `apps/dashboard/cardbey-marketing-dashboard/src/pages/signage/components/PlaylistPreviewPane.jsx`
- **MI Reading:** Checks both locations:
  ```tsx
  const miEntity =
    selectedItem?.asset?.miEntity ||
    selectedItem?.miEntity ||
    null;
  ```
- **Debug Logging:** Added temporary logging to expose `selectedItem` to `window.__lastSelectedItem` for inspection

### Response Mapping
The `getSignagePlaylist` function correctly preserves MIEntity at both levels:
- `item.miEntity` (from backend)
- `item.asset.miEntity` (from backend asset object)

## Backfill Script

### Location
`apps/core/cardbey-core/scripts/backfillMIForSignage.js`

### Usage
```bash
cd apps/core/cardbey-core
npm run backfill:mi-signage
```

### What It Does

1. **SignageAssets Backfill:**
   - Finds all SignageAssets without MIEntity records
   - Creates MIEntity with:
     - `productType: 'poster'`
     - `role: 'creative_source'`
     - `primaryIntent: 'general_asset_library'`
     - Links via `creativeAssetId`

2. **PlaylistItems Backfill:**
   - Finds all SIGNAGE playlist items without MIEntity records
   - Creates MIEntity with:
     - `productType: 'screen_item'`
     - `role: 'in_store_attractor'`
     - `primaryIntent: 'attract_attention_to_promo'`
     - Links via `screenItemId`

### Idempotency
- Checks for existing MIEntity before creating
- Safe to run multiple times
- Skips existing records

## Verification Steps

### Step 1: Run Backfill
```bash
cd apps/core/cardbey-core
npm run backfill:mi-signage
```

Expected output:
```
[BackfillMI] SignageAssets: X created, Y skipped, Z errors
[BackfillMI] PlaylistItems: X created, Y skipped, Z errors
```

### Step 2: Verify Backend Response

Test the playlist endpoint:
```bash
curl -X GET "http://localhost:3001/api/signage/playlist/{playlistId}?storeId={storeId}&tenantId={tenantId}" \
  -H "Authorization: Bearer {token}"
```

Check that at least one item has:
```json
{
  "items": [
    {
      "id": "...",
      "miEntity": { ... },  // Should be non-null
      "asset": {
        "id": "...",
        "miEntity": { ... }  // Should be non-null
      }
    }
  ]
}
```

### Step 3: Verify Frontend

1. Open Signage → Playlist editor in browser
2. Open DevTools → Console
3. Select a playlist item that should have MI
4. In console, run:
   ```javascript
   window.__lastSelectedItem
   ```
5. Verify it shows:
   ```javascript
   {
     id: "...",
     miEntity: { ... },  // or null
     asset: {
       miEntity: { ... }  // or null
     }
   }
   ```

### Step 4: Check MI Brain Panel

- **Items with MIEntity:** Should display role, productType, intents, capabilities, etc.
- **Items without MIEntity:** Should show "No MI Brain attached to this asset"

## Example Playlist Item JSON

After backfill, a playlist item should look like:

```json
{
  "id": "playlist-item-123",
  "assetId": "asset-456",
  "orderIndex": 0,
  "durationS": 8,
  "miEntity": {
    "id": "mi-entity-789",
    "productId": "playlist-item-123",
    "productType": "screen_item",
    "mediaType": "image",
    "miBrain": {
      "role": "in_store_attractor",
      "primaryIntent": "attract_attention_to_promo",
      "context": {
        "tenantId": "tenant-123",
        "storeId": "store-456",
        "channels": ["cnet_screen"]
      },
      "capabilities": { ... },
      "analyticsPlan": { ... },
      "lifecycle": { ... }
    }
  },
  "asset": {
    "id": "asset-456",
    "url": "https://...",
    "type": "image",
    "miEntity": {
      "id": "mi-entity-789",
      "productId": "playlist-item-123",
      "productType": "screen_item",
      "miBrain": { ... }
    }
  }
}
```

## Cleanup

After verification is complete:

1. Remove or comment out debug logging in `PlaylistPreviewPane.jsx`:
   ```tsx
   // Remove or guard with NODE_ENV check:
   if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
     window.__lastSelectedItem = selectedItem;
     console.log('[PlaylistPreviewPane] Selected item MI data:', ...);
   }
   ```

2. Keep the `window.__lastSelectedItem` assignment behind a development guard for future debugging if needed.

## Troubleshooting

### No MI Data After Backfill

1. **Check Backfill Output:**
   - Verify items were created (not all skipped)
   - Check for errors in backfill output

2. **Verify Endpoint:**
   - Ensure using `/api/signage/playlist/:playlistId` (not `/api/signage-playlists/:playlistId`)
   - Check backend logs for MIEntity fetch errors

3. **Check Frontend Mapping:**
   - Verify `getSignagePlaylist` preserves `miEntity` fields
   - Check browser console for `window.__lastSelectedItem`

### MI Panel Still Shows "No MI Brain"

1. **Verify Data Flow:**
   - Check `window.__lastSelectedItem` in console
   - Verify `miEntity` is non-null

2. **Check MIInspectorPanel:**
   - Ensure it receives `entity` prop correctly
   - Verify it handles null entities gracefully

## Files Modified

### Backend
- `apps/core/cardbey-core/scripts/backfillMIForSignage.js` (new)
- `apps/core/cardbey-core/package.json` (added script)

### Frontend
- `apps/dashboard/cardbey-marketing-dashboard/src/pages/signage/components/PlaylistPreviewPane.jsx` (added debug logging)

## Next Steps

1. Run backfill script in dev environment
2. Verify at least one playlist item has MIEntity
3. Test in UI - MI Brain panel should display data
4. Remove debug logging once confirmed working
5. Run backfill in production when ready
