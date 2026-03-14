# Device Engine V2 - Individual Agent Briefs

Quick reference cards for each of the 8 parallel agents.

---

## 🤖 Agent 1: Android Playlist Engine Fixes

**Priority:** 🔴 CRITICAL  
**Time:** 4-6 hours  
**Status:** Ready to start

### Your Mission:
Fix the Android playlist endpoint and add playlist confirmation.

### Key Files:
- `app/src/main/java/com/cardbey/slide/engine/PlaylistEngine.kt`

### Tasks:
1. Change endpoint from `/api/devices/:id/playlist` to `/api/device/:id/playlist/full`
2. Update response parsing to handle `{ ok, state, playlist, version }`
3. Add `confirmPlaylistReady()` function
4. Call confirmation after playlist loads successfully
5. Extract version from response

### Success Criteria:
- ✅ Playlist loads from correct endpoint
- ✅ Confirmation is called after load
- ✅ Dashboard shows binding status as "ready"

### Dependencies:
- Backend endpoint already exists: `GET /api/device/:id/playlist/full`
- Backend confirmation endpoint: `POST /api/device/confirm-playlist-ready`

### Reference:
- Backend response format: `apps/core/cardbey-core/src/routes/deviceEngine.js` (line ~1817)

---

## 🤖 Agent 2: Android Command Execution

**Priority:** 🔴 CRITICAL  
**Time:** 8-12 hours  
**Status:** Ready to start

### Your Mission:
Implement command execution from heartbeat responses.

### Key Files:
- `app/src/main/java/com/cardbey/slide/engine/DeviceHeartbeatManager.kt`
- `app/src/main/java/com/cardbey/slide/ui/player/PlayerActivity.kt`

### Tasks:
1. Extract `commands` array from heartbeat response
2. Add `setCommandHandler()` method to DeviceHeartbeatManager
3. Implement `executeCommand()` in PlayerActivity:
   - play, pause, next, previous, reload
   - setPlaylistIndex, setVolume, setBrightness
4. Track executed commands and send in next heartbeat
5. Handle command errors gracefully

### Success Criteria:
- ✅ Commands are extracted from heartbeat
- ✅ Commands execute on device
- ✅ Execution is confirmed to backend

### Dependencies:
- Backend already sends commands in heartbeat response
- Coordinate with Agent 3 on `PlayerActivity.kt` (different methods)

### Reference:
- Backend command format: `apps/core/cardbey-core/src/routes/deviceEngine.js` (heartbeat endpoint)

---

## 🤖 Agent 3: Android Video Playback Fixes

**Priority:** 🔴 CRITICAL  
**Time:** 6-8 hours  
**Status:** Ready to start

### Your Mission:
Fix ExoPlayer error handling and add retry logic.

### Key Files:
- `app/src/main/java/com/cardbey/slide/ui/player/PlayerActivity.kt`

### Tasks:
1. Add retry counter and max retries constant
2. Update `onPlayerError` to retry transient errors (network, timeout)
3. Don't skip videos on first error (max 3 retries)
4. Improve error logging with specific error codes
5. Reset retry count on successful playback

### Success Criteria:
- ✅ Videos retry on transient errors
- ✅ Videos don't skip unnecessarily
- ✅ Error messages are logged clearly

### Dependencies:
- Coordinate with Agent 2 on `PlayerActivity.kt` (focus on ExoPlayer error handling only)

### Reference:
- ExoPlayer error codes: https://exoplayer.dev/error-messages.html

---

## 🤖 Agent 4: Backend Playlist & URL Enhancement

**Priority:** 🟡 MEDIUM  
**Time:** 4-6 hours  
**Status:** Ready to start

### Your Mission:
Ensure playlist response includes version and URLs are correct.

### Key Files:
- `apps/core/cardbey-core/src/routes/deviceEngine.js` (playlist endpoint, ~line 1817)
- `apps/core/cardbey-core/.env.example`

### Tasks:
1. Verify playlist response includes `version` field
2. Document `PUBLIC_API_BASE_URL` in `.env.example`
3. Add logging for URL generation
4. Verify URL resolution works correctly
5. Test response format matches Android expectations

### Success Criteria:
- ✅ Playlist response includes version
- ✅ URLs are correctly resolved
- ✅ Response format matches Android expectations

### Dependencies:
- None (can work independently)
- Coordinate with Agent 7 if both touch `deviceEngine.js` (different endpoints)

### Reference:
- Playlist endpoint: `GET /api/device/:deviceId/playlist/full`

---

## 🤖 Agent 5: Frontend Device Details Panel

**Priority:** 🟡 MEDIUM  
**Time:** 12-16 hours  
**Status:** Ready to start

### Your Mission:
Enhance device detail view with comprehensive information.

### Key Files:
- `apps/dashboard/cardbey-marketing-dashboard/src/features/devices/DeviceDetailView.tsx`
- `apps/dashboard/cardbey-marketing-dashboard/src/features/devices/DevicesPageTable.tsx`
- Create: `src/features/devices/components/DeviceCommandsPanel.tsx` (new)

### Tasks:
1. Add device state snapshots display
2. Add device logs with filtering/search
3. Add device commands UI (send commands from dashboard)
4. Show playlist binding history
5. Add device metrics visualization (if data available)
6. Improve panel layout and UX

### Success Criteria:
- ✅ Device details show comprehensive info
- ✅ Users can send commands from dashboard
- ✅ Device logs are searchable/filterable

### Dependencies:
- Backend APIs already exist
- Coordinate with Agent 6 on `DevicesPageTable.tsx` (different areas)

### Reference:
- Backend debug endpoint: `GET /api/device/:id/debug`
- Backend command endpoint: `POST /api/device/command`

