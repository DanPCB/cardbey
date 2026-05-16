# SSE Broadcast for Pairing Session Creation

## Summary

Added SSE event broadcasting when a pairing session is created via `POST /api/screens/pair/initiate`.

## Implementation

### Changes Made

**File**: `src/routes/screens.js`

Added a new SSE broadcast event `screen.pair_session.created` that is emitted after a pairing session is successfully created.

### Event Details

- **Event Type**: `screen.pair_session.created`
- **Broadcast Target**: All connected SSE clients (including admin/router channel)
- **Payload Structure**:
  ```typescript
  {
    sessionId: string,
    code: string,
    expiresAt: number,
    ttlLeftMs: number,
    status: string, // "showing_code"
    fingerprint: string | null,
    model: string | null,
    name: string | null,
  }
  ```

### Important Notes

1. **Timing**: The event is broadcast immediately after session creation, before the HTTP response is sent.

2. **Device Information**: At `/initiate` time, `fingerprint`, `model`, and `name` are not yet available (they're only provided when the device calls `/register`). These fields will be `null` in the initial broadcast. The payload structure is included for consistency and future use.

3. **Error Handling**: The broadcast is wrapped in a try-catch block to ensure that SSE failures don't break the pairing flow. If the broadcast fails, it's logged but the HTTP request still succeeds.

4. **Existing Broadcast**: The existing `pair.code_created` broadcast is still sent (for backward compatibility), and the new `screen.pair_session.created` event is sent in addition to it.

### Code Location

The broadcast is added in the `/api/screens/pair/initiate` handler at lines 414-435 of `src/routes/screens.js`:

```javascript
// Broadcast screen.pair_session.created event for dashboard alerts
// This event is sent to all connected SSE clients (including admin/router channel)
// At /initiate time, fingerprint/model/name are not yet available (they come during /register)
try {
  broadcast('screen.pair_session.created', {
    sessionId: session.sessionId,
    code: session.code,
    expiresAt: session.expiresAt,
    ttlLeftMs,
    status: session.status,
    fingerprint: session.claimedBy?.fingerprint ?? req.body?.fingerprint ?? null,
    model: session.claimedBy?.model ?? req.body?.model ?? null,
    name: session.claimedBy?.name ?? req.body?.name ?? null,
  });
  console.log('[PAIR] Broadcasting screen.pair_session.created', { 
    sessionId: session.sessionId, 
    code: session.code 
  });
} catch (broadcastError) {
  // Don't fail the pairing request if SSE broadcast fails
  console.error('[PAIR] Failed to broadcast screen.pair_session.created:', broadcastError);
}
```

## Testing

### Manual Test

1. **Start the server**: `npm start`
2. **Connect to SSE stream** (from dashboard or test client):
   ```bash
   curl -N http://192.168.1.7:3001/api/stream?key=admin
   ```
3. **Create a pairing session**:
   ```bash
   curl -X POST http://192.168.1.7:3001/api/screens/pair/initiate \
     -H "Content-Type: application/json" \
     -d '{"requester": "dashboard", "ttlSec": 300}'
   ```
4. **Verify the SSE event**:
   - You should see the event in the SSE stream:
     ```
     event: screen.pair_session.created
     data: {"sessionId":"pair_...","code":"ABC123","expiresAt":...,"ttlLeftMs":300000,"status":"showing_code","fingerprint":null,"model":null,"name":null}
     ```
   - Check server logs for: `[PAIR] Broadcasting screen.pair_session.created`

### Expected Server Logs

When a pairing session is created, you should see:
```
[PAIR] INITIATE sessionId=pair_... code=ABC123 ttl=300s
[PAIR] Broadcasting screen.pair_session.created { sessionId: 'pair_...', code: 'ABC123' }
[SSE] Broadcast 'screen.pair_session.created' to 1 client(s)
```

## Integration with Dashboard

The Marketing Dashboard can now listen for `screen.pair_session.created` events to show "new device wants to pair" alerts.

Example event handler in the dashboard:
```typescript
eventSource.addEventListener('screen.pair_session.created', (event) => {
  const data = JSON.parse(event.data);
  // Show alert: "New pairing session: {data.code}"
  // Display session info: code, expiresAt, ttlLeftMs
});
```

## Related Files

- `src/routes/screens.js` - Pairing endpoint handler
- `src/realtime/sse.js` - SSE broadcast infrastructure
- `src/pair/sessionStore.js` - Pairing session management

