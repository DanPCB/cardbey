# DeviceEngine V2 Playlist Implementation Report

## Overview
This report documents the playlist creation, assignment, and consumption functionality for DeviceEngine V2 across the backend (cardbey-core), frontend (dashboard), and DeviceAgent (Android tablet app).

---

## 1. BACKEND (cardbey-core)

### 1.1 Playlist Assignment Endpoints

#### **POST /api/device/push-playlist**
**Location:** `apps/core/cardbey-core/src/routes/deviceEngine.js` (lines 858-965)

**Purpose:** Simplified endpoint to assign a playlist to a DeviceEngine V2 device

**Request:**
```json
{
  "deviceId": "string",
  "playlistId": "string"
}
```

**Process:**
1. Validates `deviceId` and `playlistId` are provided
2. Verifies device exists and retrieves `tenantId`/`storeId`
3. Fetches playlist from database (must be type `'SIGNAGE'`)
4. Formats playlist data with items (assetId, url, type, duration, order)
5. Calls `pushPlaylist()` engine function
6. Creates/updates `DevicePlaylistBinding` with status `'pending'`
7. Logs assignment to device logs
8. Broadcasts `device:playlistAssigned` SSE event

**Response:**
```json
{
  "ok": true,
  "data": {
    "bindingId": "string",
    "status": "pending"
  }
}
```

**Key Features:**
- Only accepts playlists with `type: 'SIGNAGE'`
- Creates `DevicePlaylistBinding` record
- Broadcasts real-time events via SSE
- Logs all assignments for audit trail

---

#### **POST /api/devices/:deviceId/assign-signage-playlist**
**Location:** `apps/core/cardbey-core/src/routes/deviceAgentRoutes.js` (lines 443-655)

**Purpose:** Assign SignagePlaylist to device (specifically for DeviceEngine V2)

**Request:**
```json
{
  "playlistId": "string"
}
```

**Process:**
1. Validates `deviceId` and `playlistId`
2. Verifies device exists
3. Verifies playlist exists and is type `'SIGNAGE'`
4. Validates tenant/store match (if both are set)
5. **Creates `PlaylistSchedule`** (always-active schedule with no time restrictions)
6. Deactivates existing active bindings (sets status to `'pending'`)
7. Creates/updates `DevicePlaylistBinding` with:
   - `status: 'pending'` (will be set to `'ready'` when device confirms)
   - `version: "${playlistId}:${Date.now()}"`
8. Broadcasts `device:playlistAssigned` SSE event

**Response:**
```json
{
  "ok": true,
  "deviceId": "string",
  "playlistId": "string"
}
```

**Key Features:**
- Creates `PlaylistSchedule` for scheduling support
- Manages binding lifecycle (pending → ready)
- Version tracking for playlist updates
- Tenant/store validation

---

### 1.2 Playlist Retrieval Endpoints

#### **GET /api/device/:deviceId/playlist/full**
**Location:** `apps/core/cardbey-core/src/routes/deviceEngine.js` (lines 1381-1548)

**Purpose:** Get full playlist for device in APK-compatible format

**Process:**
1. Validates `deviceId`
2. Verifies device exists
3. Finds active `DevicePlaylistBinding` (status `'ready'` or `'pending'`)
4. Fetches playlist with items and assets
5. Verifies playlist is type `'SIGNAGE'`
6. Formats items for APK:
   - Maps `SignageAsset` data to item format
   - Resolves URLs (handles CloudFront URLs)
   - Converts duration from seconds to milliseconds
   - Includes: `id`, `type`, `url`, `durationMs`, `order`

**Response:**
```json
{
  "ok": true,
  "deviceId": "string",
  "playlist": {
    "id": "string",
    "name": "string",
    "items": [
      {
        "id": "string",
        "type": "image" | "video" | "html",
        "url": "string",
        "durationMs": 8000,
        "order": 0
      }
    ]
  } | null
}
```

**Key Features:**
- Returns `null` if no active binding exists
- Filters out items without URLs
- Handles CloudFront and relative URLs
- Optimized for Android player consumption

---

#### **GET /api/devices/:deviceId/playlist**
**Location:** `apps/core/cardbey-core/src/routes/deviceAgentRoutes.js` (lines 113-135)

**Purpose:** Get playlist for device (alternative endpoint)

**Response:**
```json
{
  "ok": true,
  "playlist": { ... } | null
}
```

**Uses:** `getPlaylistForDevice()` service function

---

### 1.3 Playlist Confirmation Endpoint

