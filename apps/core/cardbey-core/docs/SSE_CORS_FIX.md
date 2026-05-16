# SSE CORS Fix - Normalized Configuration

## Summary

Fixed SSE CORS issues by normalizing CORS configuration and ensuring consistent CORS handling across all routes, including SSE endpoints.

## Changes Made

### 1. Normalized CORS Configuration

**File**: `src/config/cors.js`

- Exported `corsOptions` for JSON APIs (with credentials)
- Exported `sseCorsOptions` for SSE routes (without credentials)
- Both use the same origin checking logic via `isOriginAllowed()`

```javascript
export const corsOptions = {
  origin(origin, callback) {
    if (!origin || isOriginAllowed(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`CORS blocked origin: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-cardbey-context'],
};

export const sseCorsOptions = {
  origin(origin, callback) {
    if (!origin || isOriginAllowed(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`CORS blocked origin: ${origin}`));
  },
  credentials: false, // SSE doesn't need credentials
  methods: ['GET', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};
```

### 2. Updated Global CORS Middleware

**File**: `src/server.js`

- Changed from inline CORS config to using exported `corsOptions`
- Ensures consistency across all routes

```javascript
import { corsOptions } from './config/cors.js';

// Global CORS middleware for all routes
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
```

### 3. Updated SSE Routes

**File**: `src/realtime/sse.js`

- Uses exported `sseCorsOptions` from config
- Added connection logging for debugging
- Handles both `/api/stream` and `/api/stream?key=admin`

```javascript
import { sseCorsOptions } from '../config/cors.js';

router.options('/stream', cors(sseCorsOptions), (req, res) => {
  return res.sendStatus(204);
});

router.get('/stream', cors(sseCorsOptions), (req, res, next) => {
  const origin = req.headers.origin || 'no-origin';
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  const key = req.query?.key;
  const label = key === 'admin' ? 'admin' : 'default';
  
  // Log connection attempt
  console.log(`[SSE] ${label} stream connection from origin=${origin} ip=${ip} key=${key || 'none'}`);
  
  // Setup SSE-specific headers (CORS already handled by middleware)
  setupSseHeaders(res);
  
  // Attach client and start stream
  attachClient(req, res, { label: `router-${label}` });
  
  // Log successful connection
  console.log(`[SSE] ${label} stream connected successfully from origin=${origin}`);
});
```

**File**: `src/routes/sse.routes.js`

- Updated to use exported `sseCorsOptions`
- Added connection logging
- Handles `/api/stream?key=admin` variant

### 4. SSE Headers Setup

The `setupSseHeaders()` function only sets non-CORS headers:

```javascript
export function setupSseHeaders(res) {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
}
```

**Important**: No manual CORS headers are set in SSE handlers - the `cors()` middleware handles all CORS headers automatically.

## Allowed Origins

Origins are checked against whitelist in `src/config/cors.js`:
- `http://192.168.1.7:5174`
- `http://127.0.0.1:5174`
- `http://localhost:5174`
- Plus any origins from environment variables:
  - `ALLOWED_ORIGINS`
  - `CORS_WHITELIST`
  - `STUDIO_URL`
  - `PLAYER_URL`
  - `PLAYER_ORIGIN`

## Route Mounting Order

SSE routes are mounted early in `src/server.js`:

```javascript
// MOUNT EARLY (before other routers and before any SPA fallback)
app.use('/api', realtimeRoutes);  // Contains /api/stream
app.use('/api', screensRoutes);
// ... other routes
```

This ensures SSE routes get CORS headers from both:
1. Global CORS middleware (`app.use(cors(corsOptions))`)
2. Route-specific CORS middleware (`cors(sseCorsOptions)`)

## Testing

### Test OPTIONS Preflight

```bash
curl -X OPTIONS http://192.168.1.7:3001/api/stream \
  -H "Origin: http://localhost:5174" \
  -H "Access-Control-Request-Method: GET" \
  -v
```

Expected: `204 No Content` with `Access-Control-Allow-Origin: http://localhost:5174`

### Test SSE GET Request

```bash
curl -N http://192.168.1.7:3001/api/stream \
  -H "Origin: http://localhost:5174" \
  -v
```

Expected: `200 OK` with `Content-Type: text/event-stream` and `Access-Control-Allow-Origin: http://localhost:5174`

### Test from Browser Console

```javascript
// In browser console at http://localhost:5174
const eventSource = new EventSource('http://192.168.1.7:3001/api/stream');
eventSource.onopen = () => console.log('SSE connected');
eventSource.onerror = (e) => console.error('SSE error:', e);
eventSource.onmessage = (e) => console.log('SSE message:', e.data);
```

## Logging

SSE connections now log:
- Connection attempts with origin, IP, and key
- Successful connections
- Connection type (admin vs default)

Example logs:
```
[SSE] admin stream connection from origin=http://localhost:5174 ip=::ffff:192.168.1.100 key=admin
[SSE] admin stream connected successfully from origin=http://localhost:5174
```

## Files Changed

1. `src/config/cors.js` - Normalized CORS options exports
2. `src/server.js` - Use normalized corsOptions
3. `src/realtime/sse.js` - Use sseCorsOptions, add logging
4. `src/routes/sse.routes.js` - Use sseCorsOptions, add logging

## Date

Fixed: 2025-01-XX


