# Playlist Builder Fix

## Issue

Playlist builder was returning empty playlists when items had missing files. The problem was in the file existence checking logic in `/api/screens/:id/playlist/full`.

**Symptoms:**
- Playlist shows 1 item total
- All items filtered out as "missing files"
- Empty playlist returned (0 items)
- Error: "All items are missing files - playlist is empty due to missing media"

## Root Causes

1. **Filter logic only checked files when `missingFile === true`**: Items with `missingFile === false` or `null` were not verified, leading to false positives/negatives.

2. **Undefined variable bug**: Code referenced `assets` variable that didn't exist, causing logging to fail.

3. **Incomplete file existence checks**: The filter didn't validate URLs before checking file existence.

## Fixes Applied

### 1. Improved Filter Logic (`src/routes/screens.js`)

**Before:**
- Only checked filesystem when `missingFile === true`
- Trusted DB flag for other cases
- Items could pass filter even if files were actually missing

**After:**
- **Always checks file existence** for legacy local files (not just when flag is set)
- Validates that URL exists before checking filesystem
- Updates DB flag based on actual file existence
- More comprehensive checking (handles optimized vs original URLs for videos)

### 2. Fixed Undefined Variable Bug

**Before:**
```javascript
const assetSummary = assets.slice(0, 10).map(...); // ❌ assets undefined
```

**After:**
```javascript
const itemSummary = items.slice(0, 10).map(...); // ✅ Uses items variable
```

### 3. Enhanced Error Logging

Added more detailed logging when items are filtered out:
- Media ID
- Playlist item ID  
- File paths checked (original + optimized)
- Reason for filtering

### 4. Better Edge Case Handling

- Handles empty/null URLs gracefully
- Validates file existence before checking
- Improved status tracking in map function

## Code Changes

### File: `src/routes/screens.js`

**Filter logic (lines 239-310):**
- Always checks file existence for legacy local files
- Validates URLs before filesystem checks
- Updates `missingFile` flag based on actual file state
- Better handling of optimized vs original URLs

**Logging (lines 467-480):**
- Fixed undefined `assets` variable → now uses `items`
- More informative logging

**Status tracking (lines 357-373):**
- Improved file status determination
- Better handling of edge cases

## Testing

To verify the fix works:

1. **Check playlist with missing file:**
   ```bash
   curl http://localhost:3001/api/screens/:screenId/playlist/full
   ```
   - Should show proper logging if files are missing
   - Should include items if `includeMissing=true` query param

2. **Check playlist with valid files:**
   - Should return all items normally
   - Should not filter out existing files

3. **Check logs:**
   - Should see detailed logging about which items are filtered
   - Should see file paths being checked
   - Should see DB flags being updated

## Expected Behavior After Fix

✅ **Valid files**: Included in playlist, `missingFile` flag cleared if incorrect  
✅ **Missing files**: Filtered out (unless `includeMissing=true`), DB flag updated  
✅ **CloudFront URLs**: Always included (trusted, no filesystem check)  
✅ **Empty URLs**: Handled gracefully, skipped with warning  
✅ **Better logging**: Detailed info about why items are filtered

## Next Steps

1. Monitor logs for any remaining issues
2. Run scanner to update missing file flags: `npm run scan:missing-media`
3. Check that playlists with valid files return correctly


