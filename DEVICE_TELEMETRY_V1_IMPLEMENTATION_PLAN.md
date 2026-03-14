# Device Telemetry v1 Implementation Plan

## PLANNER: Current State Analysis

### A) DeviceEngine V2 Routes Location
**File:** `apps/core/cardbey-core/src/routes/deviceEngine.js`

**Existing Endpoints:**
- `POST /api/device/heartbeat` - Updates device.lastSeenAt, emits `device.status.changed` SSE
- `POST /api/device/request-pairing` - Device requests pairing code
- `POST /api/device/complete-pairing` - Dashboard completes pairing
- `POST /api/device/claim` - Dashboard claims pairing session (auth required)
- `GET /api/device/pair-status/:sessionId` - Tablet polls pairing status
- `GET /api/device/:deviceId/playlist/full` - Device fetches playlist
- `POST /api/device/trigger-repair` - Dashboard triggers repair
- `GET /api/device/ping` - Network diagnosis

**SSE Events Currently Broadcast:**
- `device.status.changed` / `device:update` - On heartbeat
- `device.pairing.requested` - When device requests pairing
- `device.pairing.claimed` - When pairing completes
- `device:alert` - Connection errors
- `device:playlistProgress` - Playlist playback progress

### B) Device Auth Model
**Current State:**
- Devices use `deviceId` (CUID) as primary identifier
- After pairing: `tenantId` and `storeId` are set (from 'temp' to real values)
- Pre-pairing: Devices have `tenantId='temp'`, `storeId='temp'`, and a `pairingCode`
- No token-based auth for devices (heartbeat endpoint is unauthenticated)
- Device identity verified by matching `deviceId` in database

**Device Storage:**
- `Device` model in Prisma (line 777-809 in schema.prisma)
- Fields: `id`, `tenantId`, `storeId`, `pairingCode`, `status`, `lastSeenAt`, `platform`, `appVersion`, etc.
- `DeviceLog` model exists for logging (line 918-933)
- `DeviceAlert` model exists for alerts (line 936-957)
- `DeviceStateSnapshot` model exists but minimal (line 839-850)

### C) Why "No Alert on App Launch"
**Root Cause Analysis:**
1. **Device doesn't send APP_STARTED event** - No endpoint exists for device events
2. **Backend doesn't have event endpoint** - Only heartbeat exists, which updates status but doesn't emit APP_STARTED
3. **Dashboard subscribes to `device.status.changed`** - But this only fires on heartbeat, not on app launch
4. **No telemetry event system** - Current system only has logs/alerts, not structured events

**Gap:** Missing `/api/device/v2/event` endpoint that devices can call to emit structured events like APP_STARTED, PAIR_SUCCESS, etc.

### D) Proposed End-to-End Contract

**New Endpoints:**
1. `POST /api/device/v2/heartbeat`
   - Body: `{ deviceId, tenantId, storeId, ts, app: {...}, state: {...}, health: {...} }`
   - Updates `DeviceStatusSnapshot` (upsert by deviceId)
   - Updates `Device.lastSeenAt` and `Device.status`
   - Broadcasts SSE: `device.status.updated`

2. `POST /api/device/v2/event`
   - Body: `{ deviceId?, sessionId?, tenantId?, storeId?, ts, type, severity, message?, data? }`
   - Creates `DeviceEvent` row
   - Broadcasts SSE: `device.event.created`
   - Supports pre-pairing: if `sessionId` present and `deviceId` missing, allow event

**SSE Event Names:**
- `device.status.updated` - When heartbeat updates device status
- `device.event.created` - When device emits an event (APP_STARTED, PAIR_SUCCESS, etc.)

**Event Types (from device):**
- `APP_STARTED` - App launched
- `PAIR_SUCCESS` - Pairing completed
- `PAIRING_SCREEN_OPENED` - Pairing UI shown (pre-pair)
- `PLAYLIST_ASSIGNED` - Playlist received
- `PLAYLIST_EMPTY` - No playlist available
- `PLAYLIST_FETCH_FAILED` - Failed to fetch playlist
- `MEDIA_ERROR` - Media playback error
- `FREEZE_SUSPECTED` - Playback frozen
- `RECOVERY_SUCCESS` - Freeze recovered
- `RECOVERY_FAILED` - Freeze recovery failed

### E) Prisma Models to Add

