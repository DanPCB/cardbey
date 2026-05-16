# TV Pairing Popup Not Showing - Dashboard Fix Required

## Issue
- ✅ Tablet pairing popup appears correctly
- ❌ TV pairing popup does NOT appear
- ✅ Both devices appear in dashboard device list (so pairing is working)
- ✅ Both devices are successfully initiating pairing

## Root Cause (Likely Frontend)

The backend is broadcasting events correctly for both TV and tablet. The issue is likely in the **dashboard frontend** where:

1. **Only one popup at a time** - Dashboard might be showing only the first/tablet popup and hiding TV's
2. **Event filtering** - Dashboard might be filtering out TV events
3. **Multiple popup handling** - Dashboard might not handle multiple simultaneous pairing requests

## Backend Changes Made

### ✅ Added `deviceType` Field
Pairing events now include a `deviceType` field:
- `'tv'` - For Android TV devices
- `'tablet'` - For tablet devices

**Event Structure:**
```typescript
{
  type: 'pairing_started',
  sessionId: string,
  code: string,
  model: string,
  deviceType: 'tv' | 'tablet',  // NEW FIELD
  // ... other fields
}
```

**Detection Logic:**
- If `model` contains `'tv'` or `'android tv'` → `deviceType: 'tv'`
- Otherwise → `deviceType: 'tablet'`

## Dashboard Fix Required

### 1. Check Event Listener
Ensure the dashboard is listening for BOTH events:
```typescript
eventSource.addEventListener('pairing_started', handlePairingStarted);
eventSource.addEventListener('screen.pair_session.created', handlePairingStarted);
```

### 2. Handle Multiple Popups
The dashboard should show **separate popups** for each pairing request:

```typescript
// Store active pairing sessions
const activePairingSessions = new Map<string, PairingSession>();

function handlePairingStarted(event: MessageEvent) {
  const data = JSON.parse(event.data);
  const sessionId = data.sessionId;
  
  // Don't replace existing popup - show multiple
  if (!activePairingSessions.has(sessionId)) {
    activePairingSessions.set(sessionId, data);
    showPairingPopup(data); // Show new popup
  }
}

function showPairingPopup(session: PairingSession) {
  // Create a unique popup for this session
  const popupId = `pairing-popup-${session.sessionId}`;
  
  // Check if popup already exists
  if (document.getElementById(popupId)) {
    return; // Already showing
  }
  
  // Create and show popup
  const popup = createPairingModal({
    id: popupId,
    code: session.code,
    deviceType: session.deviceType, // Use deviceType for styling
    model: session.model,
    sessionId: session.sessionId,
  });
  
  document.body.appendChild(popup);
}
```

### 3. Use deviceType for UI
```typescript
function createPairingModal(session: PairingSession) {
  const icon = session.deviceType === 'tv' 
    ? '📺' 
    : '📱';
  
  const title = session.deviceType === 'tv'
    ? `TV Wants to Pair`
    : `Tablet Wants to Pair`;
  
  // ... create modal with icon and title
}
```

### 4. Close Popup on Pairing Complete
```typescript
eventSource.addEventListener('pairing_completed', (event) => {
  const data = JSON.parse(event.data);
  const sessionId = data.sessionId;
  
  // Remove from active sessions
  activePairingSessions.delete(sessionId);
  
  // Close popup
  const popup = document.getElementById(`pairing-popup-${sessionId}`);
  if (popup) {
    popup.remove();
  }
});
```

## Testing

### 1. Test Multiple Pairing Requests
1. Start TV pairing (should show popup)
2. Start tablet pairing (should show SECOND popup)
3. Both popups should be visible simultaneously

### 2. Check Browser Console
Look for:
- Event reception: `pairing_started` events for both devices
- Popup creation: Check if popups are being created for both
- Errors: Any JavaScript errors preventing popup creation

### 3. Check Network Tab
Verify SSE events are being received:
- Filter: `EventStream`
- Look for `pairing_started` events
- Check `deviceType` field in event data

## Backend Logs to Check

Look for these in Render logs:
```
[PAIR] Broadcast 'pairing_started' event: code=ABC123 sessionId=... model=Android TV deviceType=tv
[PAIR] Broadcast 'pairing_started' event: code=XYZ789 sessionId=... model=Tablet deviceType=tablet
[SSE] Broadcast 'pairing_started' to X client(s) with key 'admin'
```

If you see both events being broadcast but only one popup appears, the issue is in the dashboard frontend.

## Quick Fix (If Only One Popup at a Time)

If the dashboard currently only shows one popup, modify the popup handler to:

```typescript
// OLD (only one popup):
let currentPairingPopup = null;
function handlePairingStarted(event) {
  if (currentPairingPopup) {
    currentPairingPopup.close(); // ❌ This closes TV popup when tablet pairs
  }
  currentPairingPopup = showPairingPopup(data);
}

// NEW (multiple popups):
const activePopups = new Map();
function handlePairingStarted(event) {
  const data = JSON.parse(event.data);
  if (!activePopups.has(data.sessionId)) {
    activePopups.set(data.sessionId, showPairingPopup(data));
  }
}
```

## Summary

- ✅ Backend is broadcasting events correctly for both TV and tablet
- ✅ Backend now includes `deviceType` field to help dashboard distinguish devices
- ❌ Dashboard needs to handle multiple simultaneous pairing popups
- ❌ Dashboard should not replace/close existing popups when new pairing starts

The fix is in the **dashboard frontend code**, not the backend.

