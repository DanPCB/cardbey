# Device Debug Routes - Implementation Summary

## Overview
Added debug routes and enhanced logging to diagnose why `/api/device/list` returns 0 devices.

## Changes Made

### 1. Debug Route (`src/routes/deviceDebug.js`)
- **Endpoint**: `GET /api/device/debug/list-all`
- **Environment**: Dev only (not available in production)
- **Purpose**: List ALL devices in the database without any filtering

**Features:**
- Queries all devices without tenant/store filtering
- Identifies orphan devices (missing tenant/store or temp values)
- Groups devices by tenant:store for analysis
- Returns detailed device information

**Response:**
```json
{
  "ok": true,
  "count": 5,
  "devices": [...],
  "orphanCount": 2,
  "orphanDevices": [
    {
      "id": "...",
      "tenantId": null,
      "storeId": null,
      "name": "...",
      "status": "..."
    }
  ],
  "groupedByTenantStore": [
    {
      "key": "tenantId:storeId",
      "count": 3,
      "tenantId": "...",
      "storeId": "..."
    }
  ]
}
```

### 2. Enhanced Logging (`src/routes/deviceEngine.js`)
- Added explicit logging of the `where` clause in `/api/device/list`
- Added count logging: `[Device Engine] List devices count=%d`
- Logs the exact Prisma query filters being applied

**Console Output:**
```
[Device Engine] List devices where={ tenantId: '...', storeId: '...' }
[Device Engine] List devices count=0
[Device Engine] Found devices: 0 { tenantId: '...', storeId: '...' }
```

### 3. Server Integration (`src/server.js`)
- Registered debug routes at `/api/device/debug` (dev only)
- Only available when `NODE_ENV !== 'production'`

## Usage

### 1. Check All Devices
```bash
GET /api/device/debug/list-all
```

This will show:
- Total device count in database
- All devices with their tenant/store IDs
- Orphan devices (missing tenant/store)
- Devices grouped by tenant:store

### 2. Check Filtered List
```bash
GET /api/device/list?tenantId=<tenantId>&storeId=<storeId>
```

Check console logs for:
- `[Device Engine] List devices where=...` - Shows exact filters
- `[Device Engine] List devices count=...` - Shows result count

## Diagnosis Steps

1. **Check if devices exist at all:**
   ```bash
   GET /api/device/debug/list-all
   ```
   - If `count: 0`, no devices exist in database
   - If `count > 0`, devices exist but may be filtered out

2. **Check for orphan devices:**
   - Look for `orphanCount > 0` in debug response
   - Orphan devices have `tenantId: null`, `storeId: null`, or `'temp'` values
   - These won't match the filter in `/api/device/list`

3. **Compare tenant/store IDs:**
   - Check `groupedByTenantStore` in debug response
   - Compare with the `tenantId` and `storeId` used in `/api/device/list`
   - Mismatched IDs will result in 0 devices

4. **Verify filter logic:**
   - Check console logs: `[Device Engine] List devices where=...`
   - Verify the `where` clause matches actual device tenant/store IDs
   - Check for any accidental filters (e.g., `status: 'online'`)

## Common Issues

### Issue 1: No Devices in Database
**Symptom**: `GET /api/device/debug/list-all` returns `count: 0`

**Solution**: Devices need to be created/paired first

### Issue 2: Orphan Devices
**Symptom**: `orphanCount > 0` in debug response

**Solution**: 
- Devices with `tenantId: 'temp'` or `storeId: 'temp'` are unpaired
- Devices with `tenantId: null` or `storeId: null` are incomplete
- These need to be properly paired or cleaned up

### Issue 3: Mismatched Tenant/Store IDs
**Symptom**: Devices exist but `/api/device/list` returns 0

**Solution**:
- Check `groupedByTenantStore` in debug response
- Verify the `tenantId` and `storeId` in the query match actual device values
- Ensure IDs are strings (not numbers) and match exactly

### Issue 4: Filter Too Restrictive
**Symptom**: Devices exist but filtered out

**Solution**:
- Check console logs for the `where` clause
- Verify no accidental filters (e.g., `status: 'online'`)
- The current filter only checks `tenantId` and `storeId` (correct)

## Files Created/Modified

### Created:
1. `src/routes/deviceDebug.js` - Debug routes for device diagnostics
2. `docs/DEVICE_DEBUG_ROUTES.md` - This file

### Modified:
1. `src/routes/deviceEngine.js` - Added enhanced logging to `/api/device/list`
2. `src/server.js` - Registered debug routes (dev only)

## Security

- Debug routes are **only available in development** (`NODE_ENV !== 'production'`)
- In production, `/api/device/debug/*` returns 403 Forbidden
- No authentication required for debug routes (dev only)

## Next Steps

1. **Run the server** and test both endpoints:
   ```bash
   GET /api/device/debug/list-all
   GET /api/device/list?tenantId=<id>&storeId=<id>
   ```

2. **Check console logs** for:
   - Device count in database
   - Filter being applied
   - Orphan devices

3. **Compare results** to identify why `/api/device/list` returns 0 devices

4. **Fix data issues** if orphan devices are found (manually, not auto-deleted)