**New Models:**
1. `DeviceStatusSnapshot` - Latest status per device (upsert pattern)
2. `DeviceEvent` - Append-only event log

**Schema:**
```prisma
model DeviceStatusSnapshot {
  id          String   @id @default(cuid())
  deviceId    String   @unique
  tenantId    String
  storeId     String
  lastSeenAt  DateTime @default(now())
  appVersion  String?
  platform    String?
  stateJson   Json?    // { mode, playlistId, playingItemId, positionMs, isPlaying, orientation }
  healthJson  Json?    // { noPlaylist, freezeSuspected, lastErrorCode, lastErrorAt }
  updatedAt   DateTime @updatedAt

  @@index([tenantId, storeId])
  @@index([deviceId])
}

model DeviceEvent {
  id         String   @id @default(cuid())
  deviceId   String?  // Nullable for pre-pairing events
  sessionId  String?  // For pre-pairing events
  tenantId   String
  storeId    String
  type       String   // APP_STARTED, PAIR_SUCCESS, etc.
  severity   String   // info | warn | error
  message    String?
  dataJson   Json?
  createdAt  DateTime @default(now())

  @@index([tenantId, storeId, createdAt])
  @@index([deviceId, createdAt])
  @@index([sessionId, createdAt])
  @@index([type, createdAt])
}
```

### F) Files to Change

**Backend (cardbey-core):**
1. `prisma/schema.prisma` - Add DeviceStatusSnapshot and DeviceEvent models
2. `apps/core/cardbey-core/src/routes/deviceEngine.js` - Add v2/heartbeat and v2/event endpoints
3. `apps/core/cardbey-core/src/realtime/simpleSse.js` - Already has broadcastSse function (no changes needed)

**Dashboard:**
1. `apps/dashboard/cardbey-marketing-dashboard/src/lib/sseClient.ts` - Already handles SSE (verify event names)
2. `apps/dashboard/cardbey-marketing-dashboard/src/features/devices/DevicesPageTable.tsx` - Subscribe to new events
3. `apps/dashboard/cardbey-marketing-dashboard/src/features/devices/DeviceDetailView.tsx` - Show event timeline
4. `apps/dashboard/cardbey-marketing-dashboard/src/store/deviceTelemetry.ts` - NEW: Zustand store for telemetry state

**Android App (future):**
- TelemetryClient.kt - NEW: HTTP client for telemetry
- Application.kt - Send APP_STARTED on launch
- HeartbeatScheduler.kt - NEW: 30s heartbeat scheduler
- EventEmitter.kt - NEW: Emit events at key moments

---

## IMPLEMENTER (Backend): Routes + Persistence + SSE

### Task 1: Prisma Models

**File:** `apps/core/cardbey-core/prisma/schema.prisma`

Add after `DeviceAlert` model (around line 957):

```prisma
// Device Telemetry v1 - Status snapshots and events
model DeviceStatusSnapshot {
  id          String   @id @default(cuid())
  deviceId    String   @unique
  tenantId    String
  storeId     String
  lastSeenAt  DateTime @default(now())
  appVersion  String?
  platform    String?
  stateJson   Json?    // { mode, playlistId, playingItemId, positionMs, isPlaying, orientation }
  healthJson  Json?    // { noPlaylist, freezeSuspected, lastErrorCode, lastErrorAt }
  updatedAt   DateTime @updatedAt

  @@index([tenantId, storeId])
  @@index([deviceId])
}

model DeviceEvent {
  id         String   @id @default(cuid())
  deviceId   String?  // Nullable for pre-pairing events
  sessionId  String?  // For pre-pairing events (when deviceId is null)
  tenantId   String
  storeId    String
  type       String   // APP_STARTED, PAIR_SUCCESS, PLAYLIST_EMPTY, etc.
  severity   String   // info | warn | error
  message    String?
  dataJson   Json?
  createdAt  DateTime @default(now())

  @@index([tenantId, storeId, createdAt])
  @@index([deviceId, createdAt])
  @@index([sessionId, createdAt])
  @@index([type, createdAt])
}
```

**Migration:**
```bash
cd apps/core/cardbey-core
npx prisma migrate dev --name add_device_telemetry_v1
npx prisma generate
```

### Task 2: Validation Helper

**File:** `apps/core/cardbey-core/src/routes/deviceEngine.js`

Add helper function (around line 100, after extractLanguageFromHeader):

