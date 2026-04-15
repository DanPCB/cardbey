# Backend CORS Requirements

## Overview

The cardbey-core backend must properly handle CORS (Cross-Origin Resource Sharing) to allow the marketing dashboard (running at `http://localhost:5174`) to connect to the core API (running at `http://192.168.1.7:3001` or other addresses).

## Required Configuration

### 1. Allowed Origins

The backend must allow requests from:
- `http://localhost:5174` (local development)
- `http://127.0.0.1:5174` (local development alternative)
- `http://192.168.1.7:5174` (LAN access)
- Any origins specified in environment variables:
  - `ALLOWED_ORIGINS` (comma-separated list)
  - `CORS_WHITELIST` (comma-separated list)
  - `STUDIO_URL`
  - `PLAYER_URL`
  - `PLAYER_ORIGIN`

### 2. CORS Middleware Configuration

The backend uses the `cors` package with the following configuration:

```javascript
import cors from 'cors';
import { isOriginAllowed } from './config/cors.js';

app.use(cors({
  origin(origin, callback) {
    if (!origin || isOriginAllowed(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`Origin not allowed: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-cardbey-context'],
}));

// Handle OPTIONS preflight for all routes
app.options('*', cors());
```

### 3. SSE-Specific CORS Configuration

Server-Sent Events (SSE) routes require special handling because they use long-lived connections:

```javascript
import cors from 'cors';
import { isOriginAllowed } from './config/cors.js';

// CORS options for SSE - credentials not needed for SSE
const sseCorsOptions = {
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

// Apply to SSE routes
router.options('/stream', cors(sseCorsOptions), (req, res) => {
  return res.sendStatus(204);
});

router.get('/stream', cors(sseCorsOptions), (req, res, next) => {
  // Setup SSE-specific headers (CORS already handled by middleware)
  setupSseHeaders(res);
  // ... rest of SSE handler
});
```

### 4. SSE Headers Setup

SSE routes must set proper headers (non-CORS headers only - CORS is handled by middleware):

```javascript
function setupSseHeaders(res) {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
}
```

**Important**: Do NOT manually set `Access-Control-Allow-Origin` in SSE handlers. The `cors()` middleware handles this automatically.

## Implementation Files

### Core CORS Configuration
- **File**: `src/config/cors.js`
- **Exports**: `WHITELIST`, `isOriginAllowed(origin)`

### Global CORS Middleware
- **File**: `src/server.js`
- **Location**: Applied globally with `app.use(cors({...}))`

### SSE Routes
- **File**: `src/realtime/sse.js`
- **Routes**: 
  - `GET /api/stream`
  - `OPTIONS /api/stream`
- **Uses**: `cors(sseCorsOptions)` middleware

### Legacy SSE Routes (if used)
- **File**: `src/routes/sse.routes.js`
- **Routes**: 
  - `GET /api/stream`
  - `OPTIONS /api/stream`
  - `GET /api/stream/preview`
- **Uses**: `cors(sseCorsOptions)` middleware

## Testing CORS Configuration

### Test OPTIONS Preflight

```bash
# Test OPTIONS request
curl -X OPTIONS http://192.168.1.7:3001/api/stream \
  -H "Origin: http://localhost:5174" \
  -H "Access-Control-Request-Method: GET" \
  -v

# Expected response:
# HTTP/1.1 204 No Content
# Access-Control-Allow-Origin: http://localhost:5174
# Access-Control-Allow-Methods: GET,OPTIONS
# Access-Control-Allow-Headers: Content-Type, Authorization
```

### Test SSE Connection

```bash
# Test SSE GET request
curl -N http://192.168.1.7:3001/api/stream \
  -H "Origin: http://localhost:5174" \
  -v

# Expected response:
# HTTP/1.1 200 OK
# Content-Type: text/event-stream; charset=utf-8
# Cache-Control: no-cache, no-transform
# Connection: keep-alive
# Access-Control-Allow-Origin: http://localhost:5174
# 
# :connected
# event: ready
# data: {"ok":true,"timestamp":...}
```

### Test from Browser Console

```javascript
// In browser console at http://localhost:5174
const eventSource = new EventSource('http://192.168.1.7:3001/api/stream');
eventSource.onopen = () => console.log('SSE connected');
eventSource.onerror = (e) => console.error('SSE error:', e);
eventSource.onmessage = (e) => console.log('SSE message:', e.data);
```

## Common Issues and Solutions

### Issue: "Cross-Origin Request Blocked"

**Cause**: Origin not in whitelist or CORS headers not set correctly.

**Solution**: 
1. Verify origin is in `src/config/cors.js` whitelist
2. Ensure `cors()` middleware is applied to the route
3. Check that OPTIONS handler returns proper headers

### Issue: "CORS request did not succeed"

**Cause**: OPTIONS preflight failing or network error.

**Solution**:
1. Verify OPTIONS handler exists and returns 204
2. Check that `Access-Control-Allow-Methods` includes the request method
3. Verify network connectivity between dashboard and core

### Issue: SSE connection closes immediately

**Cause**: Headers not set before writing to response, or CORS error.

**Solution**:
1. Ensure `setupSseHeaders()` is called before any `res.write()`
2. Verify CORS middleware runs before SSE handler
3. Check that `Access-Control-Allow-Origin` matches request origin exactly

## Environment Variables

You can configure additional allowed origins via environment variables:

```bash
# .env file
ALLOWED_ORIGINS=http://localhost:5174,http://192.168.1.7:5174
CORS_WHITELIST=http://example.com:5174
STUDIO_URL=http://studio.example.com
PLAYER_URL=http://player.example.com
```

## Verification Checklist

- [x] `http://localhost:5174` is in CORS whitelist
- [x] Global CORS middleware is applied
- [x] SSE routes use `cors()` middleware
- [x] OPTIONS handlers exist for SSE routes
- [x] SSE headers are set correctly (non-CORS headers only)
- [x] No manual `Access-Control-Allow-Origin` setting in SSE code
- [x] `credentials: false` for SSE (credentials not needed)
- [x] `credentials: true` for regular API routes (if using cookies/auth)

## Date

Last updated: 2025-01-XX

