# Pairing & Alert Testing Guide

## ✅ Backend Status: READY

All SSE broadcasts are now working correctly. The backend will emit events when:
1. A device requests pairing (`device.pairing.requested`)
2. A device is paired/claimed (`device.pairing.claimed`)
3. A device sends a pair alert (`pair_alert`)
4. A device status changes (`device.status.changed`)

---

## Test 1: Verify SSE Connection

### Step 1: Open Browser Console
Open your dashboard in Chrome/Firefox and press F12 to open Developer Tools.

### Step 2: Connect to SSE Stream
Paste this code into the console:

```javascript
// Connect to SSE stream
const es = new EventSource('http://localhost:3001/api/stream?key=admin');

// Log connection status
es.onopen = () => console.log('✅ SSE Connected');
es.onerror = (e) => console.error('❌ SSE Error:', e);

// Listen for ALL events
es.onmessage = (e) => {
  console.log('📨 SSE Message:', e);
};

// Listen for specific pairing events
es.addEventListener('device.pairing.requested', (e) => {
  const data = JSON.parse(e.data);
  console.log('🎉 PAIRING REQUEST:', data);
  alert(`New device wants to pair!\nCode: ${data.payload.code}\nDevice: ${data.payload.deviceType}`);
});

es.addEventListener('pair_alert', (e) => {
  const data = JSON.parse(e.data);
  console.log('🚨 PAIR ALERT:', data);
  alert(`Device needs help!\nDevice: ${data.data.deviceId}\nReason: ${data.data.reason}`);
});

es.addEventListener('device.pairing.claimed', (e) => {
  const data = JSON.parse(e.data);
  console.log('✅ DEVICE PAIRED:', data);
});

console.log('👂 Listening for pairing events...');
```

**Expected Output:**
```
✅ SSE Connected
👂 Listening for pairing events...
```

---

## Test 2: Trigger Pairing Request

### Option A: Using curl (Recommended)

```bash
curl -X POST http://localhost:3001/api/device/request-pairing \
  -H "Content-Type: application/json" \
  -d '{
    "deviceModel": "Test TV",
    "platform": "android_tv",
    "appVersion": "1.0.0"
  }'
```

**Expected Response:**
```json
{
  "ok": true,
  "sessionId": "cm...",
  "code": "ABC123",
  "expiresAt": "2025-12-02T11:00:00.000Z"
}
```

**Expected in Browser Console:**
```
🎉 PAIRING REQUEST: {
  type: "device.pairing.requested",
  payload: {
    sessionId: "cm...",
    code: "ABC123",
    engine: "DEVICE_V2",
    deviceType: "screen",
    tenantId: "temp",
    storeId: "temp",
    expiresAt: "2025-12-02T11:00:00.000Z"
  }
}
```

**Expected Alert Popup:**
```
New device wants to pair!
Code: ABC123
Device: screen
```

### Option B: Using Your Tablet/Device

1. Open the Cardbey Player app on your tablet
2. It should automatically request pairing
3. Watch the browser console for the `device.pairing.requested` event
4. The dashboard should show a popup with the pairing code

---

## Test 3: Trigger Pair Alert

This simulates a device that lost connection and is asking for help.

```bash
curl -X POST http://localhost:3001/api/device/pair-alert \
  -H "Content-Type: application/json" \
  -d '{
    "deviceId": "YOUR_DEVICE_ID_HERE",
    "deviceType": "screen",
    "ip": "192.168.1.100",
    "reason": "connection_lost"
  }'
```

**Note:** Replace `YOUR_DEVICE_ID_HERE` with an actual device ID from your Devices page.

**Expected in Browser Console:**
```
🚨 PAIR ALERT: {
  type: "pair_alert",
  data: {
    alertId: "cm...",
    deviceId: "cm...",
    deviceName: "JVCTV",
    deviceType: "screen",
    lastSeen: "2025-12-02T10:30:00.000Z",
    reason: "connection_lost",
    status: "pending",
    timestamp: "2025-12-02T10:35:00.000Z"
  }
}
```

**Expected Alert Popup:**
```
Device needs help!
Device: cm...
Reason: connection_lost
```

---

## Test 4: Complete Pairing Flow

### Step 1: Device Requests Pairing
```bash
curl -X POST http://localhost:3001/api/device/request-pairing \
  -H "Content-Type: application/json" \
  -d '{
    "deviceModel": "Living Room TV",
    "platform": "android_tv",
    "appVersion": "1.0.0"
  }'
```

Save the `code` from the response (e.g., "ABC123").

### Step 2: Dashboard Claims Device
```bash
curl -X POST http://localhost:3001/api/device/complete-pairing \
  -H "Content-Type: application/json" \
  -d '{
    "pairingCode": "ABC123",
    "tenantId": "test-tenant",
    "storeId": "test-store",
    "name": "Living Room TV",
    "location": "Living Room"
  }'
```

