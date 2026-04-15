# Complete SSE Implementation for cardbey-core

## Summary

This document provides a complete, production-ready SSE (Server-Sent Events) implementation that allows the frontend at `http://localhost:5174` to connect to the backend at `192.168.1.7:3001` via `/api/stream?key=<API_KEY>`.

## Requirements Met

✅ CORS middleware with `origin: http://localhost:5174` and `credentials: true`  
✅ SSE route at `/api/stream`  
✅ Keep-alive heartbeat every 15 seconds  
✅ API key validation (JWT tokens, dev keys, user validation)  
✅ Proper SSE headers  
✅ Event broadcasting via event emitter pattern  

## Complete Server.js Snippet

```javascript
/**
 * Cardbey Core API Server
 * Complete SSE implementation with CORS and key validation
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { corsOptions } from './config/cors.js';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const app = express();
const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-change-this';

// ============================================================================
// CORS MIDDLEWARE
// ============================================================================

// Global CORS middleware - allows http://localhost:5174 with credentials
app.use(cors({
  origin: (origin, callback) => {
    const allowedOrigins = [
      'http://localhost:5174',
      'http://127.0.0.1:5174',
      'http://192.168.1.7:5174',
    ];
    
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true, // Allow credentials (cookies, authorization headers)
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));

// ============================================================================
// SSE CLIENT MANAGEMENT
// ============================================================================

const sseClients = new Map(); // Store active SSE connections

/**
 * Validate API key from query parameter
 * Supports:
 * - JWT tokens (validated against JWT_SECRET)
 * - Dev keys: 'admin', 'public' (non-production only)
 * - User tokens from database
 */
async function validateApiKey(key) {
  if (!key) {
    return { valid: false, error: 'API key required' };
  }

  // Dev mode: allow 'admin' and 'public' keys
  if (process.env.NODE_ENV !== 'production') {
    if (key === 'admin' || key === 'public') {
      return { 
        valid: true, 
        user: { id: 'admin', role: 'admin' },
        keyType: 'dev'
      };
    }
  }

  // Try to validate as JWT token
  try {
    const decoded = jwt.verify(key, JWT_SECRET);
    
    // Get user from database
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId }
    });

    if (!user) {
      return { valid: false, error: 'User not found' };
    }

    return { 
      valid: true, 
      user,
      keyType: 'jwt'
    };
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return { valid: false, error: 'Invalid API key' };
    }
    if (error.name === 'TokenExpiredError') {
      return { valid: false, error: 'API key expired' };
    }
    return { valid: false, error: 'Authentication failed' };
  }
}

/**
 * Broadcast message to all connected SSE clients
 */
function broadcastToClients(event, data, filterKey = null) {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  let sentCount = 0;

  sseClients.forEach((client, clientId) => {
    // Apply filter if specified
    if (filterKey && client.key !== filterKey) {
      return;
    }

    // Send message if connection is still open
    if (!client.res.writableEnded && !client.res.destroyed) {
      try {
        client.res.write(message);
        sentCount++;
      } catch (error) {
        console.error(`[SSE] Error sending to client ${clientId}:`, error);
        // Remove dead client
        sseClients.delete(clientId);
      }
    } else {
      // Remove closed client
      sseClients.delete(clientId);
    }
  });

  if (sentCount > 0) {
    console.log(`[SSE] Broadcast '${event}' to ${sentCount} client(s)`);
  }
}

// ============================================================================
// SSE ROUTE: /api/stream
// ============================================================================

/**
 * OPTIONS handler for CORS preflight
 */
app.options('/api/stream', (req, res) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'http://localhost:5174',
    'http://127.0.0.1:5174',
    'http://192.168.1.7:5174',
  ];

  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', 'http://localhost:5174');
  }
  
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.status(204).end();
});

/**
 * GET /api/stream - SSE endpoint
 * 
 * Query parameters:
 *   - key: API key (required) - JWT token or dev key ('admin', 'public')
 * 
 * Headers:
 *   - Origin: Must be from allowed origins (http://localhost:5174, etc.)
 */
app.get('/api/stream', async (req, res) => {
  // ========================================================================
  // STEP 1: Set CORS headers FIRST (before any other processing)
  // ========================================================================
  const origin = req.headers.origin;
  const allowedOrigins = [
    'http://localhost:5174',
    'http://127.0.0.1:5174',
    'http://192.168.1.7:5174',
  ];

  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', 'http://localhost:5174');
  }
  
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  
  // ========================================================================
  // STEP 2: Set SSE-specific headers
  // ========================================================================
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
  
  // ========================================================================
  // STEP 3: Configure socket for long-lived connection
  // ========================================================================
  if (req.socket) {
    req.socket.setKeepAlive(true);
    req.socket.setTimeout(0); // No timeout
    req.socket.setNoDelay(true); // Disable Nagle's algorithm
  }
  
  // ========================================================================
  // STEP 4: Flush headers immediately
  // ========================================================================
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  } else if (typeof res.flush === 'function') {
    res.flush();
  }
  
  // ========================================================================
  // STEP 5: Validate API key
  // ========================================================================
  const apiKey = req.query.key;
  
  if (!apiKey) {
    res.write(`event: error\ndata: ${JSON.stringify({ error: 'API key required' })}\n\n`);
    res.end();
    return;
  }

  const keyValidation = await validateApiKey(apiKey);
  
  if (!keyValidation.valid) {
    res.write(`event: error\ndata: ${JSON.stringify({ error: keyValidation.error })}\n\n`);
    res.end();
    return;
  }

  // ========================================================================
  // STEP 6: Register client and send initial connection message
  // ========================================================================
  const clientId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  
  sseClients.set(clientId, {
    id: clientId,
    res,
    key: apiKey,
    user: keyValidation.user,
    connectedAt: Date.now(),
  });

  console.log('[SSE] Client connected', {
    id: clientId,
    origin: origin || 'no-origin',
    userId: keyValidation.user.id,
    keyType: keyValidation.keyType,
  });

  // Send initial connection confirmation
  res.write(`event: connected\ndata: ${JSON.stringify({ 
    ok: true, 
    clientId,
    timestamp: Date.now() 
  })}\n\n`);

  // ========================================================================
  // STEP 7: Set up keep-alive heartbeat (every 15 seconds)
  // ========================================================================
  const heartbeatInterval = setInterval(() => {
    // Check if connection is still open
    if (res.writableEnded || res.destroyed) {
      clearInterval(heartbeatInterval);
      sseClients.delete(clientId);
      return;
    }

    try {
      // Send keep-alive comment (SSE spec: lines starting with : are comments)
      res.write(`:\n\n`);
    } catch (error) {
      console.error('[SSE] Error sending heartbeat:', error);
      clearInterval(heartbeatInterval);
      sseClients.delete(clientId);
    }
  }, 15000); // 15 seconds

  // ========================================================================
  // STEP 8: Cleanup on client disconnect
  // ========================================================================
  const cleanup = () => {
    clearInterval(heartbeatInterval);
    sseClients.delete(clientId);
    console.log('[SSE] Client disconnected', { id: clientId });
  };

  req.on('close', () => {
    cleanup();
    if (!res.writableEnded && !res.destroyed) {
      try {
        res.end();
      } catch (err) {
        // Ignore errors if response is already ended
      }
    }
  });

  req.on('error', (error) => {
    console.error('[SSE] Request error:', error);
    cleanup();
  });

  res.on('error', (error) => {
    console.error('[SSE] Response error:', error);
    cleanup();
  });

  // ========================================================================
  // STEP 9: Keep connection open (DO NOT call res.end() here)
  // ========================================================================
  // The connection stays open until the client disconnects
  // Express will not try to end the response because we've already started writing
});

// ============================================================================
// EXAMPLE: Broadcast logs and events
// ============================================================================

/**
 * Example: Broadcast a log message to all connected clients
 */
function broadcastLog(level, message, metadata = {}) {
  broadcastToClients('log', {
    level, // 'info', 'warn', 'error', 'debug'
    message,
    timestamp: Date.now(),
    ...metadata,
  });
}

/**
 * Example: Broadcast an event to all connected clients
 */
function broadcastEvent(eventType, payload) {
  broadcastToClients('event', {
    type: eventType,
    data: payload,
    timestamp: Date.now(),
  });
}

// Example usage:
// broadcastLog('info', 'Server started', { version: '1.0.0' });
// broadcastEvent('screen.updated', { screenId: '123', status: 'online' });

// ============================================================================
// START SERVER
// ============================================================================

const PORT = process.env.PORT || 3001;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[CORE] Server listening on http://0.0.0.0:${PORT}`);
  console.log(`[CORE] SSE endpoint: http://0.0.0.0:${PORT}/api/stream?key=<API_KEY>`);
  console.log(`[CORE] Allowed origins: http://localhost:5174, http://127.0.0.1:5174, http://192.168.1.7:5174`);
});
```

## Client-Side Usage

### JavaScript (Browser)

```javascript
// Get API key from localStorage (set after login)
const apiKey = localStorage.getItem('API_KEY');

