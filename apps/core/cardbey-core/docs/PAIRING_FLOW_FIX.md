# Pairing Flow Fix - Two Different Flows Issue

## Problem

The APK and dashboard were using **two different pairing flows**, causing:
- APK shows code "LMVRZT" (from device-initiated flow)
- Dashboard generates a different code (from old dashboard-initiated flow)
- Codes don't match, pairing never completes
- APK gets 404 when submitting code

## Root Cause

1. **APK** was using the **NEW flow**: `POST /api/screens/pair/initiate` (device-initiated)
2. **Dashboard** was using the **OLD flow**: `POST /api/screens/pair/start` (dashboard-initiated, generates different codes)
3. Both flows were active simultaneously, creating conflicting codes

## Solution

### Changes Made

1. **Removed session creation from `/api/screens/hello`**
   - This endpoint now only creates/updates screen records
   - It does NOT create pairing sessions
   - Pairing sessions are ONLY created via `POST /api/screens/pair/initiate`

2. **Deprecated `/api/screens/pair/start` endpoint**
   - Returns 410 error with clear message
   - Directs dashboard to use device-initiated flow

3. **Unified pairing flow** - Now there's only ONE flow:

   **Device-initiated flow (canonical):**
   ```
   1. TV/APK: POST /api/screens/pair/initiate
      → Returns: { sessionId, code: "LMVRZT", ... }
   
   2. TV/APK: Polls GET /api/screens/pair/sessions/:sessionId/status
      → Waits for status: "bound"
   
   3. Dashboard: Listens for SSE event 'pairing_started' OR
      Dashboard: User enters code, calls GET /api/screens/pair/peek/:code
      → Returns: { exists: true, session: { code: "LMVRZT", ... } }
   
   4. Dashboard: POST /api/screens/pair/complete
      → Body: { code: "LMVRZT", name?: "...", location?: "..." }
      → Returns: { screenId, token, session: {...} }
   
   5. TV/APK: Polling detects status: "bound"
      → Gets screenId and token, starts playing
   ```

## Dashboard Integration

The dashboard should:

1. **Listen for SSE events** when devices initiate pairing:
   ```javascript
   eventSource.addEventListener('pairing_started', (event) => {
     const data = JSON.parse(event.data);
     // Show notification: "New device wants to pair: Code LMVRZT"
     // Display the code to the user
   });
   ```

2. **OR allow user to enter code manually**:
   - User sees code on TV/tablet
   - User enters code in dashboard
   - Dashboard calls `GET /api/screens/pair/peek/:code` to verify
   - Dashboard calls `POST /api/screens/pair/complete` to complete

3. **Do NOT call** `POST /api/screens/pair/start` anymore (deprecated)

## Testing

After restarting the server:

1. **APK calls**: `POST /api/screens/pair/initiate`
   - Should get code "LMVRZT" (or similar)

2. **Dashboard should**:
   - Either listen for SSE event and show the code
   - OR allow user to enter the code from the TV

3. **Dashboard calls**: `POST /api/screens/pair/complete` with code "LMVRZT"
   - Should complete pairing and return screenId + token

4. **APK polls**: `GET /api/screens/pair/sessions/:sessionId/status`
   - Should eventually see status: "bound" with screenId and token

## Files Changed

- `src/routes/screens.js`:
  - Removed session creation from `/api/screens/hello`
  - Added deprecated handler for `/api/screens/pair/start`
  - Fixed async/await issues

- `src/screens/routes.js`:
  - Deprecated `/api/screens/pair/start` endpoint
  - Added warnings to old `/api/screens/pair/peek/:code`

## Next Steps

1. **Restart the server** to load the new Prisma client
2. **Update dashboard** to:
   - Remove calls to `POST /api/screens/pair/start`
   - Listen for `pairing_started` SSE events OR allow manual code entry
   - Use `GET /api/screens/pair/peek/:code` and `POST /api/screens/pair/complete`
3. **Test the flow** end-to-end


