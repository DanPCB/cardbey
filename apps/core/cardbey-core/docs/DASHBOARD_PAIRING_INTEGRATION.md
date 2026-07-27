# Dashboard Pairing Integration Guide

## Current State

The backend is fully functional. The tablet is correctly:
- ✅ Calling `POST /api/screens/pair/initiate` to create sessions
- ✅ Polling `GET /api/screens/pair/sessions/:sessionId/status` every ~2 seconds
- ✅ Waiting for status to change from `showing_code` to `bound`

## What the Dashboard Needs to Do

The dashboard needs to provide a way for users to **complete the pairing** by entering the code shown on the TV/tablet.

### Option 1: Manual Code Entry (Recommended for MVP)

Add an input field in the "Pair Device" modal:

```javascript
// In your Pair Device modal/dialog
const [pairingCode, setPairingCode] = useState('');

// When user clicks "Pair" button:
const handlePair = async () => {
  const code = pairingCode.trim().toUpperCase();
  
  // Step 1: Verify code exists
  const peekResponse = await fetch(`http://192.168.1.7:3001/api/screens/pair/peek/${code}`);
  const peekData = await peekResponse.json();
  
  if (!peekData.exists) {
    alert('Invalid or expired code. Please check the code on your TV/tablet.');
    return;
  }
  
  // Step 2: Complete pairing
  const completeResponse = await fetch('http://192.168.1.7:3001/api/screens/pair/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code: code,
      name: 'My Display', // Optional: from user input
      location: 'Front Desk', // Optional: from user input
    }),
  });
  
  const completeData = await completeResponse.json();
  
  if (completeData.ok) {
    // Success! Screen is now paired
    console.log('Screen paired:', completeData.screenId);
    // Refresh screen list, close modal, etc.
  } else {
    alert('Pairing failed: ' + (completeData.error || 'Unknown error'));
  }
};
```

### Option 2: Auto-Detect via SSE Events (Advanced)

Listen for `pairing_started` SSE events and automatically show the code:

```javascript
// Connect to SSE stream
const eventSource = new EventSource('http://192.168.1.7:3001/api/stream?key=admin');

eventSource.addEventListener('pairing_started', (event) => {
  const data = JSON.parse(event.data);
  
  // Show notification: "New device wants to pair: Code YZF8BS"
  // Display the code and allow user to click "Pair" to complete
  showPairingNotification({
    code: data.code,
    sessionId: data.sessionId,
    deviceModel: data.model,
    deviceName: data.name,
    ttlLeftMs: data.ttlLeftMs,
  });
});

// When user clicks "Pair" in notification:
const handleAutoPair = async (sessionData) => {
  const completeResponse = await fetch('http://192.168.1.7:3001/api/screens/pair/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code: sessionData.code,
      name: sessionData.deviceName,
      location: null, // Optional
    }),
  });
  
  const completeData = await completeResponse.json();
  if (completeData.ok) {
    // Success!
  }
};
```

### Option 3: List Active Sessions

Show all pending pairing sessions in the dashboard:

```javascript
// Fetch active sessions
const activeSessionsResponse = await fetch('http://192.168.1.7:3001/api/screens/pair/active');
const activeSessionsData = await activeSessionsResponse.json();

// Display list of pending pairings
activeSessionsData.sessions.forEach(session => {
  // Show: "Code: YZF8BS - Waiting for pairing..."
  // User can click to complete
});
```

## API Endpoints Reference

### 1. Check if code exists: `GET /api/screens/pair/peek/:code`

**Request:**
```
GET /api/screens/pair/peek/YZF8BS
```

**Response (code exists):**
```json
{
  "ok": true,
  "exists": true,
  "ttlLeftMs": 45000,
  "session": {
    "sessionId": "cmi3sr1f70000jvo09npaiwif",
    "code": "YZF8BS",
    "status": "showing_code",
    "fingerprint": "ABC123...",
    "model": "Tablet Model",
    "name": "Device Name",
    "location": null
  }
}
```

**Response (code not found/expired):**
```json
{
  "ok": true,
  "exists": false,
  "ttlLeftMs": 0
}
```

### 2. Complete pairing: `POST /api/screens/pair/complete`

**Request:**
```json
{
  "code": "YZF8BS",
  "name": "Front Desk Display",  // Optional
  "location": "Main Lobby"        // Optional
}
```

**Response (success):**
```json
{
  "ok": true,
  "screenId": "cmi3rfy1d0000jvs8xo0dhwdh",
  "token": "cmi3rfy1d0000jvs8xo0dhwdh-xyz123",
  "session": {
    "sessionId": "cmi3sr1f70000jvo09npaiwif",
    "code": "YZF8BS",
    "status": "bound",
    "expiresAt": "2025-11-17T23:59:59.000Z",
    "fingerprint": "ABC123...",
    "model": "Tablet Model",
    "name": "Front Desk Display",
    "location": "Main Lobby"
  }
}
```

**Response (error):**
```json
{
  "ok": false,
  "error": "invalid_or_expired_code"
}
```

### 3. Get active sessions: `GET /api/screens/pair/active`

**Response:**
```json
{
  "ok": true,
  "sessions": [
    {
      "code": "YZF8BS",
      "ttlLeftMs": 45000,
      "status": "showing_code"
    }
  ]
}
```

## Testing the Flow

You can test the complete flow using PowerShell:

```powershell
# 1. Tablet initiates pairing (simulated)
$initiate = Invoke-RestMethod -Uri "http://192.168.1.7:3001/api/screens/pair/initiate" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"fingerprint":"TEST123","model":"Test Tablet","name":"Test Device"}'

$code = $initiate.code
Write-Host "Code: $code"

# 2. Dashboard peeks at code
$peek = Invoke-RestMethod -Uri "http://192.168.1.7:3001/api/screens/pair/peek/$code"
Write-Host "Code exists: $($peek.exists)"

# 3. Dashboard completes pairing
$complete = Invoke-RestMethod -Uri "http://192.168.1.7:3001/api/screens/pair/complete" `
  -Method POST `
  -ContentType "application/json" `
  -Body "{`"code`":`"$code`",`"name`":`"Test Display`",`"location`":`"Test Location`"}"

Write-Host "Screen ID: $($complete.screenId)"
Write-Host "Token: $($complete.token)"
```

## Current Session Status

From the logs, there's an active session:
- **Session ID**: `cmi3sr1f70000jvo09npaiwif`
- **Status**: `showing_code`
- **TTL**: ~37 seconds remaining (decreasing)

To complete this session, the dashboard needs to:
1. Get the code from the session (you can use `GET /api/screens/pair/active` to see all active codes)
2. Call `POST /api/screens/pair/complete` with that code

## Next Steps

1. **Add code input field** to "Pair Device" modal in dashboard
2. **Implement `handlePair` function** that calls peek + complete
3. **(Optional) Add SSE listener** for auto-detection
4. **Test the flow** end-to-end

The backend is ready - just needs the frontend integration! 🚀