// Create EventSource connection
const eventSource = new EventSource(`http://192.168.1.7:3001/api/stream?key=${apiKey}`);

// Handle connection opened
eventSource.onopen = () => {
  console.log('SSE connection opened');
};

// Handle generic messages
eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Message received:', data);
};

// Handle specific event types
eventSource.addEventListener('connected', (event) => {
  const data = JSON.parse(event.data);
  console.log('Connected:', data);
});

eventSource.addEventListener('log', (event) => {
  const data = JSON.parse(event.data);
  console.log(`[${data.level}]`, data.message);
});

eventSource.addEventListener('event', (event) => {
  const data = JSON.parse(event.data);
  console.log('Event:', data.type, data.data);
});

// Handle errors
eventSource.onerror = (error) => {
  console.error('SSE error:', error);
  // EventSource will automatically reconnect
};

// Close connection
// eventSource.close();
```

## Testing

### Test with curl

```bash
# Test OPTIONS preflight
curl -X OPTIONS http://192.168.1.7:3001/api/stream \
  -H "Origin: http://localhost:5174" \
  -H "Access-Control-Request-Method: GET" \
  -v

# Test SSE connection (with dev key)
curl -N http://192.168.1.7:3001/api/stream?key=admin \
  -H "Origin: http://localhost:5174" \
  -v
