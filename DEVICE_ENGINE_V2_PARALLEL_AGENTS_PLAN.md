# Device Engine V2 - 8 Parallel Agents Organization Plan

**Date:** Current  
**Goal:** Maximize parallelization while avoiding conflicts  
**Strategy:** Divide work by layer (Backend/Frontend/Android) and feature area

---

## 🎯 Agent Assignment Strategy

### Principles:
1. **Layer Separation:** Backend, Frontend, and Android agents work independently
2. **Feature Isolation:** Each agent owns a complete feature/area
3. **Clear Boundaries:** Minimal overlap between agents
4. **Dependency Management:** Backend changes first, then clients consume

---

## 👥 Agent Assignments

### **Agent 1: Android Playlist Engine Fixes** 🔴 CRITICAL
**Focus:** Fix playlist endpoint and confirmation

**Tasks:**
- [ ] Update `PlaylistEngine.kt` to use `/api/device/:id/playlist/full`
- [ ] Fix response parsing to match backend format
- [ ] Add playlist confirmation call after successful load
- [ ] Extract version from playlist response
- [ ] Handle confirmation errors gracefully
- [ ] Test playlist fetch end-to-end

**Files to Modify:**
- `app/src/main/java/com/cardbey/slide/engine/PlaylistEngine.kt`

**Dependencies:** None (backend endpoint already exists)

**Estimated Time:** 4-6 hours

**Success Criteria:**
- Playlist loads correctly from correct endpoint
- Confirmation is called after playlist loads
- Binding status updates to "ready" in dashboard

---

### **Agent 2: Android Command Execution** 🔴 CRITICAL
**Focus:** Implement command handling from heartbeat

**Tasks:**
- [ ] Extract commands from heartbeat response in `DeviceHeartbeatManager.kt`
- [ ] Add command handler callback
- [ ] Implement command execution in `PlayerActivity.kt`:
  - play, pause, next, previous, reload
  - setPlaylistIndex, setVolume, setBrightness
- [ ] Track executed commands and send in next heartbeat
- [ ] Handle command errors gracefully
- [ ] Test command flow end-to-end

**Files to Modify:**
- `app/src/main/java/com/cardbey/slide/engine/DeviceHeartbeatManager.kt`
- `app/src/main/java/com/cardbey/slide/ui/player/PlayerActivity.kt`

**Dependencies:** None (backend already sends commands in heartbeat)

**Estimated Time:** 8-12 hours

**Success Criteria:**
- Commands are extracted from heartbeat
- Commands execute correctly on device
- Command execution is confirmed to backend

---

### **Agent 3: Android Video Playback Fixes** 🔴 CRITICAL
**Focus:** Fix ExoPlayer error handling and URL resolution

**Tasks:**
- [ ] Add retry logic for transient ExoPlayer errors
- [ ] Don't skip videos on first error (max 3 retries)
- [ ] Improve error logging with specific error codes
- [ ] Handle network timeout errors gracefully
- [ ] Test video playback with various URL formats
- [ ] Verify video authentication tokens work

**Files to Modify:**
- `app/src/main/java/com/cardbey/slide/ui/player/PlayerActivity.kt`

**Dependencies:** None (backend URL resolution is separate)

**Estimated Time:** 6-8 hours

**Success Criteria:**
- Videos retry on transient errors
- Videos don't skip unnecessarily
- Error messages are logged clearly

---

### **Agent 4: Backend Playlist & URL Enhancement** 🟡 MEDIUM
**Focus:** Ensure playlist response includes version and correct URLs

**Tasks:**
- [ ] Verify `PUBLIC_API_BASE_URL` is documented in `.env.example`
- [ ] Add version field to playlist response if missing
- [ ] Verify URL resolution in playlist endpoint
- [ ] Add logging for URL generation
- [ ] Test playlist response format matches Android expectations
- [ ] Add validation for playlist response structure

**Files to Modify:**
- `apps/core/cardbey-core/src/routes/deviceEngine.js` (playlist endpoint)
- `apps/core/cardbey-core/.env.example` (documentation)

**Dependencies:** None

**Estimated Time:** 4-6 hours

**Success Criteria:**
- Playlist response includes version field
- URLs are correctly resolved
- Response format matches Android expectations

---

### **Agent 5: Frontend Device Details Panel** 🟡 MEDIUM
**Focus:** Enhance device detail view with more information

**Tasks:**
- [ ] Add device state snapshots display
- [ ] Add device logs with filtering/search
- [ ] Add device commands UI (send commands from dashboard)
- [ ] Show playlist binding history
- [ ] Add device metrics visualization (if data available)
- [ ] Improve device detail panel layout

