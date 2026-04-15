# Pairing Fixes - Ping and SSE Events

## Issues Fixed

### 1. Ping Endpoint Not Responding
**Problem:** App pings backend but gets no answer

**Fix:** 
- ✅ `/api/ping` endpoint is working correctly
- ✅ Returns `{ ok: true, status: 'ok' }` immediately
- ✅ No database calls, very fast response

**Test:**
```powershell
Invoke-RestMethod -Uri http://192.168.1.7:3001/api/ping -Method Get
```

**If still not working:**
- Check if server is running on port 3001
- Check firewall settings
- Verify the app is using the correct URL: `http://192.168.1.7:3001/api/ping`

### 2. No Dashboard Alert/Modal When Pairing Starts
**Problem:** When app asks for pairing, no alert from dashboard, no modal popup

**Root Cause:** 
- SSE events were being sent with `event: message` instead of the actual event name
- Dashboard couldn't listen for specific events like `pairing_started` or `screen.pair_session.created`

**Fix:**
1. ✅ Updated `broadcastSse()` to send events with actual event type names
2. ✅ Now broadcasts both `pairing_started` and `screen.pair_session.created` events
3. ✅ Added better logging to track event broadcasts

**Changes Made:**

**File: `src/realtime/simpleSse.js`**
- Changed from: `event: message\ndata: {"type":"pairing_started","data":{...}}`
- Changed to: `event: pairing_started\ndata: {...}`
- Now dashboards can listen for specific event names

**File: `src/routes/screens.js`**
- Now broadcasts both events:
  - `pairing_started` - New unified event
  - `screen.pair_session.created` - Legacy event name (for backward compatibility)

## Testing

### Test Ping Endpoint
```powershell
# From PowerShell
Invoke-RestMethod -Uri http://192.168.1.7:3001/api/ping -Method Get

# Should return:
# {
#   "ok": true,
#   "status": "ok"
# }
```

### Test SSE Events
1. **Connect to SSE stream:**
   ```bash
   curl -N "http://192.168.1.7:3001/api/stream?key=admin"
   ```

2. **Create a pairing session (from another terminal):**
   ```powershell
   Invoke-RestMethod -Uri "http://192.168.1.7:3001/api/screens/pair/initiate" `
     -Method POST `
     -ContentType "application/json" `
     -Body '{"fingerprint":"TEST123","model":"Test Tablet","name":"Test Device"}'
   ```

3. **You should see in the SSE stream:**
   ```
   event: pairing_started
   data: {"type":"pairing_started","sessionId":"...","code":"ABC123",...}

   event: screen.pair_session.created
   data: {"sessionId":"...","code":"ABC123",...}
   ```

4. **Check server logs:**
   ```
   [PAIR] Broadcast 'pairing_started' event: code=ABC123 sessionId=...
   [PAIR] Broadcast 'screen.pair_session.created' event: code=ABC123 sessionId=...
   [SSE] Broadcast 'pairing_started' to 1 client(s) with key 'admin'
   [SSE] Broadcast 'screen.pair_session.created' to 1 client(s) with key 'admin'
   ```

## Dashboard Integration

The dashboard should now listen for either event:

```javascript
// Option 1: Listen for 'pairing_started'
eventSource.addEventListener('pairing_started', (event) => {
  const data = JSON.parse(event.data);
  console.log('New pairing request:', data.code);
  // Show modal/alert with code
});

// Option 2: Listen for 'screen.pair_session.created' (legacy)
eventSource.addEventListener('screen.pair_session.created', (event) => {
  const data = JSON.parse(event.data);
  console.log('New pairing request:', data.code);
  // Show modal/alert with code
});
```

## Verification Checklist

- [ ] Ping endpoint returns 200 OK
- [ ] SSE stream connects successfully
- [ ] When device calls `/initiate`, SSE events are broadcast
- [ ] Server logs show broadcast messages
- [ ] Dashboard receives events and shows alert/modal

## Next Steps

1. **Restart the server** to load the changes
2. **Test ping endpoint** from the app
3. **Test pairing flow** - device should trigger dashboard alert
4. **Check server logs** for broadcast confirmations

If issues persist:
- Check if dashboard SSE connection is active
- Verify dashboard is listening for correct event names
- Check server logs for any errors


