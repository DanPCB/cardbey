# Device Pairing Requested Event - Backend Implementation

## Overview

The backend now emits a `device.pairing.requested` SSE event when a DeviceEngine V2 tablet requests pairing. This event triggers the "New device wants to pair" popup on the Devices page.

## Event Details

### Event Type
- **Primary**: `device.pairing.requested`
- **Fallback**: `device_engine_event` (with `data.type === 'device.pairing.requested'`)

### Event Format

The event is broadcast via SSE with key `'admin'` in the following format:

```javascript
// Event type: 'device.pairing.requested'
// Data payload:
{
  type: 'device.pairing.requested',
  payload: {
    sessionId: string,      // Device ID (acts as session ID)
    code: string,           // 6-character pairing code (e.g., "F35D76")
    engine: "DEVICE_V2",    // Always "DEVICE_V2" for this event
    deviceType: string,     // Device type: "screen", "pos", "drone", "robot", "other"
    tenantId: string,       // Always "temp" initially (set during complete-pairing)
    storeId: string,        // Always "temp" initially (set during complete-pairing)
    expiresAt: string,      // ISO 8601 timestamp when code expires (10 minutes from creation)
    createdAt: string,      // ISO 8601 timestamp when session was created
  }
}
```

### SSE Broadcast

The event is broadcast in two ways for compatibility:

1. **Direct event type**: `device.pairing.requested`
   ```javascript
   // Frontend can listen with:
   eventSource.addEventListener('device.pairing.requested', (e) => {
     const data = JSON.parse(e.data);
     // data.type === 'device.pairing.requested'
     // data.payload contains the event payload
   });
   ```

2. **Generic event type**: `device_engine_event`
   ```javascript
   // Frontend can listen with:
   eventSource.addEventListener('device_engine_event', (e) => {
     const data = JSON.parse(e.data);
     if (data.type === 'device.pairing.requested') {
       // Handle pairing request
     }
   });
   ```

## Backend Implementation

### Location
- **Handler**: `src/engines/device/requestPairing.js` (lines 184-213)
- **Event Emitter**: `src/engines/device/deviceEvents.js`
- **SSE Broadcast**: `src/realtime/sse.js` → `src/realtime/simpleSse.js`

### Logging

The backend logs the event emission in core logs:

```javascript
console.log(`[DeviceEngine V2] emit device.pairing.requested`, {
  sessionId: eventPayload.sessionId,
  code: eventPayload.code,
  tenantId: eventPayload.tenantId,
  storeId: eventPayload.storeId,
  engine: eventPayload.engine,
  deviceType: eventPayload.deviceType,
  expiresAt: eventPayload.expiresAt,
  createdAt: eventPayload.createdAt,
});
```

### When Event is Emitted

The event is emitted when:
1. A DeviceEngine V2 tablet calls `POST /api/device/request-pairing`
2. A device record is successfully created with a pairing code
3. The pairing code is generated and stored

### Event Flow

```
Tablet → POST /api/device/request-pairing
  ↓
requestPairing() creates device record
  ↓
emitDeviceEvent({ type: 'device.pairing.requested', payload: {...} })
  ↓
broadcast('device.pairing.requested', data, { key: 'admin' })
  ↓
SSE clients with key='admin' receive event
  ↓
Frontend Devices page shows popup
```

## Frontend Integration Guide

### 1. Listen for the Event

```javascript
// Option 1: Listen to specific event type
eventSource.addEventListener('device.pairing.requested', (e) => {
  const data = JSON.parse(e.data);
  handleDevicePairingRequested(data.payload);
});

// Option 2: Listen to generic device_engine_event
eventSource.addEventListener('device_engine_event', (e) => {
  const data = JSON.parse(e.data);
  if (data.type === 'device.pairing.requested') {
    handleDevicePairingRequested(data.payload);
  }
});
```

### 2. Filter by Engine

Only process events where `payload.engine === 'DEVICE_V2'`:

```javascript
function handleDevicePairingRequested(payload) {
  // Guard: only process DEVICE_V2 events
  if (payload.engine !== 'DEVICE_V2') {
    return;
  }
  
  // Guard: require code and sessionId
  if (!payload.code || !payload.sessionId) {
    return;
  }
  
  // Show popup, play sound, etc.
}
```

### 3. Debounce Logic

Use a ref to track seen session IDs:

```javascript
const seenSessionIdsRef = useRef(new Set());

function handleDevicePairingRequested(payload) {
  // Skip if already seen
  if (seenSessionIdsRef.current.has(payload.sessionId)) {
    return;
  }
  
  // Mark as seen
  seenSessionIdsRef.current.add(payload.sessionId);
  
  // Show alert
  setAlert(payload);
  playSound();
}
```

### 4. Store/Tenant Filtering

If the Devices page filters by store/tenant, only show alerts that match:

```javascript
function handleDevicePairingRequested(payload) {
  const currentStoreId = useStoreId(); // Your store context
  const currentTenantId = useTenantId(); // Your tenant context
  
  // If filtering by store, only show matching events
  // Note: Initially tenantId/storeId are "temp", so you may want to show all
  // or wait until complete-pairing sets real values
  if (currentStoreId && payload.storeId !== 'temp' && payload.storeId !== currentStoreId) {
    return;
  }
  
  // Show alert
}
```

## Testing

### Backend Logs

When a tablet requests pairing, you should see:

```
[DeviceEngine V2] emit device.pairing.requested {
  sessionId: 'cm123...',
  code: 'F35D76',
  tenantId: 'temp',
  storeId: 'temp',
  engine: 'DEVICE_V2',
  deviceType: 'screen',
  expiresAt: '2024-01-01T12:10:00.000Z',
  createdAt: '2024-01-01T12:00:00.000Z'
}
```

### Frontend Verification

1. Open Devices page
2. Connect to SSE stream with key='admin'
3. Request pairing from tablet
4. Verify event is received
5. Verify popup appears with code
6. Verify sound plays
7. Verify "Open Pair Device" button pre-fills modal

## Related Events

- `device.pairing.claimed` - Emitted when pairing is completed via `POST /api/device/complete-pairing`
- `device.status.changed` - Emitted when device status changes (online/offline)

## Notes

- The event is broadcast with key `'admin'` for dashboard access
- Events are non-blocking - pairing continues even if event emission fails
- The pairing code expires 10 minutes after creation
- Initially, `tenantId` and `storeId` are `"temp"` until `complete-pairing` is called