```javascript
/**
 * Validate device context for telemetry endpoints
 * Returns { ok: true, deviceId, tenantId, storeId } or throws error
 */
async function requireDeviceContext(req) {
  const { deviceId, sessionId, tenantId, storeId } = req.body;
  
  // For pre-pairing events: require sessionId
  if (!deviceId && sessionId) {
    // Find device by sessionId (pairingCode lookup)
    const device = await prisma.device.findFirst({
      where: {
        OR: [
          { pairingCode: sessionId },
          { id: sessionId }, // Fallback: sessionId might be deviceId
        ],
      },
      select: { id: true, tenantId: true, storeId: true },
    });
    
    if (device) {
      return {
        ok: true,
        deviceId: device.id,
        tenantId: device.tenantId,
        storeId: device.storeId,
        isPrePairing: device.tenantId === 'temp' || device.storeId === 'temp',
      };
    }
    
    // Pre-pairing: allow with sessionId only if type is allowed
    const allowedPrePairTypes = ['PAIRING_SCREEN_OPENED', 'APP_STARTED'];
    if (allowedPrePairTypes.includes(req.body.type)) {
      return {
        ok: true,
        deviceId: null,
        sessionId,
        tenantId: 'temp',
        storeId: 'temp',
        isPrePairing: true,
      };
    }
    
    throw new Error('missing_device_context: deviceId or valid sessionId required');
  }
  
  // For paired devices: require deviceId + tenantId + storeId
  if (!deviceId) {
    throw new Error('missing_fields: deviceId is required');
  }
  
  if (!tenantId || tenantId === 'temp' || tenantId === 'provisional') {
    throw new Error('missing_fields: tenantId is required and must not be temp/provisional');
  }
  
  if (!storeId || storeId === 'temp' || storeId === 'provisional') {
    throw new Error('missing_fields: storeId is required and must not be temp/provisional');
  }
  
  // Verify device exists and matches context
  const device = await prisma.device.findUnique({
    where: { id: deviceId },
    select: { id: true, tenantId: true, storeId: true },
  });
  
  if (!device) {
    throw new Error('device_not_found: deviceId does not exist');
  }
  
  if (device.tenantId !== tenantId || device.storeId !== storeId) {
    throw new Error('context_mismatch: device tenantId/storeId does not match request');
  }
  
  return {
    ok: true,
    deviceId,
    tenantId,
    storeId,
    isPrePairing: false,
  };
}
```

### Task 3: POST /api/device/v2/heartbeat

**File:** `apps/core/cardbey-core/src/routes/deviceEngine.js`

Add route (after existing `/heartbeat` endpoint, around line 1700):

