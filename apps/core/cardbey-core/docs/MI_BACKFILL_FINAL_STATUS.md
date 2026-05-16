# MI Backfill - Final Implementation Status

## Summary

All implementation steps have been completed. The backfill script is ready but may need Prisma client regeneration.

## Implementation Complete

### ✅ Step 1: Endpoint Confirmed
- **Playlist Editor Uses:** `GET /api/signage/playlist/:playlistId`
- **Status:** ✅ Includes MIEntity at both `item.asset.miEntity` and `item.miEntity`

### ✅ Step 2: Frontend Debug Logging
- **PlaylistPreviewPane:** Added debug logging (exposes `window.__lastSelectedItem`)
- **MI Reading:** ✅ Checks both locations (`item.asset.miEntity` || `item.miEntity`)

### ✅ Step 3: Backfill Script Created
- **Location:** `scripts/backfillMIForSignage.js`
- **Usage:** `npm run backfill:mi-signage`
- **Status:** Script created, but may need Prisma client regeneration

### ⚠️ Step 4: Backfill Script Issue

**Error:** `Cannot read properties of undefined (reading 'findUnique')`

**Root Cause:** `prisma.mIEntity` is undefined, suggesting Prisma client needs regeneration.

**Fix Applied:**
- Changed script to use local `prisma` instance directly instead of `getEntityByLink`
- Added validation check for `prisma.mIEntity` availability

**Next Steps:**
1. **Regenerate Prisma Client:**
   ```bash
   cd apps/core/cardbey-core
   npx prisma generate
   ```

2. **Run Backfill Again:**
   ```bash
   npm run backfill:mi-signage
   ```

3. **Verify Results:**
   - Check database for MIEntity records
   - Test playlist endpoint returns items with `miEntity`

## Files Modified

### Backend
- ✅ `scripts/backfillMIForSignage.js` (new)
- ✅ `package.json` (added `backfill:mi-signage` script)
- ✅ `scripts/checkPlaylistTenant.js` (helper script)

### Frontend
- ✅ `src/pages/signage/components/PlaylistPreviewPane.jsx` (debug logging)

## Verification After Fix

Once Prisma client is regenerated and backfill runs successfully:

1. **Check Database:**
   ```sql
   SELECT COUNT(*) FROM "MIEntity";
   SELECT COUNT(*) FROM "MIEntity" WHERE "creativeAssetId" IS NOT NULL;
   SELECT COUNT(*) FROM "MIEntity" WHERE "screenItemId" IS NOT NULL;
   ```

2. **Test Playlist Endpoint:**
   ```powershell
   $headers = @{ Authorization = "Bearer dev-admin-token" }
   $playlists = irm "http://192.168.1.12:3001/api/signage-playlists" -Headers $headers
   $playlistId = $playlists.items[0].id
   $playlist = irm "http://192.168.1.12:3001/api/signage/playlist/$playlistId" -Headers $headers
   $playlist.playlist.items | Select-Object id, @{n="hasMI";e={!!($_.miEntity) -or !!($_.asset.miEntity)}}
   ```

3. **Check UI:**
   - Open playlist editor
   - Select an item
   - Run: `window.__lastSelectedItem`
   - Verify `miEntity` is present
   - MI Brain panel should display data

## Expected Backfill Results

After successful backfill:
- **SignageAssets:** Should have MIEntity records (role: `creative_source`)
- **PlaylistItems:** Should have MIEntity records (role: `in_store_attractor`)
- **Counts:** Should match number of assets/items processed

## Troubleshooting

If backfill still fails after `npx prisma generate`:

1. **Check Prisma Client:**
   ```bash
   node -e "const {PrismaClient} = require('@prisma/client'); const p = new PrismaClient(); console.log('mIEntity:', typeof p.mIEntity);"
   ```

2. **Verify Migration:**
   ```bash
   npx prisma migrate status
   ```

3. **Check Schema:**
   - Verify `model MIEntity` exists in `prisma/schema.prisma`
   - Model should be named `MIEntity` (Prisma generates as `mIEntity`)