**Files to Modify:**
- `apps/dashboard/cardbey-marketing-dashboard/src/features/devices/DeviceDetailView.tsx`
- `apps/dashboard/cardbey-marketing-dashboard/src/features/devices/DevicesPageTable.tsx`
- Create: `src/features/devices/components/DeviceCommandsPanel.tsx` (if needed)

**Dependencies:** None (backend APIs already exist)

**Estimated Time:** 12-16 hours

**Success Criteria:**
- Device details show comprehensive information
- Users can send commands from dashboard
- Device logs are searchable/filterable

---

### **Agent 6: Frontend Error Handling & UX** 🟡 MEDIUM
**Focus:** Improve error messages and user experience

**Tasks:**
- [ ] Standardize error message display across device pages
- [ ] Add retry buttons for failed operations
- [ ] Improve offline state handling
- [ ] Add loading states for async operations
- [ ] Improve SSE reconnection logic
- [ ] Add user-friendly error messages for common failures
- [ ] Add error boundary for device pages

**Files to Modify:**
- `apps/dashboard/cardbey-marketing-dashboard/src/features/devices/DevicesPageTable.tsx`
- `apps/dashboard/cardbey-marketing-dashboard/src/hooks/useDeviceEngineEvents.ts`
- `apps/dashboard/cardbey-marketing-dashboard/src/lib/sseClient.ts`
- Create: `src/features/devices/components/ErrorBoundary.tsx` (if needed)

**Dependencies:** None

**Estimated Time:** 10-14 hours

**Success Criteria:**
- Errors are user-friendly and actionable
- Retry logic works for failed operations
- Offline state is handled gracefully

---

### **Agent 7: Backend Performance & Optimization** 🟡 MEDIUM
**Focus:** Optimize queries and add pagination

**Tasks:**
- [ ] Add pagination to device list endpoint (`GET /api/device/list`)
- [ ] Optimize playlist queries (avoid N+1)
- [ ] Add caching for device status (if needed)
- [ ] Optimize SSE connection management
- [ ] Add database query indexes if missing
- [ ] Profile slow endpoints and optimize

**Files to Modify:**
- `apps/core/cardbey-core/src/routes/deviceEngine.js` (device list endpoint)
- `apps/core/cardbey-core/src/engines/device/pushPlaylist.js` (if N+1 issues)
- `apps/core/cardbey-core/src/realtime/simpleSse.js` (connection management)

**Dependencies:** None

**Estimated Time:** 12-16 hours

**Success Criteria:**
- Device list supports pagination
- Queries are optimized (no N+1)
- SSE connections are managed efficiently

---

### **Agent 8: Testing & Documentation** 📋 ONGOING
**Focus:** Write tests and update documentation

**Tasks:**
- [ ] Write unit tests for backend engine functions
- [ ] Write integration tests for pairing flow
- [ ] Write E2E tests for playlist assignment
- [ ] Update API documentation (OpenAPI/Swagger if applicable)
- [ ] Update architecture documentation
- [ ] Create troubleshooting guide
- [ ] Document Android app setup and testing

**Files to Create/Modify:**
- `apps/core/cardbey-core/tests/device/` (new test files)
- `apps/dashboard/cardbey-marketing-dashboard/src/features/devices/__tests__/` (new test files)
- `apps/core/cardbey-core/docs/DEVICE_ENGINE_V2_SETUP.md` (new)
- `apps/core/cardbey-core/docs/DEVICE_ENGINE_V2_TROUBLESHOOTING.md` (new)

**Dependencies:** Can work in parallel, but should test features as they're completed

**Estimated Time:** 20-30 hours (ongoing)

**Success Criteria:**
- Critical paths have test coverage
- Documentation is up-to-date
- Troubleshooting guide is comprehensive

---

## 📊 Work Distribution Summary

| Agent | Layer | Priority | Time Estimate | Dependencies |
|-------|-------|----------|---------------|--------------|
| Agent 1 | Android | 🔴 Critical | 4-6h | None |
| Agent 2 | Android | 🔴 Critical | 8-12h | None |
| Agent 3 | Android | 🔴 Critical | 6-8h | None |
| Agent 4 | Backend | 🟡 Medium | 4-6h | None |
| Agent 5 | Frontend | 🟡 Medium | 12-16h | None |
| Agent 6 | Frontend | 🟡 Medium | 10-14h | None |
| Agent 7 | Backend | 🟡 Medium | 12-16h | None |
| Agent 8 | All | 📋 Ongoing | 20-30h | Features |

**Total Estimated Time:** 76-108 hours (can be done in parallel)

---

## 🔄 Coordination Strategy

### Daily Sync Points:
1. **Morning Standup:** Each agent reports:
   - What they completed yesterday
   - What they're working on today
   - Any blockers or conflicts

