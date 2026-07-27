# Device Connection Alert API

## Overview

When a TV/device agent detects repeated Core API failures or request timeouts, it can send a connection alert to the backend. The backend records the alert and emits an SSE/WebSocket event that the dashboard can subscribe to for displaying popup notifications.

## Endpoints

### POST /api/device/pair-alert

Fail-safe endpoint that devices call after they lose contact with `/api/device/heartbeat` for more than a few seconds. This is the signal Core uses to pop a pairing alert in the dashboard.

**Request Body:**
```json
{
  "deviceId": "cmxxxx",
  "deviceType": "screen",
  "ip": "192.168.1.22",
  "reason": "connection_lost"
}
```

**Fields:**
- `deviceId` (required, string): Device ID
- `deviceType` (optional, string): Reported hardware type (`screen`, `tablet`, etc.)
- `ip` (optional, string): Device-side IP that detected the outage
- `reason` (required, enum): `"connection_lost"` or `"pair_request"`

**Response (202):**
```json
{
  "ok": true,
  "alert": {
    "id": "cmxxxx",
    "deviceId": "cmxxxx",
    "type": "connection_lost",
    "reason": "connection_lost",
    "status": "pending",
    "createdAt": "2025-01-27T12:00:00.000Z"
  }
}
```

**Behavior:**
1. Validates the device exists and has an active binding if one is present
2. Creates a `DeviceAlert` record (`status = "pending"`, `type = reason`)
3. Emits SSE/WebSocket event `pair_alert` with payload `{ deviceId, deviceType, deviceName, lastSeen, reason, timestamp }`
4. Logs `[PAIR ALERT] Device <id> <reason>. Broadcasting to dashboard...`

---

### POST /api/device/connection-alert

Device-initiated endpoint for reporting connection/API issues.

**Request Body:**
```json
{
  "deviceId": "cmxxxx",
  "type": "connection_error",
  "message": "Request timed out while fetching /api/screens/.../playlist/full",
  "engineVersion": "DEVICE v2",
  "env": "DEV"
}
```

**Fields:**
- `deviceId` (required, string): Device ID
- `type` (required, string): Alert type, e.g., `"connection_error"`, `"playlist_error"`, `"storage_error"`, `"other"`
- `message` (required, string): Alert description
- `engineVersion` (optional, string): Device engine version (e.g., "DEVICE v2")
- `env` (optional, string): Environment (e.g., "DEV", "PROD")

**Response (201):**
```json
{
  "ok": true,
  "alert": {
    "id": "cmxxxx",
    "deviceId": "cmxxxx",
    "type": "connection_error",
    "message": "Request timed out while fetching /api/screens/.../playlist/full",
    "engineVersion": "DEVICE v2",
    "env": "DEV",
    "resolved": false,
    "createdAt": "2025-01-27T12:00:00.000Z"
  }
}
```

**Errors:**
- `400`: Missing required fields (`deviceId`, `type`, or `message`)
- `404`: Device not found
- `500`: Internal server error

**Behavior:**
1. Validates device exists
2. Creates a `DeviceAlert` record in the database
3. Updates device status to `"degraded"` if type is `"connection_error"`
4. Emits SSE/WebSocket event `"device:alert"` to all connected dashboard clients
5. Creates a device log entry for audit trail

---

### POST /api/device/heartbeat (Enhanced)

The heartbeat endpoint now accepts an optional `alert` payload, allowing devices to batch alerts with heartbeats when the connection recovers.

**Request Body:**
```json
{
  "deviceId": "cmxxxx",
  "status": "online",
  "engineVersion": "DEVICE v2",
  "alert": {
    "type": "connection_error",
    "message": "Last playlist request timed out"
  }
}
```

**Alert Payload:**
- `alert.type` (required, string): Alert type
- `alert.message` (required, string): Alert description

When `alert` is present, the endpoint:
1. Creates a `DeviceAlert` record
2. Updates device status to `"degraded"` if type is `"connection_error"`
3. Emits `"device:alert"` SSE event
4. Creates a device log entry