```javascript
/**
 * POST /api/device/v2/heartbeat
 * Device Telemetry v1 - Heartbeat with snapshot
 * 
 * Body:
 *   - deviceId: string (required if paired)
 *   - sessionId: string (required if pre-pairing)
 *   - tenantId: string (required)
 *   - storeId: string (required)
 *   - ts: string (ISO 8601 timestamp)
 *   - app: { version, platform, build? }
 *   - state: { mode, playlistId?, playingItemId?, positionMs?, isPlaying?, orientation? }
 *   - health: { noPlaylist?, freezeSuspected?, lastErrorCode?, lastErrorAt? }
 * 
 * Response:
 *   { ok: true, deviceId, lastSeenAt, status }
 */
router.post('/v2/heartbeat', async (req, res) => {
  const requestId = Math.random().toString(36).slice(2, 9);
  
  try {
    // Validate context
    const ctx = await requireDeviceContext(req);
    
    if (ctx.isPrePairing) {
      return res.status(400).json({
        ok: false,
        error: 'device_not_paired',
        message: 'Device must be paired before sending heartbeat',
      });
    }
    
    const { deviceId, tenantId, storeId } = ctx;
    const { ts, app = {}, state = {}, health = {} } = req.body;
    
    // Update Device table
    const device = await prisma.device.update({
      where: { id: deviceId },
      data: {
        lastSeenAt: new Date(ts || Date.now()),
        status: 'online',
        appVersion: app.version || undefined,
        platform: app.platform || undefined,
      },
      select: {
        id: true,
        status: true,
        lastSeenAt: true,
        tenantId: true,
        storeId: true,
      },
    });
    
    // Upsert DeviceStatusSnapshot
    await prisma.deviceStatusSnapshot.upsert({
      where: { deviceId },
      create: {
        deviceId,
        tenantId,
        storeId,
        lastSeenAt: device.lastSeenAt,
        appVersion: app.version || null,
        platform: app.platform || null,
        stateJson: Object.keys(state).length > 0 ? state : null,
        healthJson: Object.keys(health).length > 0 ? health : null,
      },
      update: {
        lastSeenAt: device.lastSeenAt,
        appVersion: app.version || undefined,
        platform: app.platform || undefined,
        stateJson: Object.keys(state).length > 0 ? state : undefined,
        healthJson: Object.keys(health).length > 0 ? health : undefined,
      },
    });
    
    // Broadcast SSE
    broadcastSse('admin', 'device.status.updated', {
      deviceId,
      tenantId,
      storeId,
      lastSeenAt: device.lastSeenAt.toISOString(),
      status: device.status,
      appVersion: app.version,
      platform: app.platform,
      state,
      health,
    });
    
    res.json({
      ok: true,
      deviceId,
      lastSeenAt: device.lastSeenAt.toISOString(),
      status: device.status,
    });
  } catch (error) {
    console.error(`[DEVICE_V2_HEARTBEAT] [${requestId}] Error:`, error.message);
    
    if (error.message.includes('missing_fields') || 
        error.message.includes('device_not_found') ||
        error.message.includes('context_mismatch')) {
      return res.status(400).json({
        ok: false,
        error: error.message.split(':')[0],
        message: error.message.split(':')[1] || error.message,
        requestId,
      });
    }
    
    res.status(500).json({
      ok: false,
      error: 'heartbeat_failed',
      message: error.message,
      requestId,
    });
  }
});
```

### Task 4: POST /api/device/v2/event

**File:** `apps/core/cardbey-core/src/routes/deviceEngine.js`

Add route (after v2/heartbeat):

```javascript
/**
 * POST /api/device/v2/event
 * Device Telemetry v1 - Event emission
 * 
 * Body:
 *   - deviceId?: string (required if paired)
 *   - sessionId?: string (required if pre-pairing)
 *   - tenantId?: string (required if paired, 'temp' if pre-pairing)
 *   - storeId?: string (required if paired, 'temp' if pre-pairing)
 *   - ts: string (ISO 8601 timestamp)
 *   - type: string (APP_STARTED, PAIR_SUCCESS, etc.)
 *   - severity: string (info | warn | error)
 *   - message?: string
 *   - data?: object
 * 
 * Response:
 *   { ok: true, eventId, createdAt }
 */
router.post('/v2/event', async (req, res) => {
  const requestId = Math.random().toString(36).slice(2, 9);
  
  try {
    const { ts, type, severity, message, data } = req.body;
    
    if (!type) {
      return res.status(400).json({
        ok: false,
        error: 'missing_fields',
        message: 'type is required',
      });
    }
    
    if (!['info', 'warn', 'error'].includes(severity)) {
      return res.status(400).json({
        ok: false,
        error: 'invalid_severity',
        message: 'severity must be info, warn, or error',
      });
    }
    
    // Validate context (allows pre-pairing for certain types)
    let ctx;
    try {
      ctx = await requireDeviceContext(req);
    } catch (ctxError) {
      // For pre-pairing events, allow with sessionId only
      const { sessionId } = req.body;
      const allowedPrePairTypes = ['PAIRING_SCREEN_OPENED', 'APP_STARTED'];
      
      if (sessionId && allowedPrePairTypes.includes(type)) {
        ctx = {
          ok: true,
          deviceId: null,
          sessionId,
          tenantId: 'temp',
          storeId: 'temp',
          isPrePairing: true,
        };
      } else {
        throw ctxError;
      }
    }
    
    const { deviceId, sessionId, tenantId, storeId } = ctx;
    
    // Create DeviceEvent
    const event = await prisma.deviceEvent.create({
      data: {
        deviceId: deviceId || null,
        sessionId: sessionId || null,
        tenantId,
        storeId,
        type,
        severity,
        message: message || null,
        dataJson: data || null,
        createdAt: ts ? new Date(ts) : new Date(),
      },
      select: {
        id: true,
        deviceId: true,
        type: true,
        severity: true,
        createdAt: true,
      },
    });
    
    // Broadcast SSE
    broadcastSse('admin', 'device.event.created', {
      eventId: event.id,
      deviceId: event.deviceId,
      sessionId: sessionId || null,
      tenantId,
      storeId,
      type: event.type,
      severity: event.severity,
      message: message || null,
      data: data || null,
      createdAt: event.createdAt.toISOString(),
    });
    
    // If PAIR_SUCCESS, also emit device.status.updated
    if (type === 'PAIR_SUCCESS' && deviceId) {
      const device = await prisma.device.findUnique({
        where: { id: deviceId },
        select: { id: true, status: true, lastSeenAt: true },
      });
      
      if (device) {
        broadcastSse('admin', 'device.status.updated', {
          deviceId,
          tenantId,
          storeId,
          lastSeenAt: device.lastSeenAt?.toISOString() || new Date().toISOString(),
          status: device.status,
        });
      }
    }
    
    res.json({
      ok: true,
      eventId: event.id,
      createdAt: event.createdAt.toISOString(),
    });
  } catch (error) {
    console.error(`[DEVICE_V2_EVENT] [${requestId}] Error:`, error.message);
    
    if (error.message.includes('missing_fields') || 
        error.message.includes('invalid_severity') ||
        error.message.includes('device_not_found') ||
        error.message.includes('context_mismatch')) {
      return res.status(400).json({
        ok: false,
        error: error.message.split(':')[0],
        message: error.message.split(':')[1] || error.message,
        requestId,
      });
    }
    
    res.status(500).json({
      ok: false,
      error: 'event_failed',
      message: error.message,
      requestId,
    });
  }
});
```

