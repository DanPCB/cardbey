# Legacy Screen Pairing - FROZEN

## Status: FROZEN ⚠️

The legacy Screen pairing system has been **FROZEN** as of this update. All legacy pairing endpoints now return `410 Gone` errors directing users to DeviceEngine V2.

## What Was Frozen

### Frozen Endpoints

1. **POST /api/screens/pair/initiate** - FROZEN
   - **Old behavior**: Created PairingSession records for legacy players
   - **New behavior**: Returns `410 Gone` error with migration instructions
   - **Replacement**: `POST /api/device/request-pairing`

2. **POST /api/screens/pair/complete** - FROZEN
   - **Old behavior**: Created Screen records for legacy players
   - **New behavior**: Returns `410 Gone` error with migration instructions
   - **Replacement**: `POST /api/device/complete-pairing`

### What Still Works

- **GET /api/screens/pair/peek/:code** - Still works for checking legacy codes (read-only)
- **GET /api/screens/pair/sessions/:sessionId/status** - Still works for legacy devices polling status (read-only)
- Existing paired legacy screens continue to function normally

## Migration to DeviceEngine V2

### For New Devices

All new devices **MUST** use DeviceEngine V2:

1. **Device requests pairing**: `POST /api/device/request-pairing`
   - Returns: `{ ok: true, sessionId, code, expiresAt }`
   
2. **Dashboard completes pairing**: `POST /api/device/complete-pairing`
   - Body: `{ pairingCode, tenantId, storeId, name?, location? }`
   - Returns: `{ ok: true, deviceId, status, type, storeId }`

3. **Devices appear in**: Devices page (NOT legacy Screens page)

### For Dashboard (Devices Page)

The Devices page already uses DeviceEngine V2:
- Uses `completeDevicePairing()` from `deviceClient.ts`
- Calls `POST /api/device/complete-pairing`
- No changes needed ✅

## Error Response Format

When calling frozen endpoints, you'll receive:

```json
{
  "ok": false,
  "error": "ENDPOINT_FROZEN",
  "message": "Legacy Screen pairing is frozen. Please use DeviceEngine V2: POST /api/device/request-pairing...",
  "frozen": true,
  "migration": {
    "oldEndpoint": "POST /api/screens/pair/initiate",
    "newEndpoint": "POST /api/device/request-pairing",
    "documentation": "See DeviceEngine V2 pairing flow documentation"
  }
}
```

## Code Changes

### DeviceEngine V2 (`completePairing.js`)

- **Removed**: Legacy pairing session fallback logic
- **Behavior**: Only processes DeviceEngine V2 pairing codes
- **Error**: Returns clear error if legacy code is used

### Legacy Endpoints (`screens.js`)

- **Frozen**: All pairing creation/completion logic wrapped in `/* FROZEN CODE - DO NOT USE */`
- **Response**: Returns `410 Gone` with migration instructions
- **Preserved**: Code is kept for reference but not executed

## Unfreezing (If Needed)

If legacy pairing needs to be restored:

1. Remove the early return statements in:
   - `apps/core/cardbey-core/src/routes/screens.js` (lines ~1007-1019 for initiate, ~1637-1649 for complete)
   
2. Uncomment the frozen code blocks (remove `/* FROZEN CODE` and `END FROZEN CODE */`)

3. Re-add legacy fallback in:
   - `apps/core/cardbey-core/src/engines/device/completePairing.js`

**Note**: Unfreezing should only be done if explicitly requested and after careful consideration.

## Testing

- ✅ Devices page uses DeviceEngine V2
- ✅ Legacy endpoints return proper frozen errors
- ✅ DeviceEngine V2 endpoints work correctly
- ✅ No legacy fallback in DeviceEngine V2

