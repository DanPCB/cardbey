# CORS Cleanup Summary

## Overview

Cleaned up and verified CORS configuration for SSE and playlist routes to ensure consistent CORS handling across all endpoints.

## Changes Made

### 1. Updated Global CORS Options

**File**: `src/config/cors.js`

Added `Cache-Control` and `Last-Event-ID` to the global `corsOptions` allowed headers:

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
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'x-cardbey-context',
    'Cache-Control',      // Added
    'Last-Event-ID',      // Added
  ],
};
```

### 2. Verified SSE CORS Configuration

**File**: `src/realtime/sse.js`

- SSE routes use `sseCorsOptions` which allows:
  - Origins: `http://localhost:5174`, `http://127.0.0.1:5174`, `http://192.168.1.7:5174`
  - Methods: `GET`, `OPTIONS`
  - Headers: `Content-Type`, `Cache-Control`, `Last-Event-ID`, `Accept`, `Authorization`

- Both `/api/stream` and `/api/stream?key=admin` use the same CORS config via the same route handler

- OPTIONS handler returns 204 with proper CORS headers

- Added debug logging:
  ```javascript
  console.log('[SSE] Connection open', {
    url: req.originalUrl,
    origin: req.headers.origin,
    ip: ip,
    key: key || 'none',
    label: label,
  });
  ```

### 3. Verified Playlist Routes CORS

**File**: `src/routes/screens.js`

- `/api/screens/:id/playlist` (GET and PUT) routes are mounted via `screensRoutes` router
- These routes use the global CORS middleware applied in `src/server.js`:
  ```javascript
  app.use(cors(corsOptions));  // Applied globally before route mounting
  app.use('/api', screensRoutes);  // Mounted after CORS middleware
  ```

- Both routes inherit the same CORS configuration as `/api/screens?limit=...`

## CORS Configuration Summary

### Allowed Origins
- `http://localhost:5174` ✅
- `http://127.0.0.1:5174` ✅
- `http://192.168.1.7:5174` ✅
- Plus any from environment variables

### Allowed Methods
- JSON APIs: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS` ✅
- SSE: `GET`, `OPTIONS` ✅

### Allowed Headers
- JSON APIs: `Content-Type`, `Authorization`, `x-cardbey-context`, `Cache-Control`, `Last-Event-ID` ✅
- SSE: `Content-Type`, `Cache-Control`, `Last-Event-ID`, `Accept`, `Authorization` ✅

## Route Mounting Order

Routes are mounted in this order in `src/server.js`:

1. Global CORS middleware: `app.use(cors(corsOptions))`
2. Global OPTIONS handler: `app.options('*', cors(corsOptions))`
3. SSE routes: `app.use('/api', realtimeRoutes)` - Contains `/api/stream`
4. Screen routes: `app.use('/api', screensRoutes)` - Contains `/api/screens/:id/playlist`

This ensures all routes get CORS headers from the global middleware.

## Verification

### SSE Routes
- ✅ `/api/stream` uses `cors(sseCorsOptions)` middleware
- ✅ `/api/stream?key=admin` uses the same route handler (query param handled)
- ✅ OPTIONS handler returns 204 with CORS headers
- ✅ Debug logging shows origin when connection opens

### Playlist Routes
- ✅ `GET /api/screens/:id/playlist` uses global CORS middleware
- ✅ `PUT /api/screens/:id/playlist` uses global CORS middleware
- ✅ Same CORS config as `/api/screens?limit=...`

## Testing

All tests pass. The CORS configuration is now consistent across:
- JSON API routes (screens, playlists, etc.)
- SSE routes (`/api/stream`, `/api/stream?key=admin`)
- Playlist routes (`/api/screens/:id/playlist`)

## Debug Logging

SSE connections now log:
```
[SSE] Connection open {
  url: '/api/stream?key=admin',
  origin: 'http://localhost:5174',
  ip: '::ffff:192.168.1.100',
  key: 'admin',
  label: 'admin'
}
```

This helps verify:
- The origin the browser is actually using
- Whether the connection is reaching the server
- Which route variant is being used

## Files Changed

1. `src/config/cors.js` - Added `Cache-Control` and `Last-Event-ID` to global CORS headers
2. `src/realtime/sse.js` - Updated debug logging format

## Date

Cleaned up: 2025-01-XX