### Task 5: Pairing Success Event

**File:** `apps/core/cardbey-core/src/routes/deviceEngine.js`

In the `/claim` endpoint (around line 2850), after pairing completes, add:

```javascript
// After device is updated with tenantId/storeId (around line 2842)
// Emit PAIR_SUCCESS event
try {
  await prisma.deviceEvent.create({
    data: {
      deviceId: updated.id,
      tenantId: finalTenantId,
      storeId: finalStoreId,
      type: 'PAIR_SUCCESS',
      severity: 'info',
      message: 'Device paired successfully',
      dataJson: {
        sessionId,
        name: name || updated.name,
      },
    },
  });
  
  broadcastSse('admin', 'device.event.created', {
    deviceId: updated.id,
    tenantId: finalTenantId,
    storeId: finalStoreId,
    type: 'PAIR_SUCCESS',
    severity: 'info',
    message: 'Device paired successfully',
    createdAt: new Date().toISOString(),
  });
} catch (eventError) {
  // Non-fatal: log but don't fail pairing
  console.warn(`[PAIRING] Failed to emit PAIR_SUCCESS event:`, eventError);
}
```

---

## IMPLEMENTER (Dashboard): Subscribe + Show Alerts + Preview Timeline

### Task 1: Zustand Store for Telemetry

**File:** `apps/dashboard/cardbey-marketing-dashboard/src/store/deviceTelemetry.ts` (NEW)

