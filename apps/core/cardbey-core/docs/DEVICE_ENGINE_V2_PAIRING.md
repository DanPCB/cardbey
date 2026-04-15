# Device Engine V2 Pairing Flow

## Overview

Device Engine V2 supports a **dashboard-initiated pairing flow** where:
1. Dashboard creates a pairing code for a specific tenant/store
2. Device enters the code to complete pairing
3. Device appears in the dashboard Devices page in real-time

This flow is cleaner than the previous device-initiated flow because it ensures devices are always paired to the correct tenant/store from the start.

## Architecture

### Models

**DevicePairing** (new model):
- Stores pending pairing codes before devices connect
- Fields:
  - `id`: Unique identifier
  - `tenantId`: Tenant ID (from dashboard auth)
  - `storeId`: Store ID (from dashboard auth or request)
  - `pairingCode`: 6-character uppercase alphanumeric code (unique)
  - `createdAt`: When pairing code was created
  - `expiresAt`: When pairing code expires (15 minutes)
  - `status`: "pending" | "completed" | "expired"
  - `deviceId`: Filled once device completes pairing
  - `deviceLabel`: Optional label from dashboard

**Device** (existing model):
- Created/updated when device completes pairing
- Fields updated:
  - `tenantId`, `storeId`: From DevicePairing
  - `name`: From deviceLabel or default "Screen device"
  - `platform`, `model`, `appVersion`: From device request
  - `status`: Set to "online"
  - `lastSeenAt`: Set to current time
  - `orientation`: Default "horizontal"
  - `type`: Default "screen"

## Endpoints

### 1. POST /api/device/pair/init

**Purpose**: Dashboard creates a pairing code for the current tenant/store.

**Auth**: Required (dashboard user)

**Request Body**:
```json
{
  "storeId": "string (optional, can come from auth context)",
  "deviceLabel": "string (optional)"
}
```

**Response** (200 OK):
```json
{
  "ok": true,
  "pairingCode": "ABC123",
  "expiresAt": "2024-01-01T12:15:00.000Z",
  "tenantId": "tenant-id",
  "storeId": "store-id"
}
```

**Error Responses**:
- `400`: Missing tenantId or storeId
- `500`: Failed to generate unique pairing code

**Logs**:
- `[Device Engine] Pair init: tenantId=..., storeId=..., pairingCode=...`

### 2. POST /api/device/pair/complete

**Purpose**: Device completes pairing using a pairing code.

**Auth**: Not required (called by device)

**Request Body**:
```json
{
  "pairingCode": "ABC123",
  "platform": "android (optional)",
  "model": "string (optional)",
  "appVersion": "string (optional)",
  "deviceLabel": "string (optional)"
}
```

**Response** (200 OK):
```json
{
  "ok": true,
  "deviceId": "device-id",
  "tenantId": "tenant-id",
  "storeId": "store-id",
  "engine": "DEVICE_V2",
  "heartbeatIntervalSec": 30
}
```

**Error Responses**:
- `400`: Missing pairingCode
- `400`: Invalid or expired pairing code
- `400`: Pairing already completed
- `500`: Failed to complete pairing

**Logs**:
- `[Device Engine] Pair complete: pairingCode=..., deviceId=..., tenantId=..., storeId=...`

## Flow Diagram

```
┌─────────┐                    ┌─────────┐                    ┌─────────┐
│Dashboard│                    │   Core   │                    │ Device  │
└────┬────┘                    └────┬────┘                    └────┬────┘
     │                               │                               │
     │ 1. POST /api/device/pair/init │                               │
     │──────────────────────────────>│                               │
     │                               │ Create DevicePairing          │
     │                               │ (status: "pending")          │
     │                               │                               │
     │ 2. { pairingCode, expiresAt } │                               │
     │<──────────────────────────────│                               │
     │                               │                               │
     │ Show pairing code modal       │                               │
     │                               │                               │
     │                               │                               │
     │                               │ 3. POST /api/device/pair/     │
     │                               │    complete                   │
     │                               │<──────────────────────────────│
     │                               │ Lookup DevicePairing           │
     │                               │ Create/Update Device           │
     │                               │ Update DevicePairing           │
     │                               │ (status: "completed")          │
     │                               │                               │
     │                               │ 4. { deviceId, tenantId, ... }│
     │                               │──────────────────────────────>│
     │                               │                               │
     │                               │ Emit SSE: device:paired       │
     │                               │                               │
     │ 5. Poll /api/device/list       │                               │
     │──────────────────────────────>│                               │
     │                               │                               │
     │ 6. Device appears in list      │                               │
     │<──────────────────────────────│                               │
     │                               │                               │
     │ Close modal, refresh list     │                               │
     │                               │                               │
     │                               │ 7. POST /api/device/heartbeat  │
     │                               │<──────────────────────────────│
     │                               │ Update device.lastSeenAt      │
     │                               │                               │
```

## Pairing Code Generation

