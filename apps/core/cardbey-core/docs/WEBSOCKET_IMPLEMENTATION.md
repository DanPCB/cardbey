# WebSocket Implementation for cardbey-core

## Summary

WebSocket support has been added to the cardbey-core backend to enable real-time bidirectional communication with the frontend. The WebSocket server runs on the same path as the SSE endpoint (`/api/stream`) and automatically handles HTTP upgrade requests.

## What Was Implemented

### 1. Installed Dependencies
- ✅ `ws` package installed (WebSocket server library)

### 2. Created WebSocket Server Module
- **File**: `src/realtime/websocket.js`
- **Features**:
  - WebSocket server initialization
  - API key validation (JWT tokens, dev keys)
  - CORS support with origin whitelist
  - Client connection management
  - Broadcast functionality for logs and events
  - Heartbeat mechanism (30s intervals)
  - Graceful cleanup on disconnect

### 3. Integrated into Server
- **File**: `src/server.js`
- WebSocket server initialized after HTTP server starts
- Graceful shutdown handlers added

### 4. CORS Configuration
- **File**: `src/config/cors.js`
- Added `websocketCorsOptions` with credentials support
- Allows origins: `http://localhost:5174`, `http://127.0.0.1:5174`, `http://192.168.1.7:5174`

## API Key Validation

The WebSocket server validates API keys from the query parameter `key`:

1. **Dev Mode Keys** (non-production):
   - `key=admin` - Admin access
   - `key=public` - Public access

2. **JWT Tokens** (production):
   - Validates JWT token against `JWT_SECRET`
   - Fetches user from database
   - Attaches user info to connection

## Connection Endpoint

```
ws://192.168.1.7:3001/api/stream?key=<API_KEY>
```

**Note**: The same path (`/api/stream`) is used for both SSE and WebSocket. The server automatically detects the connection type:
- WebSocket upgrade requests → Handled by WebSocket server
- Regular GET requests → Handled by SSE route

## Usage Examples

### Broadcasting Logs

```javascript
import { broadcastLog } from './realtime/websocket.js';

// Broadcast info log
broadcastLog('info', 'Server started', { timestamp: Date.now() });

// Broadcast error log
broadcastLog('error', 'Database connection failed', { error: 'Connection timeout' });

// Broadcast debug log
broadcastLog('debug', 'Processing request', { requestId: '123' });
```

### Broadcasting Events

```javascript
import { broadcastEvent } from './realtime/websocket.js';

// Broadcast screen update event
broadcastEvent('screen.updated', {
  screenId: '123',
  status: 'online',
  lastSeen: Date.now(),
});

// Broadcast pairing event
broadcastEvent('screen.pair_session.created', {
  sessionId: 'abc123',
  code: '1234',
  expiresAt: Date.now() + 300000,
});
```

### Custom Broadcasts

```javascript
import { broadcast } from './realtime/websocket.js';

// Broadcast custom message to all clients
broadcast({
  type: 'custom',
  data: { message: 'Hello from server' },
});

// Broadcast to specific API key
broadcast({
  type: 'admin_notification',
  message: 'System maintenance in 5 minutes',
}, { key: 'admin' });

// Broadcast to specific user
broadcast({
  type: 'user_notification',
  message: 'Your screen is now online',
}, { userId: 'user123' });
```

## Client Connection Example

### JavaScript (Browser)

```javascript
const apiKey = localStorage.getItem('API_KEY'); // or get from login
const ws = new WebSocket(`ws://192.168.1.7:3001/api/stream?key=${apiKey}`);

ws.onopen = () => {
  console.log('WebSocket connected');
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  console.log('Received:', message);
  
  switch (message.type) {
    case 'log':
      console.log(`[${message.level}]`, message.message);
      break;
    case 'event':
      handleEvent(message.event, message.data);
      break;
    case 'heartbeat':
      // Connection is alive
      break;
  }
};

ws.onerror = (error) => {
  console.error('WebSocket error:', error);
};

ws.onclose = () => {
  console.log('WebSocket disconnected');
  // Implement reconnection logic here
};
```

## Message Format

All messages are JSON strings with the following structure:

```typescript
{
  type: 'connected' | 'log' | 'event' | 'heartbeat' | 'error',
  timestamp: number,
  // Additional fields based on type
}
```

### Connected Message
```json
{
  "type": "connected",
  "clientId": "1234567890-abc123",
  "timestamp": 1234567890,
  "message": "WebSocket connection established"
}
```

### Log Message
```json
{
  "type": "log",
  "level": "info" | "warn" | "error" | "debug",
  "message": "Log message text",
  "timestamp": 1234567890
}
```

### Event Message
```json
{
  "type": "event",
  "event": "screen.updated",
  "data": {
    "screenId": "123",
    "status": "online"
  },
  "timestamp": 1234567890
}
```

### Heartbeat Message
```json
{
  "type": "heartbeat",
  "timestamp": 1234567890
}
```

## Server Functions

### `initializeWebSocketServer(server)`
Initializes the WebSocket server on the provided HTTP server instance.

### `broadcast(message, options)`
Broadcasts a message to all connected clients (or filtered subset).

**Parameters**:
- `message` (Object): Message to broadcast
- `options` (Object, optional):
  - `key` (string): Filter by API key
  - `userId` (string): Filter by user ID

### `broadcastLog(level, message, metadata)`
Broadcasts a log message.

**Parameters**:
- `level` (string): Log level ('info', 'warn', 'error', 'debug')
- `message` (string): Log message
- `metadata` (Object, optional): Additional metadata

### `broadcastEvent(eventType, payload)`
Broadcasts an event.

**Parameters**:
- `eventType` (string): Event type identifier
- `payload` (Object): Event data

### `getConnectedClientsCount()`
Returns the number of currently connected clients.

### `getConnectedClients()`
Returns an array of connected client information (for debugging).

### `closeWebSocketServer()`
Gracefully closes the WebSocket server and all client connections.

## CORS Configuration

The WebSocket server validates origins against the whitelist:
- `http://localhost:5174`
- `http://127.0.0.1:5174`
- `http://192.168.1.7:5174`
- Any origin matching `http://192.168.1.*` pattern
- `DASHBOARD_ORIGIN` environment variable

## Security

1. **API Key Validation**: All connections require a valid API key
2. **Origin Whitelist**: Only allowed origins can connect
3. **JWT Verification**: Production mode validates JWT tokens
4. **User Context**: User information is attached to each connection

## Testing

### Test WebSocket Connection

```bash
# Using wscat (install: npm install -g wscat)
wscat -c "ws://192.168.1.7:3001/api/stream?key=admin"
```

### Test from Browser Console

```javascript
const ws = new WebSocket('ws://192.168.1.7:3001/api/stream?key=admin');
ws.onopen = () => console.log('Connected');
ws.onmessage = (e) => console.log('Message:', JSON.parse(e.data));
```

## Troubleshooting

### Connection Refused
- Check that the server is running
- Verify the API key is valid
- Check CORS origin whitelist

### Authentication Failed
- Verify API key format (JWT token or dev key)
- Check `JWT_SECRET` environment variable
- Ensure user exists in database (for JWT tokens)

### Messages Not Received
- Check client connection status
- Verify message format is valid JSON
- Check server logs for broadcast errors

## Notes

- WebSocket and SSE share the same path (`/api/stream`) but are handled separately
- WebSocket connections support bidirectional communication (client can send messages)
- SSE connections are unidirectional (server → client only)
- Heartbeat messages are sent every 30 seconds to keep connections alive
- Dead connections are automatically cleaned up

