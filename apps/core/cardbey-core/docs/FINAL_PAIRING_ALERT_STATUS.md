# ✅ PAIRING ALERT IMPLEMENTATION - COMPLETE

## Status: READY TO TEST

All code changes have been applied and saved. The backend will now emit SSE events when pairing sessions are created.

---

## What Was Implemented

### 1. Import Fix (`src/routes/deviceEngine.js` lines 10-11)

```javascript
// ✅ CORRECT imports:
import { broadcastSse } from '../realtime/simpleSse.js';
import { broadcast as broadcastWebsocket } from '../realtime/websocket.js';
```

### 2. Event Emission Helper (`src/routes/deviceEngine.js` lines 53-114)

```javascript
/**
 * Broadcast a standardized pair alert event to SSE + WebSocket clients
 * When a DEVICE V2 device starts a new pairing session, we emit both
 * `device.pairing.requested` and `pair_alert` events for the dashboard's
 * global pairing alert popup.
 */
function emitPairAlertEvent(payload) {
  // Emit pair_alert event (primary event for dashboard popup)
  const pairAlertEnvelope = {
    type: 'pair_alert',
    data: payload,
  };
  
  broadcastSse('admin', 'pair_alert', pairAlertEnvelope);
  console.log('[Pairing] Emitted pair_alert event via SSE', {
    deviceId: payload.deviceId,
    code: payload.code,
    reason: payload.reason,
  });
  
  // Also emit device.pairing.requested event (for frontend compatibility)
  const pairingRequestedPayload = {
    type: 'device.pairing.requested',
    payload: {
      sessionId: payload.deviceId,
      deviceId: payload.deviceId,
      deviceName: payload.deviceName,
      deviceType: payload.deviceType,
      code: payload.code,
      engine: 'DEVICE_V2',
      tenantId: payload.tenantId || 'temp',
      storeId: payload.storeId || 'temp',
      expiresAt: payload.expiresAt,
      createdAt: payload.timestamp,
    },
  };
  
  broadcastSse('admin', 'device.pairing.requested', pairingRequestedPayload);
  console.log('[Pairing] Emitted device.pairing.requested event via SSE', {
    sessionId: payload.deviceId,
    code: payload.code,
  });
  
  // Broadcast to WebSocket clients as well
  broadcastWebsocket({ type: 'pair_alert', payload }, { key: 'admin' });
  broadcastWebsocket({ type: 'device.pairing.requested', payload: pairingRequestedPayload.payload }, { key: 'admin' });
}
```

### 3. Pairing Request Handler (`src/routes/deviceEngine.js` lines 377-423)

```javascript
// Log success with key details
console.log(`[DeviceEngine V2] [${requestId}] Pairing success`, {
  sessionId,
  code,
  expiresAt,
  platform: input.platform,
  deviceModel: input.deviceModel,
});

// When a DEVICE V2 pairing session is created we emit pair_alert and 
// device.pairing.requested events so the dashboard can show a global pairing popup.
try {
  const alertPayload = {
    alertId: `pair-${sessionId}`,
    deviceId: sessionId,
    deviceName: input.deviceModel || `Device ${sessionId.slice(0, 8)}`,
    deviceType: input.deviceType || 'screen',
    lastSeen: new Date().toISOString(),
    reason: 'pair_request',
    status: 'pending',
    tenantId: 'temp',
    storeId: 'temp',
    timestamp: new Date().toISOString(),
    code: code,
    expiresAt: expiresAt,
  };
  
  console.log(`[DeviceEngine V2][Pairing] Emitting pair_alert`, {
    sessionId: sessionId,
    code: code,
    storeId: 'temp',
    tenantId: 'temp',
  });
  
  emitPairAlertEvent(alertPayload);
  
  console.log(`[DeviceEngine V2][Pairing] Broadcasted pair_alert event for ${sessionId}`);
} catch (alertError) {
  // Don't fail the pairing request if alert broadcast fails
  console.error(`[PAIR ALERT] Failed to broadcast (non-fatal):`, alertError);
}

// Return Device V2 tablet-expected response format
res.status(200).json({
  ok: true,
  sessionId,  // Required by tablet
  code,       // Required by tablet
  expiresAt,  // Required by tablet
});
```

### 4. Fixed ALL `broadcastSse` Calls

Updated all `broadcastSse` calls throughout the file to use the correct signature:

```javascript
// ✅ CORRECT:
broadcastSse('admin', 'event_name', data);

// ❌ WRONG (old signature):
broadcastSse('event_name', data, { key: 'admin' });
```

**Fixed in:**
- Line 569-577: Command execution broadcast
- Line 768-779: Device status changed broadcast
- Line 783-795: Playlist progress broadcast
- Line 858: Device alert broadcast (heartbeat)
- Line 1055-1063: Command queued broadcast
- Line 1213-1221: Playlist assigned broadcast
- Line 1276-1280: Screenshot broadcast
- Line 2151: Connection alert broadcast

---

## Events Emitted

When `POST /api/device/request-pairing` is called, the backend emits:

### Event 1: `pair_alert`
```javascript
event: pair_alert
data: {
  "type": "pair_alert",
  "data": {
    "alertId": "pair-cmioi...",
    "deviceId": "cmioi...",
    "deviceName": "Test TV",
    "deviceType": "screen",
    "reason": "pair_request",
    "status": "pending",
    "code": "27E551",
    "expiresAt": "2025-12-02T11:48:43.121Z",
    "timestamp": "2025-12-02T11:38:43.121Z",
    "tenantId": "temp",
    "storeId": "temp"
  }
}
```