#### **POST /api/device/confirm-playlist-ready**
**Location:** `apps/core/cardbey-core/src/routes/deviceEngine.js` (lines 635-642)

**Purpose:** Device confirms it has successfully loaded a playlist

**Request:**
```json
{
  "deviceId": "string",
  "playlistId": "string",
  "version": "string"
}
```

**Process:**
1. Validates input
2. Updates `DevicePlaylistBinding` status from `'pending'` to `'ready'`
3. Records confirmation timestamp

**Key Features:**
- Updates binding status to `'ready'` when device confirms
- Enables tracking of playlist delivery status

---

### 1.4 Database Models

#### **DevicePlaylistBinding**
- Links device to playlist
- Fields: `deviceId`, `playlistId`, `version`, `status` (`'pending'` | `'ready'` | `'failed'`), `lastPushedAt`
- Status lifecycle: `pending` → `ready` (when device confirms)

#### **PlaylistSchedule**
- Schedules playlist to device
- Fields: `deviceId`, `playlistId`, `tenantId`, `storeId`, `startAt`, `endAt`, `daysOfWeek`, `timeRange`
- For DeviceEngine V2: typically always-active (null startAt/endAt)

#### **Playlist** (type: `'SIGNAGE'`)
- Contains playlist metadata and items
- Items reference `SignageAsset` via `assetId`
- Items have `orderIndex` for sequencing

---

### 1.5 Engine Functions

#### **pushPlaylist()**
**Location:** `apps/core/cardbey-core/src/engines/device/pushPlaylist.js`

**Purpose:** Core engine function to push playlist to device

**Process:**
1. Creates/updates `DevicePlaylistBinding`
2. Calls device service to push playlist (if available)
3. Emits `DEVICE_EVENTS.PLAYLIST_READY` event
4. Returns binding info

---

## 2. FRONTEND (Dashboard)

### 2.1 Playlist Assignment UI

#### **DeviceDetailsPanel**
**Location:** `apps/dashboard/cardbey-marketing-dashboard/src/pages/devices/DeviceDetailsPanel.jsx`

**Features:**
- Dropdown to select from available SIGNAGE playlists
- "Assign Playlist" button
- Displays current playlist name
- Shows playlist binding status

**Implementation:**
```typescript
// Mutation for assigning playlist
const assignMutation = useMutation({
  mutationFn: ({ deviceId, playlistId }) => 
    assignSignagePlaylistToDevice(deviceId, playlistId),
  onSuccess: () => {
    // Refresh device list
    // Show success toast
  }
});
```

**API Call:**
- Uses `assignSignagePlaylistToDevice()` from `src/lib/api.ts`
- Calls `POST /api/devices/:deviceId/assign-signage-playlist`

---

#### **ScreenDeviceCard**
**Location:** `apps/dashboard/cardbey-marketing-dashboard/src/features/devices/ScreenDeviceCard.tsx`

**Features:**
- Quick playlist assignment in device card
- Dropdown with available playlists
- "Assign" button
- Shows current playlist name

**Implementation:**
```typescript
const pushPlaylistMutation = useMutation({
  mutationFn: (playlistId: string) =>
    pushPlaylistToDevice(device.id, playlistId),
  onSuccess: () => {
    // Refresh devices
    // Show success toast
  }
});
```

**API Call:**
- Uses `pushPlaylistToDevice()` from `src/api/deviceClient.ts`
- Calls `POST /api/device/push-playlist`

---

### 2.2 API Client Functions

#### **assignSignagePlaylistToDevice()**
**Location:** `apps/dashboard/cardbey-marketing-dashboard/src/lib/api.ts` (lines 608-620)

```typescript
export async function assignSignagePlaylistToDevice(
  deviceId: string,
  playlistId: string
): Promise<{ ok: boolean; deviceId: string; playlistId?: string }>
```

**Endpoint:** `POST /api/devices/:deviceId/assign-signage-playlist`

---

#### **pushPlaylistToDevice()**
**Location:** `apps/dashboard/cardbey-marketing-dashboard/src/api/deviceClient.ts` (lines 214-232)

```typescript
export async function pushPlaylistToDevice(
  deviceId: string,
  playlistId: string
): Promise<{ ok: boolean; data?: { bindingId: string; status: string } }>
```

**Endpoint:** `POST /api/device/push-playlist`

---

### 2.3 Real-time Updates

#### **SSE Event Handling**
**Location:** `apps/dashboard/cardbey-marketing-dashboard/src/features/devices/DevicesPageTable.tsx`