```typescript
import { create } from 'zustand';

interface DeviceStatusSnapshot {
  deviceId: string;
  tenantId: string;
  storeId: string;
  lastSeenAt: string;
  appVersion?: string;
  platform?: string;
  state?: {
    mode?: string;
    playlistId?: string;
    playingItemId?: string;
    positionMs?: number;
    isPlaying?: boolean;
    orientation?: string;
  };
  health?: {
    noPlaylist?: boolean;
    freezeSuspected?: boolean;
    lastErrorCode?: string;
    lastErrorAt?: string;
  };
}

interface DeviceEvent {
  eventId: string;
  deviceId: string | null;
  sessionId: string | null;
  tenantId: string;
  storeId: string;
  type: string;
  severity: 'info' | 'warn' | 'error';
  message?: string;
  data?: any;
  createdAt: string;
}

interface DeviceTelemetryState {
  // Status snapshots by deviceId
  snapshotsById: Record<string, DeviceStatusSnapshot>;
  
  // Events by deviceId (keep last 50 per device)
  eventsByDeviceId: Record<string, DeviceEvent[]>;
  
  // Global alerts (last 50 events across all devices, filtered by severity)
  globalAlerts: DeviceEvent[];
  
  // Actions
  updateSnapshot: (snapshot: DeviceStatusSnapshot) => void;
  addEvent: (event: DeviceEvent) => void;
  getDeviceEvents: (deviceId: string) => DeviceEvent[];
  getGlobalAlerts: (severity?: 'warn' | 'error') => DeviceEvent[];
}

export const useDeviceTelemetryStore = create<DeviceTelemetryState>((set, get) => ({
  snapshotsById: {},
  eventsByDeviceId: {},
  globalAlerts: [],
  
  updateSnapshot: (snapshot) => {
    set((state) => ({
      snapshotsById: {
        ...state.snapshotsById,
        [snapshot.deviceId]: snapshot,
      },
    }));
  },
  
  addEvent: (event) => {
    set((state) => {
      const deviceId = event.deviceId || 'unpaired';
      const deviceEvents = state.eventsByDeviceId[deviceId] || [];
      
      // Keep last 50 events per device
      const updatedDeviceEvents = [event, ...deviceEvents].slice(0, 50);
      
      // Update global alerts (keep last 50, filter by severity)
      const updatedGlobalAlerts = [event, ...state.globalAlerts]
        .filter(e => e.severity === 'warn' || e.severity === 'error')
        .slice(0, 50);
      
      return {
        eventsByDeviceId: {
          ...state.eventsByDeviceId,
          [deviceId]: updatedDeviceEvents,
        },
        globalAlerts: updatedGlobalAlerts,
      };
    });
  },
  
  getDeviceEvents: (deviceId: string) => {
    return get().eventsByDeviceId[deviceId] || [];
  },
  
  getGlobalAlerts: (severity?: 'warn' | 'error') => {
    const alerts = get().globalAlerts;
    if (severity) {
      return alerts.filter(e => e.severity === severity);
    }
    return alerts;
  },
}));
```

### Task 2: Subscribe to SSE Events

**File:** `apps/dashboard/cardbey-marketing-dashboard/src/features/devices/DevicesPageTable.tsx`

Add SSE subscription (around line 635, in the existing SSE useEffect):

```typescript
// Subscribe to device telemetry events
useEffect(() => {
  const unsubscribeStatus = on('device.status.updated', (evt: any) => {
    try {
      const data = typeof evt === 'string' ? JSON.parse(evt) : (evt.data ? JSON.parse(evt.data) : evt);
      
      if (data.deviceId) {
        useDeviceTelemetryStore.getState().updateSnapshot({
          deviceId: data.deviceId,
          tenantId: data.tenantId,
          storeId: data.storeId,
          lastSeenAt: data.lastSeenAt,
          appVersion: data.appVersion,
          platform: data.platform,
          state: data.state,
          health: data.health,
        });
        
        // Also update device list if device is in current view
        queryClient.invalidateQueries(['devices', storeId, tenantId]);
      }
    } catch (err) {
      console.error('[DevicesPage] Failed to process device.status.updated:', err);
    }
  });
  
  const unsubscribeEvent = on('device.event.created', (evt: any) => {
    try {
      const data = typeof evt === 'string' ? JSON.parse(evt) : (evt.data ? JSON.parse(evt.data) : evt);
      
      const event: DeviceEvent = {
        eventId: data.eventId,
        deviceId: data.deviceId,
        sessionId: data.sessionId,
        tenantId: data.tenantId,
        storeId: data.storeId,
        type: data.type,
        severity: data.severity,
        message: data.message,
        data: data.data,
        createdAt: data.createdAt,
      };
      
      useDeviceTelemetryStore.getState().addEvent(event);
      
      // Show toast for warn/error events
      if (event.severity === 'warn' || event.severity === 'error') {
        toast(
          event.message || `${event.type} (${event.severity})`,
          event.severity === 'error' ? 'error' : 'warning'
        );
      }
      
      // In dev mode, also show info events
      if (process.env.NODE_ENV === 'development' && event.severity === 'info' && 
          (event.type === 'APP_STARTED' || event.type === 'PAIR_SUCCESS')) {
        toast(event.message || event.type, 'info');
      }
      
      // Refresh device list if event is for a device in current view
      if (event.deviceId) {
        queryClient.invalidateQueries(['devices', storeId, tenantId]);
      }
    } catch (err) {
      console.error('[DevicesPage] Failed to process device.event.created:', err);
    }
  });
  
  return () => {
    unsubscribeStatus();
    unsubscribeEvent();
  };
}, [on, storeId, tenantId, queryClient]);
```

