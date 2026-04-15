# Dashboard Preview & Popup Fix Guide

## Issues Reported
1. ❌ No popups when pairing starts
2. ❌ No preview screens appear on dashboard
3. ❌ Tablet asking for pair (pairing flow issue)

## Root Causes

### 1. Dashboard SSE Connection
The dashboard needs to connect to the SSE stream to receive real-time events:
- **Endpoint:** `/api/stream?key=admin`
- **Events:** `pairing_started`, `screen.pair_session.created`, `screen:new`, etc.

### 2. Pairing Flow
- Tablet/TV should call: `POST /api/screens/pair/initiate`
- Dashboard should listen for SSE events or poll: `GET /api/screens/pair/peek/:code`
- Dashboard completes pairing: `POST /api/screens/pair/complete`

## Fixes Applied

### ✅ Rate Limits Increased
- **Playlist endpoint:** 10 → 30 requests per 10 seconds (for TV polling)
- **Device hello:** 5 → 20 requests per minute (for device discovery)
- **Pair initiate:** 10 → 30 requests per minute (for device pairing)
- **Better error messages** with retry information

### ✅ Rate Limit Error Messages
Now includes:
- Clear message explaining the limit
- `retryAfter` seconds to wait
- `limit` and `windowSeconds` for debugging

## Dashboard Configuration Required

### 1. Check SSE Connection
The dashboard must connect to:
```
https://cardbey-core.onrender.com/api/stream?key=admin
```

**In dashboard code, verify:**
```typescript
// Should connect to Core API, not via proxy
const sseUrl = `${API_BASE_URL}/api/stream?key=admin`;
const eventSource = new EventSource(sseUrl);
```

### 2. Listen for Pairing Events
```typescript
eventSource.addEventListener('pairing_started', (e) => {
  const data = JSON.parse(e.data);
  // Show popup/modal with pairing code
  showPairingModal(data.code, data.sessionId);
});

eventSource.addEventListener('screen.pair_session.created', (e) => {
  const data = JSON.parse(e.data);
  // Update UI with new pairing session
  updatePairingList(data);
});
```

### 3. Check CORS Configuration
Ensure dashboard origin is whitelisted in Core:
- `https://cardbey-marketing-dashboard.onrender.com`
- Check `src/config/cors.js` for whitelist

## Testing Steps

### 1. Test SSE Connection
```bash
# From browser console or curl
curl -N "https://cardbey-core.onrender.com/api/stream?key=admin"
```

Should see:
```
:ok

:heartbeat 1234567890

event: pairing_started
data: {"code":"ABC123",...}
```

### 2. Test Pairing Flow
1. **Tablet/TV:** Call `POST /api/screens/pair/initiate`
2. **Dashboard:** Should receive SSE event `pairing_started`
3. **Dashboard:** Show popup with code
4. **Dashboard:** User enters code and clicks "Pair"
5. **Dashboard:** Calls `POST /api/screens/pair/complete`
6. **Tablet/TV:** Polls `GET /api/screens/pair/sessions/:sessionId/status` until `status: "bound"`

### 3. Check Browser Console
Open dashboard in browser, check console for:
- SSE connection errors
- CORS errors
- Event reception logs

## Common Issues

### Issue: No SSE Events Received
**Check:**
1. Is SSE connection established? (Check Network tab for `/api/stream`)
2. Is `key=admin` parameter included?
3. Are CORS headers correct?
4. Check backend logs for `[SSE]` messages

### Issue: Popup Not Showing
**Check:**
1. Are event listeners registered?
2. Is the event name correct? (`pairing_started` not `message`)
3. Check browser console for JavaScript errors
4. Verify modal/popup component is mounted

### Issue: Preview Screens Not Appearing
**Check:**
1. Are screens being fetched? `GET /api/screens`
2. Is the screen list component rendering?
3. Check for API errors in Network tab
4. Verify screen data structure matches component expectations

## Debugging Commands

### Check Active Pairing Sessions
```bash
curl "https://cardbey-core.onrender.com/api/screens/pair/active"
```

### Check Screen List
```bash
curl "https://cardbey-core.onrender.com/api/screens"
```

### Test Pairing Initiate
```bash
curl -X POST "https://cardbey-core.onrender.com/api/screens/pair/initiate" \
  -H "Content-Type: application/json" \
  -d '{"fingerprint":"TEST123","model":"Test Device"}'
```

## Next Steps

1. **Verify dashboard SSE connection** - Check if dashboard is connecting to `/api/stream?key=admin`
2. **Check event listeners** - Ensure dashboard is listening for `pairing_started` events
3. **Test pairing flow** - Try pairing a device and verify popup appears
4. **Check logs** - Review backend logs for SSE connection and event broadcasts

## Backend Logs to Monitor

Look for these in Render logs:
```
[SSE] client attached { id: '...', key: 'admin', origin: '...' }
[SSE] Broadcast 'pairing_started' to X client(s) with key 'admin'
[PAIR] INITIATE sessionId=... code=...
```

If you see `[SSE] No clients connected with key 'admin'`, the dashboard is not connected.

