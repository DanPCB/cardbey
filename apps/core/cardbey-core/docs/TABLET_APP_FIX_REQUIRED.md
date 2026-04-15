# Tablet App Fix Required: "Invalid response: missing credentials"

## Backend Status: ✅ WORKING CORRECTLY

The backend is **definitely working correctly**. Logs confirm:

```
[PAIR] STATUS bound: screenId=cmi3rfy1d0000jvs8xo0dhwdh token=cmi3rfy1d0000jvs8x00... 
(full response: {
  "ok":true,
  "sessionId":"cmi3vv4510000jv0kghsjqufg",
  "status":"bound",
  "ttlLeftMs":0,
  "screenId":"cmi3rfy1d0000jvs8xo0dhwdh",
  "token":"cmi3rfy1d0000jvs8xo0dhwdh-8rasvh"
})
```

The backend **IS sending** both `screenId` and `token` when status is "bound".

## Problem: Tablet App Validation Logic

The tablet app is showing "Invalid response: missing credentials" even though the backend is sending the correct response. This indicates a **bug in the tablet app's validation logic**.

## Root Cause Analysis

### Possible Issues in Tablet App:

1. **Checking credentials when status is NOT "bound"**
   - Tablet might be checking for `screenId`/`token` when `status === "showing_code"`
   - These fields should ONLY be checked when `status === "bound"`

2. **Incorrect field name checking**
   - Tablet might be checking for `deviceToken` instead of `token`
   - Tablet might be checking for `screen` instead of `screenId`

3. **Response parsing error**
   - Tablet might not be parsing the JSON response correctly
   - Network issue causing partial response

4. **Timing issue**
   - Tablet might be checking before the response is fully received
   - Race condition in the tablet's polling logic

## Expected Behavior

### When Status is "showing_code":
```json
{
  "ok": true,
  "sessionId": "cmi3vv4510000jv0kghsjqufg",
  "status": "showing_code",
  "ttlLeftMs": 300000
}
```
**Tablet should:** Continue waiting, do NOT check for credentials

### When Status is "bound":
```json
{
  "ok": true,
  "sessionId": "cmi3vv4510000jv0kghsjqufg",
  "status": "bound",
  "ttlLeftMs": 0,
  "screenId": "cmi3rfy1d0000jvs8xo0dhwdh",
  "token": "cmi3rfy1d0000jvs8xo0dhwdh-8rasvh"
}
```
**Tablet should:** Check for `screenId` and `token`, store them, exit pairing screen

## Required Fix in Tablet App

The tablet app's validation logic should be:

```kotlin
// Pseudo-code for correct validation
when (response.status) {
    "showing_code" -> {
        // Continue waiting, do NOT check for credentials
        continuePolling()
    }
    "bound" -> {
        // Only check credentials when status is "bound"
        if (response.screenId != null && response.token != null) {
            // Store credentials and exit pairing
            storeCredentials(response.screenId, response.token)
            exitPairingScreen()
        } else {
            // This should never happen if backend is working correctly
            showError("Invalid response: missing credentials")
        }
    }
    "expired" -> {
        // Session expired, restart pairing
        restartPairing()
    }
}
```

## Current Backend Response Format

The backend **always** returns:

**For "showing_code":**
- `ok`, `sessionId`, `status`, `ttlLeftMs`
- **NO** `screenId` or `token` fields

**For "bound":**
- `ok`, `sessionId`, `status`, `ttlLeftMs`
- **ALWAYS** includes `screenId` and `token` (or returns error if missing)

## Verification Steps

1. **Check tablet app logs** to see what response it's receiving
2. **Verify tablet validation logic** - ensure it only checks credentials when `status === "bound"`
3. **Check field names** - ensure tablet is checking for `token` (not `deviceToken`) and `screenId` (not `screen`)
4. **Add logging** in tablet app to log the exact response received

## Backend Safeguards

The backend now:
- ✅ Always includes credentials when status is "bound"
- ✅ Returns error if credentials are missing when status is "bound"
- ✅ Never includes credentials when status is not "bound"
- ✅ Logs full response for debugging

## Conclusion

**The backend is working correctly.** The issue is in the tablet app's validation logic. The tablet app needs to be fixed to:
1. Only check for credentials when `status === "bound"`
2. Use correct field names (`token`, not `deviceToken`)
3. Properly parse the JSON response