- **Format**: 6-character uppercase alphanumeric
- **Character set**: `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (excludes confusing chars: 0, O, I, 1)
- **Uniqueness**: Guaranteed by unique constraint in database
- **Expiration**: 15 minutes from creation

## Heartbeat Integration

After pairing, devices send heartbeats to `/api/device/heartbeat` with their `deviceId`. The heartbeat endpoint:
- Updates `device.lastSeenAt` and `status` to "online"
- Emits `device.status.changed` SSE events
- Returns pending commands if any

**Logging**: When a newly-paired device sends its first heartbeat, the log includes:
```
[Device Engine] Heartbeat from newly-paired device
```

## Real-time Updates

The pairing flow emits SSE events for real-time dashboard updates:

1. **device:paired**: Emitted when pairing completes
   ```json
   {
     "deviceId": "...",
     "name": "...",
     "platform": "...",
     "type": "screen",
     "status": "online",
     "lastSeenAt": "...",
     "tenantId": "...",
     "storeId": "..."
   }
   ```

2. **device:update**: Emitted on heartbeat
   ```json
   {
     "deviceId": "...",
     "status": "online",
     "lastSeenAt": "...",
     "tenantId": "...",
     "storeId": "...",
     "name": "..."
   }
   ```

## Dashboard Integration

### Step 1: Create Pairing Code

```javascript
const response = await fetch(`${coreBaseUrl}/api/device/pair/init`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    storeId: currentStoreId, // Optional if from auth context
    deviceLabel: 'Front Display' // Optional
  })
});

const { pairingCode, expiresAt } = await response.json();
```

### Step 2: Show Pairing Modal

Display the pairing code in a modal with:
- Large, readable code (e.g., 6-digit display)
- Instruction: "Enter this code on your screen/tablet to pair."
- Expiration countdown

### Step 3: Poll for Device

```javascript
const pollInterval = setInterval(async () => {
  const response = await fetch(
    `${coreBaseUrl}/api/device/list?tenantId=${tenantId}&storeId=${storeId}`,
    {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    }
  );
  
  const { devices } = await response.json();
  
  // Check if new device appeared
  const newDevice = devices.find(d => 
    d.storeId === storeId && 
    // Device was created recently (within last minute)
    new Date(d.createdAt) > new Date(Date.now() - 60000)
  );
  
  if (newDevice) {
    clearInterval(pollInterval);
    // Close modal, refresh device list
  }
}, 2000); // Poll every 2 seconds
```

### Step 4: Listen for SSE Events (Optional)

```javascript
const eventSource = new EventSource(`${coreBaseUrl}/api/realtime/sse?key=admin`);

eventSource.addEventListener('device:paired', (event) => {
  const device = JSON.parse(event.data);
  if (device.storeId === currentStoreId) {
    // Device paired! Close modal, refresh list
  }
});
```

## Device Integration

### Step 1: Enter Pairing Code

User enters the 6-character code shown on the dashboard.

### Step 2: Complete Pairing

```javascript
const response = await fetch(`${coreBaseUrl}/api/device/pair/complete`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    pairingCode: userEnteredCode,
    platform: 'android',
    model: 'Fire TV Stick',
    appVersion: '1.0.0',
    deviceLabel: 'Front Display' // Optional
  })
});

const { deviceId, tenantId, storeId, heartbeatIntervalSec } = await response.json();

// Store deviceId for future heartbeats
localStorage.setItem('deviceId', deviceId);
```

### Step 3: Start Heartbeat

```javascript
setInterval(async () => {
  await fetch(`${coreBaseUrl}/api/device/heartbeat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      deviceId: localStorage.getItem('deviceId'),
      engineVersion: 'DEVICE_V2',
      platform: 'android',
      status: 'online'
    })
  });
}, heartbeatIntervalSec * 1000);
```

## Debugging

### Check Pairing Status

```bash
# List all devices
curl http://localhost:3001/api/device/debug/list-all

# List devices for tenant/store
curl http://localhost:3001/api/device/list?tenantId=...&storeId=...
```

### View Pairing Codes

```sql
SELECT * FROM DevicePairing WHERE status = 'pending';
```

### Check Device Status

```sql
SELECT id, name, tenantId, storeId, status, lastSeenAt 
FROM Device 
WHERE tenantId = '...' AND storeId = '...';
```

## Error Handling

### Invalid/Expired Code

If a device tries to use an invalid or expired code:
- Returns `400` with `error: "invalid_or_expired_code"`
- Device should show error message and allow retry

### Already Completed

If a code is used twice:
- Returns `400` with `error: "pairing_already_completed"`
- Device should show error message

### Network Errors

- Device should retry with exponential backoff
- Show connection status to user

## Security Considerations

1. **Pairing Code Expiration**: Codes expire after 15 minutes
2. **One-Time Use**: Codes can only be used once (status changes to "completed")
3. **Tenant/Store Isolation**: Pairing codes are scoped to tenant/store
4. **No Auth Required for Complete**: Device endpoint is public (device doesn't have auth token)

## Migration Notes

This new pairing flow coexists with the old device-initiated flow:
- **Old flow**: `POST /api/device/request-pairing` (device-initiated) → `POST /api/device/claim` (dashboard claims)
- **New flow**: `POST /api/device/pair/init` (dashboard-initiated) → `POST /api/device/pair/complete` (device completes)

The new flow is recommended for all new integrations.



