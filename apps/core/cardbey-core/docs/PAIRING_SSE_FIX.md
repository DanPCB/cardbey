# Pairing SSE Broadcast Fix

## Problem

The frontend was ready and waiting for pairing session SSE events, but the backend was using the old `broadcast()` function from `sse.js` instead of the new `broadcastSse()` function from `simpleSse.js`. This meant pairing events were not being properly broadcast to dashboard clients.

## Solution

Updated all device engine files to use `broadcastSse()` with the correct signature:

```javascript
// OLD (incorrect):
broadcast('event_name', data, { key: 'admin' });

// NEW (correct):
broadcastSse('admin', 'event_name', data);
```

## Files Changed

### 1. `src/engines/device/deviceEvents.js`
- ✅ Changed import from `broadcast` to `broadcastSse`
- ✅ Updated `emitDeviceEvent()` to use `broadcastSse('admin', type, sseData)`
- ✅ Broadcasts both the specific event type (e.g., `device.pairing.requested`) AND `device_engine_event` for backward compatibility

### 2. `src/engines/device/events.js`
- ✅ Changed import from `broadcast` to `broadcastSse`
- ✅ Updated legacy event emitter to use `broadcastSse('admin', 'device_engine_event', data)`

### 3. `src/engines/device/completePairing.js`
- ✅ Changed import from `broadcast` to `broadcastSse`
- ✅ Updated `device:paired` event broadcast
- ✅ Updated `device:update` event broadcast

### 4. `src/engines/device/logs.ts`
- ✅ Changed import from `broadcast` to `broadcastSse`
- ✅ Updated `device:log` event broadcast

## Events Now Broadcasting Correctly

When a device requests pairing, the following SSE events are now broadcast to dashboard clients:

### Primary Event: `device.pairing.requested`
```javascript
event: device.pairing.requested
data: {
  "type": "device.pairing.requested",
  "payload": {
    "sessionId": "cm...",
    "code": "ABC123",
    "engine": "DEVICE_V2",
    "deviceType": "screen",
    "tenantId": "temp",
    "storeId": "temp",
    "expiresAt": "2025-12-02T10:45:00.000Z",
    "createdAt": "2025-12-02T10:40:00.000Z"
  }
}
```

### Backward Compatibility Event: `device_engine_event`
```javascript
event: device_engine_event
data: {
  "type": "device.pairing.requested",
  "payload": { ... same as above ... }
}
```

## Frontend Integration

Dashboard clients subscribing to `/api/stream?key=admin` can now listen for pairing events:

```javascript
const eventSource = new EventSource('/api/stream?key=admin');

// Listen for specific event type
eventSource.addEventListener('device.pairing.requested', (event) => {
  const data = JSON.parse(event.data);
  console.log('New pairing request:', data);
  showPairingPopup(data.payload);
});

// OR listen for all device engine events
eventSource.addEventListener('device_engine_event', (event) => {
  const data = JSON.parse(event.data);
  if (data.type === 'device.pairing.requested') {
    showPairingPopup(data.payload);
  }
});
```

## Testing

To test the fix:

1. **Start the backend**: `npm run dev`
2. **Connect to SSE stream**: Open browser console and run:
   ```javascript
   const es = new EventSource('http://localhost:3001/api/stream?key=admin');
   es.addEventListener('device.pairing.requested', (e) => {
     console.log('🎉 PAIRING EVENT RECEIVED:', JSON.parse(e.data));
   });
   ```
3. **Trigger pairing**: Send a pairing request from a device or use curl:
   ```bash
   curl -X POST http://localhost:3001/api/device/request-pairing \
     -H "Content-Type: application/json" \
     -d '{
       "deviceModel": "Test Device",
       "platform": "browser-player",
       "appVersion": "1.0.0"
     }'
   ```
4. **Verify**: You should see the pairing event logged in the browser console

## Logs to Look For

When a pairing request is made, you should see these logs:

```
[DeviceEngine V2] [abc123] Emitting device.pairing.requested event
[DeviceEngine Event] 🔔 Emitting device.pairing.requested
[DeviceEngine Event] ✅ Emitted to internal event bus: device.pairing.requested
[DeviceEngine Event] 📡 Broadcasting to SSE: device.pairing.requested
[SSE] Broadcast 'device.pairing.requested' to N client(s) with key 'admin'
[DeviceEngine Event] ✅✅✅ Sent DeviceEngine event type=device.pairing.requested to SSE
```

## Status

✅ **FIXED** - All device engine events are now properly broadcast via SSE using `broadcastSse()`

🎉 **Frontend is ready** - Dashboard will now receive pairing alerts in real-time!

