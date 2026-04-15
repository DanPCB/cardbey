# MI Backfill - Manual Execution Steps

## Issue
The backfill script (`npm run backfill:mi-signage`) runs but doesn't show output in PowerShell. This might be a console output buffering issue.

## Manual Verification

### Step 1: Check if Script Actually Ran

The script should create MIEntity records. Check the database:

```sql
-- Check how many MIEntity records exist
SELECT COUNT(*) FROM "MIEntity";

-- Check for SignageAssets with MIEntity
SELECT COUNT(*) FROM "MIEntity" WHERE "creativeAssetId" IS NOT NULL;

-- Check for PlaylistItems with MIEntity  
SELECT COUNT(*) FROM "MIEntity" WHERE "screenItemId" IS NOT NULL;
```

### Step 2: Run Script with Explicit Output

Try running the script with explicit output redirection:

```powershell
cd apps/core/cardbey-core
tsx scripts/backfillMIForSignage.js *> backfill-output.txt
Get-Content backfill-output.txt
```

### Step 3: Test with Simple Query First

Before running full backfill, test if the script can connect:

```powershell
# Test database connection
cd apps/core/cardbey-core
tsx -e "import { PrismaClient } from '@prisma/client'; const p = new PrismaClient(); p.signageAsset.count().then(c => { console.log('Assets:', c); p.\$disconnect(); })"
```

### Step 4: Run Backfill in Smaller Batches

If the script is working but just not showing output, you can verify by:

1. **Check MIEntity count before:**
   ```sql
   SELECT COUNT(*) FROM "MIEntity";
   ```

2. **Run the script:**
   ```bash
   npm run backfill:mi-signage
   ```

3. **Check MIEntity count after:**
   ```sql
   SELECT COUNT(*) FROM "MIEntity";
   ```

If the count increased, the script worked!

## Alternative: Direct Database Query

If the script isn't working, you can manually verify MIEntity creation:

```sql
-- Check existing MIEntity records
SELECT 
  "productType",
  COUNT(*) as count,
  COUNT(CASE WHEN "creativeAssetId" IS NOT NULL THEN 1 END) as assets,
  COUNT(CASE WHEN "screenItemId" IS NOT NULL THEN 1 END) as playlist_items
FROM "MIEntity"
GROUP BY "productType";
```

## Testing Endpoints After Backfill

Once MIEntity records exist, test the endpoints:

```powershell
$headers = @{ Authorization = "Bearer dev-admin-token" }

# List playlists to find one for your tenant/store
$playlists = irm "http://192.168.1.12:3001/api/signage-playlists" -Headers $headers
$playlistId = $playlists.items[0].id

# Get playlist with MI data (add tenant/store params if needed)
$playlist = irm "http://192.168.1.12:3001/api/signage/playlist/$playlistId" -Headers $headers

# Check MI data
$playlist.playlist.items | ForEach-Object {
    [PSCustomObject]@{
        ItemId = $_.id
        HasMI = !!($_.miEntity -or $_.asset.miEntity)
        MIId = if ($_.miEntity) { $_.miEntity.id } elseif ($_.asset.miEntity) { $_.asset.miEntity.id } else { "null" }
    }
}
```

## Expected Results

After successful backfill:
- SignageAssets should have MIEntity records (linked via `creativeAssetId`)
- PlaylistItems should have MIEntity records (linked via `screenItemId`)
- Playlist endpoint should return items with `miEntity` fields populated
- UI should display MI Brain data for items with MIEntity
