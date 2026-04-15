# Debugging Tablet "Invalid response: missing credentials" Error

## Current Status

✅ **Backend is working correctly:**
- Status endpoint returns `screenId` and `token` when status is "bound"
- Tested endpoint directly: Returns correct credentials
- Database has credentials stored correctly

❌ **Tablet app still shows error:**
- Tablet displays "Invalid response: missing credentials"
- This suggests the tablet is either:
  1. Using a different sessionId than expected
  2. Checking before session is bound
  3. Having a parsing/validation bug
  4. Receiving a different response than we're testing

## Enhanced Logging Added

**File**: `src/routes/screens.js` (lines 699-743)

Added detailed logging to track:
- IP address of requester
- Full response payload being sent
- Token value (first 20 chars for security)
- Status for both bound and non-bound responses

### What to Look For in Logs

When the tablet polls, you should see logs like:

**For bound sessions:**
```
[PAIR] STATUS bound: screenId=cmi3rfy1d0000jvs8xo0dhwdh token=cmi3rfy1d0000jvs8xo0... (full response: {"ok":true,"sessionId":"...","status":"bound","ttlLeftMs":0,"screenId":"...","token":"..."})
```

**For showing_code sessions:**
```
[PAIR] STATUS showing_code: response={"ok":true,"sessionId":"...","status":"showing_code","ttlLeftMs":300000}
```

## Debugging Steps

### 1. Check Server Logs

Look for the sessionId the tablet is using:
```bash
# Watch logs in real-time
# Look for [PAIR] STATUS entries with the tablet's IP
```

### 2. Verify Tablet SessionId

The tablet should be using the `sessionId` returned from `/pair/initiate`. Check:
- Is the tablet using the correct sessionId?
- Is it using an old sessionId from a previous pairing attempt?

### 3. Check Timing

The error might occur if:
- Tablet polls BEFORE `/pair/complete` finishes
- Tablet polls an old session that's bound but missing credentials
- Race condition between completion and status check

### 4. Test with Tablet's Actual SessionId

Once you identify the sessionId the tablet is using:
```powershell
# Test the exact sessionId the tablet is polling
Invoke-RestMethod -Uri "http://localhost:3001/api/screens/pair/sessions/<TABLET_SESSION_ID>/status" -Method Get | ConvertTo-Json
```

### 5. Check Tablet App Validation Logic

The tablet app might be checking:
- For different field names (e.g., `deviceToken` instead of `token`)
- Before status is "bound"
- For additional fields we're not sending

## Possible Root Causes

### Scenario 1: Wrong SessionId
- Tablet is using an old/incorrect sessionId
- **Solution**: Ensure tablet uses sessionId from `/pair/initiate` response

### Scenario 2: Timing Issue
- Tablet checks status before `/pair/complete` finishes
- **Solution**: Add retry logic or wait before checking

### Scenario 3: Tablet Validation Bug
- Tablet checks for credentials even when status is "showing_code"
- **Solution**: Fix tablet app to only check credentials when status is "bound"

### Scenario 4: Response Parsing Issue
- Tablet receives correct response but fails to parse it
- **Solution**: Check tablet's JSON parsing and field access

## Next Steps

1. **Restart server** to enable enhanced logging
2. **Monitor logs** when tablet polls - look for the sessionId it's using
3. **Compare** the logged response with what tablet expects
4. **Check tablet logs** (if available) to see what it's receiving
5. **Test with tablet's actual sessionId** to verify response

## Expected Behavior

**When status is "bound":**
```json
{
  "ok": true,
  "sessionId": "cmi3vr76h0000jvbcxah1p2v5",
  "status": "bound",
  "ttlLeftMs": 0,
  "screenId": "cmi3rfy1d0000jvs8xo0dhwdh",
  "token": "cmi3rfy1d0000jvs8xo0dhwdh-wrgaxp"
}
```

**When status is "showing_code":**
```json
{
  "ok": true,
  "sessionId": "cmi3vr76h0000jvbcxah1p2v5",
  "status": "showing_code",
  "ttlLeftMs": 300000
}
```

The tablet should only check for `screenId` and `token` when `status === "bound"`.









