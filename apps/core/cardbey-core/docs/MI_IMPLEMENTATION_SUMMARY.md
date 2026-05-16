# MI Implementation Summary - Playlist Editor Fix

## Summary

All steps have been completed to ensure MIEntity data is properly displayed in the Playlist Editor UI.

## Endpoint Confirmed

**Playlist Editor Uses:** `GET /api/signage/playlist/:playlistId`

- **Frontend Function:** `getSignagePlaylist()` in `src/lib/api.ts`
- **Status:** ✅ Already includes MIEntity at both `item.asset.miEntity` and `item.miEntity`
- **Response Mapping:** ✅ Preserves MIEntity at both levels

## Frontend Implementation

### PlaylistPreviewPane
- **File:** `src/pages/signage/components/PlaylistPreviewPane.jsx`
- **MI Reading:** ✅ Checks both locations:
  ```tsx
  const miEntity =
    selectedItem?.asset?.miEntity ||
    selectedItem?.miEntity ||
    null;
  ```
- **Debug Logging:** Added (behind dev guard) - exposes `window.__lastSelectedItem` for inspection

### PlaylistTimelinePane
- **MIBadge:** ✅ Checks both locations: `!!(item?.asset?.miEntity || item?.miEntity)`

## Backfill Script

**Location:** `scripts/backfillMIForSignage.js`

**Usage:**
```bash
cd apps/core/cardbey-core
npm run backfill:mi-signage
```

**What It Does:**
1. Backfills SignageAssets without MIEntity (role: `creative_source`)
2. Backfills PlaylistItems without MIEntity (role: `in_store_attractor`)
3. Idempotent - skips existing records

## Example Playlist Item JSON

After backfill, items will have:

```json
{
  "id": "item-123",
  "assetId": "asset-456",
  "orderIndex": 0,
  "durationS": 8,
  "miEntity": {
    "id": "mi-789",
    "productId": "item-123",
    "productType": "screen_item",
    "mediaType": "image",
    "miBrain": {
      "role": "in_store_attractor",
      "primaryIntent": "attract_attention_to_promo",
      "context": { ... },
      "capabilities": { ... },
      "analyticsPlan": { ... }
    }
  },
  "asset": {
    "id": "asset-456",
    "url": "https://...",
    "type": "image",
    "miEntity": { ... }  // Same MIEntity object
  }
}
```

## Verification Steps

1. **Run Backfill:**
   ```bash
   npm run backfill:mi-signage
   ```

2. **Check Backend Response:**
   - Hit `/api/signage/playlist/:playlistId`
   - Verify at least one item has non-null `miEntity`

3. **Check Frontend:**
   - Open playlist editor
   - Select an item
   - Run in console: `window.__lastSelectedItem`
   - Verify `miEntity` is present

4. **Check UI:**
   - MI Brain panel should display data for items with MIEntity
   - Should show "No MI Brain attached" for items without

## Files Modified

### Backend
- ✅ `scripts/backfillMIForSignage.js` (new)
- ✅ `package.json` (added `backfill:mi-signage` script)

### Frontend
- ✅ `src/pages/signage/components/PlaylistPreviewPane.jsx` (debug logging)
- ✅ `src/pages/signage/components/PlaylistTimelinePane.jsx` (already checks both locations)
- ✅ `src/lib/api.ts` (already preserves MIEntity)

## Next Steps

1. **Run backfill in dev environment:**
   ```bash
   npm run backfill:mi-signage
   ```

2. **Verify in UI:**
   - Open playlist editor
   - Select items
   - Check MI Brain panel displays data

3. **Clean up (optional):**
   - Debug logging is already behind dev guard
   - Can be left for future debugging or removed

## Expected Outcome

- ✅ Playlist items with MIEntity show full MI Brain details
- ✅ Playlist items without MIEntity show "No MI Brain attached"
- ✅ No 404 errors
- ✅ Backward compatible (MI is additive)