---

## 🤖 Agent 6: Frontend Error Handling & UX

**Priority:** 🟡 MEDIUM  
**Time:** 10-14 hours  
**Status:** Ready to start

### Your Mission:
Improve error messages and user experience across device pages.

### Key Files:
- `apps/dashboard/cardbey-marketing-dashboard/src/features/devices/DevicesPageTable.tsx`
- `apps/dashboard/cardbey-marketing-dashboard/src/hooks/useDeviceEngineEvents.ts`
- `apps/dashboard/cardbey-marketing-dashboard/src/lib/sseClient.ts`
- Create: `src/features/devices/components/ErrorBoundary.tsx` (new, optional)

### Tasks:
1. Standardize error message display
2. Add retry buttons for failed operations
3. Improve offline state handling
4. Add loading states for async operations
5. Improve SSE reconnection logic
6. Add user-friendly error messages
7. Add error boundary (optional)

### Success Criteria:
- ✅ Errors are user-friendly and actionable
- ✅ Retry logic works for failed operations
- ✅ Offline state is handled gracefully

### Dependencies:
- None (can work independently)
- Coordinate with Agent 5 on `DevicesPageTable.tsx` (different areas)

### Reference:
- SSE client: `src/lib/sseClient.ts`
- Device events hook: `src/hooks/useDeviceEngineEvents.ts`

---

## 🤖 Agent 7: Backend Performance & Optimization

**Priority:** 🟡 MEDIUM  
**Time:** 12-16 hours  
**Status:** Ready to start

### Your Mission:
Optimize backend queries and add pagination.

### Key Files:
- `apps/core/cardbey-core/src/routes/deviceEngine.js` (device list endpoint, ~line 400)
- `apps/core/cardbey-core/src/engines/device/pushPlaylist.js` (if N+1 issues)
- `apps/core/cardbey-core/src/realtime/simpleSse.js` (connection management)

### Tasks:
1. Add pagination to device list endpoint
2. Optimize playlist queries (avoid N+1)
3. Add caching for device status (if needed)
4. Optimize SSE connection management
5. Add database query indexes if missing
6. Profile slow endpoints and optimize

### Success Criteria:
- ✅ Device list supports pagination
- ✅ Queries are optimized (no N+1)
- ✅ SSE connections are managed efficiently

### Dependencies:
- None (can work independently)
- Coordinate with Agent 4 if both touch `deviceEngine.js` (different endpoints)

### Reference:
- Device list endpoint: `GET /api/device/list`
- Prisma schema: `prisma/schema.prisma`

---

## 🤖 Agent 8: Testing & Documentation

**Priority:** 📋 ONGOING  
**Time:** 20-30 hours  
**Status:** Can start immediately, continue as features complete

### Your Mission:
Write tests and update documentation.

### Key Files to Create:
- `apps/core/cardbey-core/tests/device/` (new directory)
  - `pairing.test.js`
  - `playlist.test.js`
  - `heartbeat.test.js`
  - `commands.test.js`
- `apps/dashboard/cardbey-marketing-dashboard/src/features/devices/__tests__/` (new directory)
  - `DevicesPageTable.test.tsx`
  - `DeviceDetailView.test.tsx`
- `apps/core/cardbey-core/docs/DEVICE_ENGINE_V2_SETUP.md` (new)
- `apps/core/cardbey-core/docs/DEVICE_ENGINE_V2_TROUBLESHOOTING.md` (new)

### Tasks:
1. Write unit tests for backend engine functions
2. Write integration tests for pairing flow
3. Write E2E tests for playlist assignment
4. Update API documentation
5. Update architecture documentation
6. Create troubleshooting guide
7. Document Android app setup

### Success Criteria:
- ✅ Critical paths have test coverage
- ✅ Documentation is up-to-date
- ✅ Troubleshooting guide is comprehensive

### Dependencies:
- Can start immediately with existing features
- Should test new features as Agents 1-7 complete them

### Reference:
- Existing audit: `DEVICE_ENGINE_V2_COMPREHENSIVE_AUDIT.md`
- Status report: `DEVICE_ENGINE_V2_STATUS_AND_NEXT_STEPS.md`

---

## 🚨 Conflict Resolution

### Potential Conflicts:

1. **Agent 2 & Agent 3: `PlayerActivity.kt`**
   - **Solution:** Agent 2 focuses on command execution methods, Agent 3 focuses on ExoPlayer error handling
   - **Coordination:** Agent 2 works on methods like `executeCommand()`, Agent 3 works on `onPlayerError()`

2. **Agent 4 & Agent 7: `deviceEngine.js`**
   - **Solution:** Agent 4 works on playlist endpoint (~line 1817), Agent 7 works on device list endpoint (~line 400)
   - **Coordination:** Different endpoints, minimal overlap

3. **Agent 5 & Agent 6: `DevicesPageTable.tsx`**
   - **Solution:** Agent 5 enhances detail view, Agent 6 improves main table error handling
   - **Coordination:** Agent 5 focuses on detail panel, Agent 6 focuses on table error states

---

## 📞 Communication

### Daily Standup Format:
```
Agent [N]: [Your Name]
✅ Completed: [What you finished]
🔄 In Progress: [What you're working on]
⚠️ Blockers: [Any issues]
📋 Next: [What's next]
```

### If You Need Help:
1. Check the main plan: `DEVICE_ENGINE_V2_PARALLEL_AGENTS_PLAN.md`
2. Check status report: `DEVICE_ENGINE_V2_STATUS_AND_NEXT_STEPS.md`
3. Ask in coordination channel if you have conflicts

---

**Good luck! 🚀**