2. **Conflict Resolution:**
   - If two agents need the same file, coordinate:
     - Agent 4 (Backend) and Agent 7 (Backend) → Coordinate on `deviceEngine.js`
     - Agent 5 (Frontend) and Agent 6 (Frontend) → Coordinate on `DevicesPageTable.tsx`

3. **Integration Testing:**
   - After Agent 1, 2, 3 complete → Test Android end-to-end
   - After Agent 4, 7 complete → Test backend endpoints
   - After Agent 5, 6 complete → Test frontend UI

### File Conflict Prevention:

**Backend (`apps/core/cardbey-core/src/routes/deviceEngine.js`):**
- Agent 4: Focus on playlist endpoint (lines ~1817-2100)
- Agent 7: Focus on device list endpoint (lines ~400-600)
- **Coordination:** Agent 4 works on playlist, Agent 7 works on list - minimal overlap

**Frontend (`apps/dashboard/cardbey-marketing-dashboard/src/features/devices/`):**
- Agent 5: Focus on `DeviceDetailView.tsx` and detail components
- Agent 6: Focus on `DevicesPageTable.tsx` and error handling
- **Coordination:** Agent 5 enhances details, Agent 6 improves main table - clear separation

**Android (`app/src/main/java/com/cardbey/slide/`):**
- Agent 1: `engine/PlaylistEngine.kt`
- Agent 2: `engine/DeviceHeartbeatManager.kt` + `ui/player/PlayerActivity.kt`
- Agent 3: `ui/player/PlayerActivity.kt` (ExoPlayer only)
- **Coordination:** 
  - Agent 1: PlaylistEngine only
  - Agent 2: HeartbeatManager + PlayerActivity (command execution)
  - Agent 3: PlayerActivity (video playback only)
  - **Potential conflict:** Agent 2 and Agent 3 both touch `PlayerActivity.kt`
  - **Solution:** Agent 2 focuses on command execution methods, Agent 3 focuses on ExoPlayer error handling - different areas of the file

---

## 🚀 Execution Order (Recommended)

### Phase 1: Critical Fixes (Week 1)
**Agents 1, 2, 3, 4 work in parallel:**
- Agent 1: Android Playlist Fixes (4-6h)
- Agent 2: Android Command Execution (8-12h)
- Agent 3: Android Video Playback (6-8h)
- Agent 4: Backend Playlist Enhancement (4-6h)

**After completion:** Test Android end-to-end

### Phase 2: Enhancement (Week 2)
**Agents 5, 6, 7 work in parallel:**
- Agent 5: Frontend Device Details (12-16h)
- Agent 6: Frontend Error Handling (10-14h)
- Agent 7: Backend Performance (12-16h)

**After completion:** Test frontend and backend

### Phase 3: Testing (Week 3)
**Agent 8 works:**
- Agent 8: Testing & Documentation (20-30h, ongoing)

---

## 📝 Agent Communication Template

### Daily Status Report:
```
Agent [N]: [Agent Name]
Date: [Date]

✅ Completed:
- [Task 1]
- [Task 2]

🔄 In Progress:
- [Current Task]

⚠️ Blockers:
- [Any blockers]

📋 Next Steps:
- [Next task]
```

### Conflict Resolution:
```
Agent [N] needs to modify: [File Path]
Lines: [Line numbers]
Purpose: [What they're changing]

Agent [M] needs to modify: [File Path]
Lines: [Line numbers]
Purpose: [What they're changing]

Resolution: [How to coordinate]
```

---

## ✅ Success Metrics

**After all agents complete:**

1. **Android:**
   - ✅ Playlist loads from correct endpoint
   - ✅ Playlist confirmation is called
   - ✅ Commands execute correctly
   - ✅ Videos play reliably

2. **Backend:**
   - ✅ Playlist response includes version
   - ✅ URLs are correctly resolved
   - ✅ Device list supports pagination
   - ✅ Queries are optimized

3. **Frontend:**
   - ✅ Device details show comprehensive info
   - ✅ Users can send commands
   - ✅ Errors are user-friendly
   - ✅ Performance is optimized

4. **Testing:**
   - ✅ Critical paths have test coverage
   - ✅ Documentation is complete

---

## 🎯 Final Notes

- **Independence:** Most agents can work completely independently
- **Coordination:** Only needed for shared files (Agent 2 & 3 on PlayerActivity.kt)
- **Testing:** Agent 8 can start writing tests as features are completed
- **Flexibility:** Agents can adjust scope if they finish early or encounter issues

**Estimated Total Time with 8 Agents:** 2-3 weeks (vs 4-6 weeks sequential)

---

**Last Updated:** Current Date  
**Next Review:** After Phase 1 completion

