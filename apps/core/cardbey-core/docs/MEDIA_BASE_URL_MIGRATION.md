# Media Base URL Migration Script

## Overview
Migration script to fix media URLs that point to old IP addresses and update them to the current base URL.

## Problem
Some media assets in the database have URLs pointing to old IP addresses:
- `http://192.168.1.12:3001`
- `http://192.168.1.9:3001`

These need to be updated to the current base URL:
- `http://192.168.1.3:3001`

## Models Scanned

The script scans and updates URLs in the following Prisma models:

1. **Media** - `url` and `optimizedUrl` fields
2. **SignageAsset** - `url` field
3. **MIEntity** - `fileUrl` and `previewUrl` fields

## Usage

### Step 1: Dry Run (Default)
```bash
npm run fix:media-base-url
```

This will:
- Scan all models for old base URLs
- Log which records would be updated
- **NOT make any changes** (DRY_RUN = true by default)

### Step 2: Review Output
Check the console output to see:
- How many records were found
- Which records would be updated
- Old and new URLs for each record

### Step 3: Perform Updates
1. Open `scripts/fixMediaBaseUrl.js`
2. Set `DRY_RUN = false` at the top of the file
3. Run again:
   ```bash
   npm run fix:media-base-url
   ```

## Configuration

Edit the script to change old/new base URLs:

```javascript
const OLD_BASE_URLS = [
  'http://192.168.1.12:3001',
  'http://192.168.1.9:3001',
  'http://192.168.1.12:3001/',
  'http://192.168.1.9:3001/',
];

const NEW_BASE_URL = 'http://192.168.1.3:3001';
```

## Example Output

```
🚀 Starting Media Base URL Migration

Mode: 🔍 DRY RUN (no changes will be made)

Old Base URLs: http://192.168.1.12:3001, http://192.168.1.9:3001, ...
New Base URL: http://192.168.1.3:3001

============================================================

🔍 Scanning Media model for old base URLs...

📊 Found 0 Media records with old base URLs

============================================================

🔍 Scanning SignageAsset model for old base URLs...

📊 Found 0 SignageAsset records with old base URLs

============================================================

🔍 Scanning MIEntity model for old base URLs...

📊 Found 2 MIEntity records with old base URLs

  📝 MIEntity cmj02iit6000bjvkwvlkqin5o:
     Old fileUrl: http://192.168.1.12:3001/uploads/media/1765374697849-953c7a03.mp4
     New fileUrl: http://192.168.1.3:3001/uploads/media/1765374697849-953c7a03.mp4
     Old previewUrl: http://192.168.1.12:3001/uploads/media/1765374697849-953c7a03.mp4
     New previewUrl: http://192.168.1.3:3001/uploads/media/1765374697849-953c7a03.mp4
     ⚠️  [DRY RUN] Would update MIEntity cmj02iit6000bjvkwvlkqin5o

============================================================

📊 Summary:

Media:
  Total scanned: 0
  Would update: 0
  Skipped: 0

SignageAsset:
  Total scanned: 0
  Would update: 0
  Skipped: 0

MIEntity:
  Total scanned: 2
  Would update: 2
  Skipped: 0

Total:
  Total scanned: 2
  Total would update: 2

⚠️  DRY RUN mode - no changes were made
Set DRY_RUN = false and run again to perform updates
```

## Safety Features

1. **DRY_RUN mode by default** - No changes are made unless explicitly disabled
2. **Deduplication** - Removes duplicate records found in multiple queries
3. **Error handling** - Catches and logs errors without stopping the script
4. **Detailed logging** - Shows exactly what would be changed

## Files

- **Script**: `scripts/fixMediaBaseUrl.js`
- **Package script**: `npm run fix:media-base-url`
- **Documentation**: `docs/MEDIA_BASE_URL_MIGRATION.md`

## After Migration

1. **Reload the dashboard Asset Library** to see updated URLs
2. **Verify** that `normalizedUrl`/`safeUrl` now use `http://192.168.1.3:3001/uploads/...`
3. **Check console logs** - warning logs about old IPs should disappear

## Future Prevention

To prevent this issue in the future:
- Store only relative paths (`/uploads/...`) in the database
- Add base host at runtime from configuration (e.g., `PUBLIC_BASE_URL`)
- Use `normalizeMediaUrlForStorage()` utility (already exists in `src/utils/publicUrl.js`)