The heartbeat request continues normally even if alert processing fails (errors are logged but don't block the heartbeat).

---

## SSE/WebSocket Events

### Event: `pair_alert`

Triggered when `/api/device/pair-alert` succeeds. This is what powers the dashboard popup.

**SSE Frame:**
```
event: pair_alert
data: {
  "type": "pair_alert",
  "data": {
    "alertId": "cmxxxx",
    "deviceId": "cmxxxx",
    "deviceType": "screen",
    "deviceName": "Lobby TV",
    "lastSeen": "2025-01-27T11:58:00.000Z",
    "reason": "connection_lost",
    "timestamp": "2025-01-27T12:00:00.000Z"
  }
}
```

**WebSocket Frame:**
```json
{
  "type": "pair_alert",
  "payload": {
    "deviceId": "cmxxxx",
    "deviceType": "screen",
    "deviceName": "Lobby TV",
    "lastSeen": "2025-01-27T11:58:00.000Z",
    "reason": "connection_lost",
    "timestamp": "2025-01-27T12:00:00.000Z"
  }
}
```

Dashboard clients should listen for `event: pair_alert` (SSE) or `message.type === 'pair_alert'` (WebSocket) and display the pairing alert UI immediately.

### Event: `device:alert` (legacy)

Emitted when a connection alert is created directly (via `/connection-alert` or heartbeat with alert payload). Existing dashboards can continue to listen for `device:alert` for backward compatibility.

**Payload:**
```json
{
  "id": "cmxxxx",
  "deviceId": "cmxxxx",
  "type": "connection_error",
  "status": "pending",
  "message": "Request timed out while fetching /api/screens/.../playlist/full",
  "createdAt": "2025-01-27T12:00:00.000Z",
  "engineVersion": "DEVICE v2",
  "env": "DEV"
}
```

---

## Database Schema

### DeviceAlert Model

```prisma
model DeviceAlert {
  id            String   @id @default(cuid())
  deviceId      String
  device        Device   @relation(fields: [deviceId], references: [id], onDelete: Cascade)
  type          String   // 'connection_lost' | 'pair_request' | legacy alert codes
  status        String   @default("pending") // 'pending' | 'acknowledged'
  reason        String?  // Reason code mirrored from device payload
  message       String?  // Optional human-readable description
  deviceType    String?  // Cached hardware type
  ip            String?  // Device reported IP
  engineVersion String?  // Device engine version (e.g., "DEVICE v2")
  env           String?  // Environment (e.g., "DEV", "PROD")
  resolved      Boolean  @default(false) // Legacy flag derived from status
  createdAt     DateTime @default(now())
  resolvedAt    DateTime?

  @@index([deviceId])
  @@index([deviceId, createdAt])
  @@index([type])
  @@index([status])
  @@index([createdAt])
}
```

---

## Client Integration

### Android/TV App Integration

When the device app shows "Request timed out. Check network or API URL", it should:

0. **Fail-safe (heartbeat unreachable for >X seconds):**
   ```http
   POST /api/device/pair-alert
   Content-Type: application/json
   
   {
     "deviceId": "<device-id>",
     "deviceType": "screen",
     "ip": "192.168.1.22",
     "reason": "connection_lost"
   }
   ```
   This immediately raises the dashboard popup.

1. **Immediate alert (if connection available):**
   ```http
   POST /api/device/connection-alert
   Content-Type: application/json
   
   {
     "deviceId": "<device-id>",
     "type": "connection_error",
     "message": "Request timed out – device cannot reach Core API",
     "engineVersion": "DEVICE v2",
     "env": "DEV"
   }
   ```

2. **Batch with heartbeat (when connection recovers):**
   ```http
   POST /api/device/heartbeat
   Content-Type: application/json
   
   {
     "deviceId": "<device-id>",
     "status": "online",
     "alert": {
       "type": "connection_error",
       "message": "Last playlist request timed out"
     }
   }
   ```

---

## Testing

### Manual Test: Pair Alert

```bash
curl -X POST http://localhost:3001/api/device/pair-alert \
  -H "Content-Type: application/json" \
  -d '{
    "deviceId": "<an-existing-device-id>",
    "deviceType": "screen",
    "ip": "192.168.1.22",
    "reason": "connection_lost"
  }'
```

**Expected:**
- Response: `202 Accepted` with alert object (`status = "pending"`)
- Database: `DeviceAlert` record created
- SSE/WebSocket: `pair_alert` event broadcast to connected dashboards
- Logs: `[PAIR ALERT] Device <id> connection_lost. Broadcasting to dashboard...`

### Manual Test: Connection Alert

```bash
# Create a connection alert
curl -X POST http://localhost:3001/api/device/connection-alert \
  -H "Content-Type: application/json" \
  -d '{
    "deviceId": "<an-existing-device-id>",
    "type": "connection_error",
    "message": "Manual test alert",
    "engineVersion": "DEVICE v2",
    "env": "DEV"
  }'
```

**Expected:**
- Response: `201 Created` with alert object
- Database: `DeviceAlert` record created
- SSE: `device:alert` event broadcast to connected clients
- Device status: Updated to `"degraded"` if type is `"connection_error"`

### Verify SSE Event

Connect to the SSE stream:
```bash
curl -N http://localhost:3001/api/stream?key=admin
```

After creating an alert, you should see:
```
event: device:alert
data: {"id":"...","deviceId":"...","type":"connection_error",...}
```

---

## TypeScript Types

```typescript
/**
 * Device alert payload for POST /api/device/connection-alert
 */
export interface DeviceAlertPayload {
  deviceId: string;
  type: 'connection_error' | 'playlist_error' | 'storage_error' | 'other';
  message: string;
  engineVersion?: string;
  env?: string;
}

/**
 * Device alert event emitted via SSE/WebSocket
 */
export interface DeviceAlertEvent {
  event: 'device:alert';
  payload: {
    id: string;
    deviceId: string;
    type: string;
    message: string;
    createdAt: string;
    engineVersion?: string;
    env?: string;
  };
}

/**
 * Heartbeat request with optional alert
 */
export interface HeartbeatWithAlert {
  deviceId?: string;
  status?: 'online' | 'offline' | 'degraded';
  engineVersion?: string;
  platform?: string;
  tenantId?: string;
  storeId?: string;
  alert?: {
    type: string;
    message: string;
  };
}
```

---

## Notes

- Alerts are persisted in the database for audit and historical tracking
- Device status is automatically updated to `"degraded"` for connection errors
- SSE events are broadcast to all clients with `key=admin` (dashboard clients)
- Alert processing errors in heartbeat don't block the heartbeat response
- All alerts are also logged as device logs for audit trail