**Event:** `device:playlistAssigned`

**Handler:**
```typescript
if (event.type === 'playlist_assigned') {
  console.log('[DevicesPage] Playlist assigned to device:', 
    event.payload.deviceId, event.payload.playlistId);
  // Refresh device list
  refetch();
}
```

**Features:**
- Automatically refreshes device list when playlist is assigned
- Updates UI in real-time without manual refresh

---

## 3. DEVICEAGENT (Android Tablet App)

### 3.1 Playlist Polling Engine

#### **PlaylistEngine.kt**
**Location:** `apps/dashboard/cardbey-marketing-dashboard/app/src/main/java/com/cardbey/slide/engine/PlaylistEngine.kt`

**Purpose:** Polls playlist from backend and feeds to player

**Features:**
- Polls every 10 seconds
- Uses ETag for conditional requests (304 Not Modified)
- Parses response and formats for player
- Handles empty playlists gracefully

**Endpoint:** `GET /api/devices/:deviceId/playlist`

**Response Parsing:**
```kotlin
// Response format: { ok: true, playlist: {...} }
// Extracts items array and formats as { items: [...] }
val itemsArray = playlistObj.optJSONArray("items")
val formattedPlaylist = JSONObject().apply {
    put("items", itemsArray)
}
onPlaylistChanged(formattedPlaylist.toString())
```

**Integration:**
- Started in `PlayerActivity.onCreate()` when `deviceId` exists
- Stops in `PlayerActivity.onDestroy()`
- Calls `PlaylistRepository.setItems()` to update player

---

### 3.2 Player Integration

#### **PlayerActivity.kt**
**Location:** `apps/dashboard/cardbey-marketing-dashboard/app/src/main/java/com/cardbey/slide/ui/player/PlayerActivity.kt`

**Playlist Engine Startup:**
```kotlin
private fun startDeviceEngineV2Engines(deviceId: String) {
    // Start playlist engine
    playlistEngine = PlaylistEngine(onPlaylistChanged = { playlistJson ->
        lifecycleScope.launch(Dispatchers.IO) {
            val parsed = parsePlaylist(playlistJson)
            withContext(Dispatchers.Main) {
                PlaylistRepository.setItems(parsed)
            }
        }
    })
    playlistEngine?.start()
}
```

**Features:**
- Starts playlist polling when `deviceId` exists in `AppConfig`
- Parses playlist JSON and updates `PlaylistRepository`
- Player automatically renders new playlist items
- Handles image, video, and RenderSlide content types

---

### 3.3 Playlist Consumption

#### **PlaylistRepository**
**Location:** `apps/dashboard/cardbey-marketing-dashboard/app/src/main/java/com/cardbey/slide/playlist/PlaylistRepository.kt`

**Purpose:** Manages playlist state for player

**Features:**
- Observable playlist items (Flow)
- Updates trigger player refresh
- Supports image, video, and RenderSlide types

---

## 4. DATA FLOW

### 4.1 Playlist Assignment Flow

```
Dashboard User
    ↓
1. Selects playlist from dropdown
2. Clicks "Assign Playlist"
    ↓
Frontend API Call
    ↓
POST /api/devices/:deviceId/assign-signage-playlist
    OR
POST /api/device/push-playlist
    ↓
Backend Processing
    ↓
1. Validates device and playlist
2. Creates PlaylistSchedule
3. Creates/updates DevicePlaylistBinding (status: 'pending')
4. Broadcasts SSE event: device:playlistAssigned
    ↓
Frontend Receives SSE Event
    ↓
1. Refreshes device list
2. Updates UI to show assigned playlist
```

---

### 4.2 Playlist Consumption Flow

```
Android Tablet App
    ↓
1. PlayerActivity starts
2. Checks AppConfig.deviceId
3. Starts PlaylistEngine
    ↓
PlaylistEngine Polling Loop (every 10s)
    ↓
GET /api/devices/:deviceId/playlist
    ↓
Backend Processing
    ↓
1. Finds active DevicePlaylistBinding
2. Fetches playlist with items and assets
3. Formats items for APK
4. Returns JSON response
    ↓
PlaylistEngine Receives Response
    ↓
1. Parses JSON
2. Extracts items array
3. Formats as { items: [...] }
4. Calls onPlaylistChanged callback
    ↓
PlayerActivity Updates PlaylistRepository
    ↓
1. Parses playlist items
2. Updates PlaylistRepository.setItems()
3. Player automatically renders new content
```