```

### Test from Browser Console

```javascript
const es = new EventSource('http://192.168.1.7:3001/api/stream?key=admin');
es.onmessage = (e) => console.log('Message:', JSON.parse(e.data));
es.addEventListener('log', (e) => console.log('Log:', JSON.parse(e.data)));
```

## Key Features

1. **CORS Support**: Allows `http://localhost:5174` with credentials
2. **API Key Validation**: Supports JWT tokens and dev keys
3. **Keep-Alive**: Sends `:\n\n` every 15 seconds
4. **Event Broadcasting**: Broadcast logs and events to all connected clients
5. **Proper Headers**: All required SSE headers set correctly
6. **Graceful Cleanup**: Properly handles client disconnects
7. **Error Handling**: Validates keys and sends error events

## Headers Set

- `Content-Type: text/event-stream; charset=utf-8`
- `Cache-Control: no-cache, no-transform`
- `Connection: keep-alive`
- `Access-Control-Allow-Origin: http://localhost:5174` (or request origin)
- `Access-Control-Allow-Credentials: true`
- `X-Accel-Buffering: no` (prevents nginx buffering)

## Notes

- The connection stays open until the client disconnects
- Heartbeat is sent every 15 seconds to keep the connection alive
- Dead connections are automatically cleaned up
- API key validation supports both JWT tokens and dev keys
- CORS is configured to allow credentials for authenticated requests

