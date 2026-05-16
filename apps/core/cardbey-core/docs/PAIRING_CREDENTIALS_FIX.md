# Fix: "Invalid response: missing credentials" Error

## Problem

The tablet app was showing "Invalid response: missing credentials" error even when the session was bound. The status endpoint could return a response with `status: "bound"` but missing `screenId` or `token` fields.

## Root Cause

The status endpoint had a logic flaw:
- It would include `screenId` if status was "bound" and `session.screenId` existed
- But it would only include `token` if `session.deviceToken` existed
- This meant it could return an incomplete response: `{ status: "bound", screenId: "...", token: undefined }`
- The tablet app checks for both fields and shows an error if either is missing

## Solution

**File**: `src/routes/screens.js` (lines 712-736)

### Changes Made

1. **Strict validation**: When status is "bound", the endpoint now requires BOTH `screenId` AND `deviceToken` to be present
2. **Error response**: If either credential is missing, it returns a 500 error with clear details instead of an incomplete response
3. **Better logging**: Logs an error with details when credentials are missing

### Code Changes

**Before:**
```javascript
if (status === 'bound' && session.screenId) {
  payload.screenId = session.screenId;
  let token = session.deviceToken;
  // ... try to get token from Screen if missing ...
  if (token) {
    payload.token = token;
  } else {
    console.warn(`[PAIR] STATUS bound but token missing...`);
  }
}
// Could return { status: "bound", screenId: "...", token: undefined }
```

**After:**
```javascript
if (status === 'bound') {
  if (!session.screenId || !session.deviceToken) {
    // Return error instead of incomplete response
    console.error(`[PAIR] STATUS ERROR: Session ${sessionId} is bound but missing credentials`);
    return res.status(500).json({
      ok: false,
      error: 'bound_session_missing_credentials',
      message: 'Session is bound but credentials are missing.',
      sessionId: session.sessionId,
      hasScreenId: !!session.screenId,
      hasDeviceToken: !!session.deviceToken,
    });
  }
  
  // Both credentials are present - include them
  payload.screenId = session.screenId;
  payload.token = session.deviceToken;
}
// Always returns complete credentials or an error
```

## Benefits

1. **Prevents incomplete responses**: Tablet will never receive a "bound" status without credentials
2. **Clear error messages**: If there's a data integrity issue, we get a clear error instead of silent failure
3. **Better debugging**: Error logs show exactly what's missing
4. **Fail-fast**: Problems are detected immediately instead of causing confusing tablet errors

## Response Formats

### Success (Bound with Credentials)
```json
{
  "ok": true,
  "sessionId": "cmi3vifec0000jvnsqid3lq4s",
  "status": "bound",
  "ttlLeftMs": 0,
  "screenId": "cmi3rfy1d0000jvs8xo0dhwdh",
  "token": "cmi3rfy1d0000jvs8xo0dhwdh-vppplz"
}
```

### Error (Bound but Missing Credentials)
```json
{
  "ok": false,
  "error": "bound_session_missing_credentials",
  "message": "Session is bound but credentials are missing. This indicates a data integrity issue.",
  "sessionId": "cmi3vifec0000jvnsqid3lq4s",
  "hasScreenId": true,
  "hasDeviceToken": false
}
```

## Verification

The `/pair/complete` endpoint already ensures both fields are set:
- Line 942-948: Sets both `screenId` and `deviceToken` when updating session to "bound"
- This fix ensures the status endpoint validates this and fails fast if there's an issue

## Testing

After applying this fix:

1. **Normal flow**: Complete pairing → Status endpoint returns credentials ✅
2. **Data integrity issue**: If somehow a session is "bound" without credentials → Returns clear error ✅
3. **Tablet behavior**: Will either receive credentials or a clear error (no more "missing credentials" confusion) ✅

## Related Files

- `src/routes/screens.js` - Status endpoint handler (lines 712-736)
- `src/routes/screens.js` - Complete endpoint handler (lines 941-948)
- `src/pair/dbSessionStore.js` - Session update function