---

## 5. KEY FEATURES SUMMARY

### Backend
✅ **Multiple assignment endpoints** for flexibility
✅ **PlaylistSchedule** support for scheduling
✅ **DevicePlaylistBinding** for tracking assignment status
✅ **Version tracking** for playlist updates
✅ **SSE broadcasting** for real-time updates
✅ **APK-optimized** playlist format endpoint
✅ **Status lifecycle** management (pending → ready)

### Frontend
✅ **DeviceDetailsPanel** for detailed assignment
✅ **ScreenDeviceCard** for quick assignment
✅ **Real-time updates** via SSE
✅ **Error handling** and user feedback
✅ **Playlist selection** from available SIGNAGE playlists

### DeviceAgent
✅ **Automatic polling** every 10 seconds
✅ **ETag support** for efficient updates
✅ **Automatic player updates** when playlist changes
✅ **Graceful error handling**
✅ **Supports multiple content types** (image, video, RenderSlide)

---

## 6. ENDPOINTS SUMMARY

| Endpoint | Method | Purpose | Auth Required |
|----------|--------|---------|---------------|
| `/api/device/push-playlist` | POST | Assign playlist to device | Yes |
| `/api/devices/:deviceId/assign-signage-playlist` | POST | Assign SignagePlaylist to device | Yes |
| `/api/device/:deviceId/playlist/full` | GET | Get full playlist (APK format) | No |
| `/api/devices/:deviceId/playlist` | GET | Get playlist for device | No |
| `/api/device/confirm-playlist-ready` | POST | Device confirms playlist loaded | No |

---

## 7. DATABASE SCHEMA

### DevicePlaylistBinding
- `deviceId` (FK → Device)
- `playlistId` (FK → Playlist)
- `version` (string)
- `status` ('pending' | 'ready' | 'failed')
- `lastPushedAt` (DateTime)

### PlaylistSchedule
- `deviceId` (FK → Device)
- `playlistId` (FK → Playlist)
- `tenantId` (string)
- `storeId` (string)
- `startAt` (DateTime | null)
- `endAt` (DateTime | null)
- `daysOfWeek` (string | null)
- `timeRange` (string | null)

### Playlist (type: 'SIGNAGE')
- `id` (string)
- `name` (string)
- `type` ('SIGNAGE')
- `tenantId` (string)
- `storeId` (string)
- `items` (PlaylistItem[])
  - `assetId` (FK → SignageAsset)
  - `orderIndex` (number)
  - `durationS` (number)

---

## 8. TESTING CHECKLIST

### Backend
- [ ] Assign playlist via `/api/device/push-playlist`
- [ ] Assign playlist via `/api/devices/:deviceId/assign-signage-playlist`
- [ ] Verify `DevicePlaylistBinding` created with status `'pending'`
- [ ] Verify `PlaylistSchedule` created
- [ ] Retrieve playlist via `/api/device/:deviceId/playlist/full`
- [ ] Verify playlist format is APK-compatible
- [ ] Confirm playlist via `/api/device/confirm-playlist-ready`
- [ ] Verify binding status changes to `'ready'`
- [ ] Verify SSE events broadcast correctly

### Frontend
- [ ] Assign playlist from DeviceDetailsPanel
- [ ] Assign playlist from ScreenDeviceCard
- [ ] Verify UI updates in real-time via SSE
- [ ] Verify error handling for invalid playlists
- [ ] Verify tenant/store validation

### DeviceAgent
- [ ] Verify PlaylistEngine starts when deviceId exists
- [ ] Verify polling occurs every 10 seconds
- [ ] Verify playlist updates player automatically
- [ ] Verify ETag support (304 responses)
- [ ] Verify empty playlist handling
- [ ] Verify error handling for network failures

---

## 9. NOTES

- **Playlist Type:** Only playlists with `type: 'SIGNAGE'` can be assigned to DeviceEngine V2 devices
- **Status Lifecycle:** Bindings start as `'pending'` and become `'ready'` when device confirms
- **Version Tracking:** Each assignment gets a unique version string for change detection
- **Scheduling:** PlaylistSchedule is created for all assignments (typically always-active)
- **Real-time Updates:** SSE events ensure dashboard updates immediately when playlist is assigned
- **Polling Frequency:** DeviceAgent polls every 10 seconds (configurable in PlaylistEngine.kt)

---

**Last Updated:** 2025-12-01
**Version:** DeviceEngine V2