### Task 3: Event Timeline in Device Preview

**File:** `apps/dashboard/cardbey-marketing-dashboard/src/features/devices/DeviceDetailView.tsx`

Add event timeline section (after Logs Timeline, around line 640):

```typescript
import { useDeviceTelemetryStore } from '@/store/deviceTelemetry';

// Inside component, after logs section:
const deviceEvents = useDeviceTelemetryStore((state) => 
  deviceId ? state.getDeviceEvents(deviceId) : []
);

// In JSX, after Logs Timeline Card:
{/* Event Timeline */}
<Card>
  <CardHeader>
    <CardTitle className="text-sm">Event Timeline</CardTitle>
  </CardHeader>
  <CardContent>
    <div className="space-y-2 max-h-96 overflow-y-auto">
      {deviceEvents.length === 0 ? (
        <div className="text-center text-gray-500 py-8 text-sm">
          No events yet
        </div>
      ) : (
        deviceEvents.map((event) => (
          <div
            key={event.eventId}
            className={clsx(
              'p-2 rounded border transition-colors',
              event.severity === 'error' ? 'border-red-500/50 bg-red-500/10' :
              event.severity === 'warn' ? 'border-yellow-500/50 bg-yellow-500/10' :
              'border-gray-500/50 bg-gray-500/10'
            )}
          >
            <div className="flex items-start gap-2">
              <div className="mt-0.5">
                {event.severity === 'error' ? (
                  <AlertCircle className="w-4 h-4 text-red-400" />
                ) : event.severity === 'warn' ? (
                  <AlertCircle className="w-4 h-4 text-yellow-400" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-gray-500">
                    {new Date(event.createdAt).toLocaleString()}
                  </span>
                  <span className="text-gray-600">•</span>
                  <span className="font-medium">{event.type}</span>
                </div>
                {event.message && (
                  <div className="mt-1 text-sm">{event.message}</div>
                )}
                {event.data && (
                  <details className="mt-1">
                    <summary className="text-muted-foreground cursor-pointer text-xs">
                      View data
                    </summary>
                    <pre className="mt-1 text-xs bg-background p-2 rounded overflow-x-auto">
                      {JSON.stringify(event.data, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  </CardContent>
</Card>
```

---

## IMPLEMENTER (Android App): Send APP_STARTED + Heartbeat + Events

**Note:** This section is for future Android implementation. The backend endpoints are ready to receive these events.

### Task 1: TelemetryClient.kt

```kotlin
class TelemetryClient(private val baseUrl: String) {
    private val httpClient = OkHttpClient()
    
    suspend fun sendHeartbeat(payload: HeartbeatPayload): Result<Unit> {
        return try {
            val json = Json {
                ignoreUnknownKeys = true
            }
            val body = json.encodeToString(payload).toRequestBody("application/json".toMediaType())
            
            val request = Request.Builder()
                .url("$baseUrl/api/device/v2/heartbeat")
                .post(body)
                .build()
            
            val response = httpClient.newCall(request).execute()
            
            if (response.isSuccessful) {
                Result.success(Unit)
            } else {
                Result.failure(Exception("Heartbeat failed: ${response.code}"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
    
    suspend fun sendEvent(payload: EventPayload): Result<Unit> {
        return try {
            val json = Json {
                ignoreUnknownKeys = true
            }
            val body = json.encodeToString(payload).toRequestBody("application/json".toMediaType())
            
            val request = Request.Builder()
                .url("$baseUrl/api/device/v2/event")
                .post(body)
                .build()
            
            val response = httpClient.newCall(request).execute()
            
            if (response.isSuccessful) {
                Result.success(Unit)
            } else {
                Result.failure(Exception("Event failed: ${response.code}"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}

data class HeartbeatPayload(
    val deviceId: String?,
    val sessionId: String?,
    val tenantId: String,
    val storeId: String,
    val ts: String,
    val app: AppInfo,
    val state: DeviceState?,
    val health: DeviceHealth?
)

data class EventPayload(
    val deviceId: String?,
    val sessionId: String?,
    val tenantId: String?,
    val storeId: String?,
    val ts: String,
    val type: String,
    val severity: String,
    val message: String?,
    val data: Map<String, Any>?
)
```

### Task 2: Application.kt - Send APP_STARTED