**Expected Events in Console:**
1. `device.pairing.requested` (from Step 1)
2. `device.pairing.claimed` (from Step 2)
3. `device:paired` (legacy event)
4. `device:update` (status update)

---

## Test 5: Check Backend Logs

Look for these log messages in your backend console:

### When Pairing Requested:
```
[DeviceEngine V2] [abc123] Emitting device.pairing.requested event
[DeviceEngine Event] 🔔 Emitting device.pairing.requested
[DeviceEngine Event] 📡 Broadcasting to SSE: device.pairing.requested
[SSE] Broadcast 'device.pairing.requested' to 1 client(s) with key 'admin'
[DeviceEngine Event] ✅✅✅ Sent DeviceEngine event type=device.pairing.requested to SSE
```

### When Pair Alert Sent:
```
[PAIR ALERT] Device cm123 connection_lost. Broadcasting to dashboard...
[SSE] Broadcast 'pair_alert' to 1 client(s) with key 'admin'
```

---

## Troubleshooting

### ❌ "SSE Error" in Console
**Problem:** Cannot connect to SSE stream

**Solutions:**
1. Check backend is running: `npm run dev`
2. Verify URL is correct: `http://localhost:3001/api/stream?key=admin`
3. Check CORS settings in backend
4. Try different browser (Chrome recommended)

### ❌ No Events Received
**Problem:** Connected but no events coming through

**Solutions:**
1. Check backend logs for broadcast messages
2. Verify you're using `key=admin` in the SSE URL
3. Try triggering a pairing request with curl
4. Check if events are being emitted: Look for `[SSE] Broadcast` logs

### ❌ "Device not found" Error
**Problem:** Pair alert fails because device doesn't exist

**Solutions:**
1. Get a valid device ID from the Devices page
2. Or create a device first by requesting pairing
3. Use the `sessionId` returned from request-pairing as the `deviceId`

### ❌ Events Received but No Popup
**Problem:** Console shows events but dashboard doesn't react

**Solutions:**
1. Check if your dashboard code is listening for the correct event names:
   - `device.pairing.requested` (NOT `pairing_started`)
   - `pair_alert` (NOT `device:alert`)
2. Verify the event handler is registered before the event fires
3. Check browser console for JavaScript errors

---

## Integration with Dashboard

Your dashboard should listen for these events:

```typescript
// In your dashboard SSE setup
const eventSource = new EventSource(`${API_BASE_URL}/api/stream?key=admin`);

// Pairing request - show popup with code
eventSource.addEventListener('device.pairing.requested', (event) => {
  const { payload } = JSON.parse(event.data);
  showPairingPopup({
    code: payload.code,
    sessionId: payload.sessionId,
    deviceType: payload.deviceType,
    expiresAt: payload.expiresAt
  });
});

// Pair alert - show device needs help
eventSource.addEventListener('pair_alert', (event) => {
  const { data } = JSON.parse(event.data);
  showAlertPopup({
    deviceId: data.deviceId,
    deviceName: data.deviceName,
    reason: data.reason,
    lastSeen: data.lastSeen
  });
});

// Device paired - update UI
eventSource.addEventListener('device.pairing.claimed', (event) => {
  const { payload } = JSON.parse(event.data);
  refreshDeviceList();
  showSuccessMessage(`${payload.name} paired successfully!`);
});
```

---

## Success Criteria

✅ SSE connection established (see "✅ SSE Connected" in console)
✅ Pairing request triggers `device.pairing.requested` event
✅ Pair alert triggers `pair_alert` event
✅ Backend logs show broadcast messages
✅ Browser shows alert popups (if using test code above)
✅ Dashboard receives events and updates UI

---

## Next Steps

Once you verify the backend is sending events correctly:

1. **Update Dashboard Code** to listen for:
   - `device.pairing.requested` (not `pairing_started`)
   - `pair_alert` (not `device:alert`)

2. **Implement Popup UI** to show:
   - Pairing code when device requests pairing
   - Alert message when device needs help
   - Success message when device is paired

3. **Add Sound Effects** 🔊
   - Play a sound when `device.pairing.requested` is received
   - Play a different sound for `pair_alert`

4. **Test End-to-End**
   - Use real tablet/TV device
   - Verify popup appears immediately
   - Complete pairing from dashboard
   - Verify device appears in Devices list

---

## Status

🎉 **Backend: READY** - All SSE events are being broadcast correctly!
⏳ **Frontend: WAITING** - Dashboard needs to listen for the correct event names
🔊 **Sound: TODO** - Add audio alerts when events are received