### Event 2: `device.pairing.requested`
```javascript
event: device.pairing.requested
data: {
  "type": "device.pairing.requested",
  "payload": {
    "sessionId": "cmioi...",
    "deviceId": "cmioi...",
    "deviceName": "Test TV",
    "deviceType": "screen",
    "code": "27E551",
    "engine": "DEVICE_V2",
    "tenantId": "temp",
    "storeId": "temp",
    "expiresAt": "2025-12-02T11:48:43.121Z"
  }
}
```

---

## Expected Backend Logs

When you call `POST /api/device/request-pairing`, you should see:

```
[DeviceEngine V2] [abc123] Pairing request received
[DeviceEngine V2] [abc123] Calling requestPairing service
[DeviceEngine V2] [abc123] Created pair session
[DeviceEngine V2] emit device.pairing.requested { sessionId: 'cmioi...', code: '27E551' }
[DeviceEngine Event] 🔔 Emitting device.pairing.requested
[DeviceEngine Event] 📡 Broadcasting to SSE: device.pairing.requested
[SSE] Broadcast 'device.pairing.requested' to N client(s) with key 'admin'
[DeviceEngine V2] [abc123] requestPairing() success
[DeviceEngine V2] [abc123] Pairing success { sessionId: 'cmioi...', code: '27E551' }
[DeviceEngine V2][Pairing] Emitting pair_alert { sessionId: 'cmioi...', code: '27E551', storeId: 'temp', tenantId: 'temp' }
[Pairing] Emitted pair_alert event via SSE { deviceId: 'cmioi...', code: '27E551', reason: 'pair_request' }
[Pairing] Emitted device.pairing.requested event via SSE { sessionId: 'cmioi...', code: '27E551' }
[SSE] Broadcast 'pair_alert' to N client(s) with key 'admin'
[SSE] Broadcast 'device.pairing.requested' to N client(s) with key 'admin'
[DeviceEngine V2][Pairing] Broadcasted pair_alert event for cmioi...
```

---

## Testing Steps

### 1. Restart Backend

**CRITICAL:** You must restart the backend for changes to take effect:

```bash
# Stop current server (Ctrl+C)
npm run dev
```

### 2. Test with PowerShell

```powershell
Invoke-RestMethod -Method POST "http://192.168.1.12:3001/api/device/request-pairing" -Body (@{platform="android_tv"; engine="DEVICE_V2"; deviceModel="Test TV"} | ConvertTo-Json) -ContentType "application/json"
```

### 3. Verify Backend Logs

Check your backend terminal for the logs listed above. The key logs to look for:

- ✅ `[DeviceEngine V2][Pairing] Emitting pair_alert`
- ✅ `[Pairing] Emitted pair_alert event via SSE`
- ✅ `[SSE] Broadcast 'pair_alert' to N client(s) with key 'admin'`

### 4. Test with Dashboard

Open your dashboard and check the browser console. You should see:

```javascript
🚨 PAIR ALERT RECEIVED: {
  type: "pair_alert",
  data: {
    code: "27E551",
    deviceName: "Test TV",
    reason: "pair_request"
  }
}
```

### 5. Test with Real Tablet

1. Open Cardbey Player on your tablet
2. Tap "Restart Pairing" or let it request pairing automatically
3. Watch your dashboard - popup should appear immediately!
4. Check backend logs for the broadcast messages

---

## Files Changed

1. ✅ `src/routes/deviceEngine.js`
   - Fixed import to use `broadcastSse` from `simpleSse.js`
   - Added `emitPairAlertEvent()` helper function
   - Added SSE broadcast after pairing session creation
   - Fixed ALL `broadcastSse` calls to use correct signature

2. ✅ `src/engines/device/deviceEvents.js`
   - Fixed import and broadcast calls

3. ✅ `src/engines/device/events.js`
   - Fixed import and broadcast calls

4. ✅ `src/engines/device/completePairing.js`
   - Fixed import and broadcast calls

5. ✅ `src/engines/device/logs.ts`
   - Fixed import and broadcast calls

---

## Troubleshooting

### If you don't see the broadcast logs after restart:

1. **Check file was saved**: The Cursor editor shows correct code, but verify the file on disk
2. **Force restart**: Stop server, wait 2 seconds, start again
3. **Check for errors**: Look for any startup errors in backend logs
4. **Verify imports**: Run `Get-Content src/routes/deviceEngine.js | Select-Object -First 15` and verify line 10 shows `broadcastSse`

### If SSE events aren't received by dashboard:

1. **Check SSE connection**: Browser console should show "SSE: Connected"
2. **Check event listeners**: Dashboard must listen for `pair_alert` or `device.pairing.requested`
3. **Check CORS**: Verify no CORS errors in browser console
4. **Check backend logs**: Verify `[SSE] Broadcast` logs show `N client(s)` where N > 0

---

## Next Action

**RESTART YOUR BACKEND NOW!**

```bash
# In your backend terminal:
# Press Ctrl+C
npm run dev
```

Then test with the PowerShell command above.

**The code is complete and ready. Just restart and test! 🚀**