```kotlin
class CardbeyApplication : Application() {
    private val telemetryClient = TelemetryClient(getCoreUrl())
    private val devicePrefs = getSharedPreferences("device", MODE_PRIVATE)
    
    override fun onCreate() {
        super.onCreate()
        
        // Send APP_STARTED event
        lifecycleScope.launch {
            val deviceId = devicePrefs.getString("deviceId", null)
            val sessionId = devicePrefs.getString("sessionId", null)
            val tenantId = devicePrefs.getString("tenantId", "temp")
            val storeId = devicePrefs.getString("storeId", "temp")
            
            telemetryClient.sendEvent(
                EventPayload(
                    deviceId = deviceId,
                    sessionId = sessionId,
                    tenantId = tenantId,
                    storeId = storeId,
                    ts = Instant.now().toString(),
                    type = "APP_STARTED",
                    severity = "info",
                    message = "App launched",
                    data = mapOf(
                        "version" to BuildConfig.VERSION_NAME,
                        "build" to BuildConfig.VERSION_CODE,
                        "model" to Build.MODEL
                    )
                )
            ).onFailure { error ->
                Log.e("Telemetry", "Failed to send APP_STARTED", error)
            }
            
            // Send initial heartbeat
            if (deviceId != null) {
                telemetryClient.sendHeartbeat(/* ... */)
            }
        }
    }
}
```

---

## REVIEWER: End-to-End Acceptance + Regressions

### Acceptance Checklist

- [ ] **1. Launch tablet app → backend receives /event APP_STARTED → dashboard shows alert within 1s via SSE**
  - Test: Launch app, check backend logs for POST /api/device/v2/event
  - Test: Check dashboard console for `device.event.created` SSE event
  - Test: Verify toast appears (dev mode) or alert appears in alerts panel

- [ ] **2. Heartbeat updates device online status**
  - Test: Send heartbeat, verify Device.lastSeenAt updated
  - Test: Verify DeviceStatusSnapshot created/updated
  - Test: Verify dashboard device list shows "Online" status

- [ ] **3. Pair success emits PAIR_SUCCESS**
  - Test: Complete pairing, check backend logs for PAIR_SUCCESS event
  - Test: Verify dashboard receives `device.event.created` with type=PAIR_SUCCESS

- [ ] **4. Playlist missing emits PLAYLIST_EMPTY and appears in dashboard**
  - Test: Device sends event with type=PLAYLIST_EMPTY
  - Test: Verify event appears in device preview timeline

- [ ] **5. Freeze detection emits FREEZE_SUSPECTED and recovery result**
  - Test: Device sends FREEZE_SUSPECTED event
  - Test: Device sends RECOVERY_SUCCESS or RECOVERY_FAILED
  - Test: Verify events appear in timeline

- [ ] **6. No duplicate flows**
  - Verify: Only `/api/device/v2/heartbeat` and `/api/device/v2/event` exist (no legacy duplicates)
  - Verify: Dashboard has single device state store (useDeviceTelemetryStore)

- [ ] **7. No silent fallback**
  - Test: Send heartbeat without tenantId → 400 error with clear message
  - Test: Send event without deviceId/sessionId → 400 error
  - Test: Send event with mismatched tenantId/storeId → 400 context_mismatch

- [ ] **8. Performance**
  - Verify: Event list capped at 50 per device
  - Verify: Global alerts capped at 50
  - Verify: No unbounded memory growth

### Regression Tests

- [ ] Existing heartbeat endpoint still works
- [ ] Existing pairing flow still works
- [ ] Existing device list still updates
- [ ] Existing SSE subscriptions still work

### Final Commit Message

```
feat(device-engine): Add Device Telemetry v1 with status snapshots and events

- Add DeviceStatusSnapshot and DeviceEvent Prisma models
- Implement POST /api/device/v2/heartbeat endpoint with snapshot storage
- Implement POST /api/device/v2/event endpoint for structured events
- Add SSE broadcasts: device.status.updated and device.event.created
- Add dashboard Zustand store for telemetry state
- Subscribe to telemetry events in DevicesPageTable
- Add event timeline to DeviceDetailView preview panel
- Emit PAIR_SUCCESS event on pairing completion
- Support pre-pairing events (APP_STARTED, PAIRING_SCREEN_OPENED) with sessionId

BREAKING: None (new endpoints, backward compatible)

Closes: Device telemetry v1 implementation
```


