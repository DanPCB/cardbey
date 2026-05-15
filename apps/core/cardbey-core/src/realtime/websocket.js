/**
 * WebSocket Server for Real-time Events
 * 
 * Provides WebSocket support for /api/stream endpoint
 * - Validates API key from query parameters
 * - Broadcasts logs and events to connected clients
 * - Supports CORS with credentials
 * - Graceful cleanup on disconnect
 */

import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-change-this';

// Store connected clients
const clients = new Map();

// Allowed origins for CORS
const ALLOWED_ORIGINS = [
  'http://localhost:5174',
  'http://127.0.0.1:5174',
  'http://192.168.1.7:5174',
  process.env.DASHBOARD_ORIGIN,
].filter(Boolean);

/**
 * Check if origin is allowed for WebSocket connections
 */
function isOriginAllowed(origin) {
  if (!origin) return true; // Allow same-origin connections
  return ALLOWED_ORIGINS.some(allowed => origin === allowed || origin.startsWith('http://192.168.1.'));
}

/**
 * Validate API key from query parameters
 * Supports:
 * - JWT token in 'key' query param
 * - 'admin' key for dev mode
 * - 'public' key for public access
 */
async function validateApiKey(key, origin) {
  if (!key) {
    return { valid: false, error: 'API key required' };
  }

  // Dev mode: allow 'admin' and 'public' keys
  if (process.env.NODE_ENV !== 'production') {
    if (key === 'admin' || key === 'public') {
      return { valid: true, user: { id: 'admin', role: 'admin' } };
    }
  }

  // Try to validate as JWT token
  try {
    const decoded = jwt.verify(key, JWT_SECRET);
    
    // Get user from database
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: { businesses: true }
    });

    if (!user) {
      return { valid: false, error: 'User not found' };
    }

    return { valid: true, user };
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
 * Create WebSocket server instance
 */
let wss = null;

/**
 * Initialize WebSocket server
 * @param {http.Server} server - HTTP server instance
 */
export function initializeWebSocketServer(server) {
  if (wss) {
    console.warn('[WebSocket] Server already initialized');
    return wss;
  }

  // Create WebSocket server
  wss = new WebSocketServer({
    server,
    path: '/api/stream',
    verifyClient: (info, callback) => {
      // Extract origin from headers
      const origin = info.origin || info.req.headers.origin;
      
      // Check CORS
      if (!isOriginAllowed(origin)) {
        console.warn('[WebSocket] Origin not allowed:', origin);
        return callback(false, 403, 'Origin not allowed');
      }

      // Extract API key from query string
      const url = new URL(info.req.url, `http://${info.req.headers.host}`);
      const key = url.searchParams.get('key');

      if (!key) {
        console.warn('[WebSocket] No API key provided');
        return callback(false, 401, 'API key required');
      }

      // Validate API key asynchronously
      validateApiKey(key, origin).then((result) => {
        if (result.valid) {
          // Store user info in request for later use
          info.req.user = result.user;
          info.req.apiKey = key;
          callback(true);
        } else {
          console.warn('[WebSocket] Invalid API key:', result.error);
          callback(false, 401, result.error);
        }
      }).catch((error) => {
        console.error('[WebSocket] Error validating API key:', error);
        callback(false, 500, 'Authentication error');
      });
    },
  });

  // Handle new connections
  wss.on('connection', (ws, req) => {
    const clientId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const origin = req.headers.origin || 'unknown';
    const apiKey = req.apiKey || 'unknown';
    const user = req.user || { id: 'unknown', role: 'unknown' };

    // Store client
    clients.set(clientId, {
      id: clientId,
      ws,
      user,
      apiKey,
      origin,
      connectedAt: Date.now(),
    });

    console.log('[WebSocket] Client connected', {
      id: clientId,
      origin,
      userId: user.id,
      role: user.role,
    });

    // Send welcome message
    ws.send(JSON.stringify({
      type: 'connected',
      clientId,
      timestamp: Date.now(),
      message: 'WebSocket connection established',
    }));

    // Handle messages from client
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        console.log('[WebSocket] Message from client', clientId, message);

        // Echo back or handle specific message types
        if (message.type === 'ping') {
          ws.send(JSON.stringify({
            type: 'pong',
            timestamp: Date.now(),
          }));
        }
      } catch (error) {
        console.error('[WebSocket] Error parsing message:', error);
        ws.send(JSON.stringify({
          type: 'error',
          error: 'Invalid message format',
        }));
      }
    });

    // Handle errors
    ws.on('error', (error) => {
      console.error('[WebSocket] Client error', clientId, error);
    });

    // Handle close
    ws.on('close', (code, reason) => {
      console.log('[WebSocket] Client disconnected', {
        id: clientId,
        code,
        reason: reason.toString(),
      });
      clients.delete(clientId);
    });

    // Send heartbeat every 30 seconds to keep connection alive
    const heartbeatInterval = setInterval(() => {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({
          type: 'heartbeat',
          timestamp: Date.now(),
        }));
      } else {
        clearInterval(heartbeatInterval);
      }
    }, 30000);

    // Clean up interval on close
    ws.on('close', () => {
      clearInterval(heartbeatInterval);
    });
  });

  // Handle server errors
  wss.on('error', (error) => {
    console.error('[WebSocket] Server error:', error);
  });

  console.log('[WebSocket] Server initialized on /api/stream');
  return wss;
}

/**
 * Broadcast message to all connected clients
 * @param {Object} message - Message to broadcast
 * @param {Object} options - Broadcast options
 * @param {string} options.key - Filter by API key (optional)
 * @param {string} options.userId - Filter by user ID (optional)
 */
export function broadcast(message, options = {}) {
  if (!wss) {
    console.warn('[WebSocket] Cannot broadcast: server not initialized');
    return;
  }

  const { key, userId } = options;
  let sentCount = 0;
  let errorCount = 0;

  const messageStr = JSON.stringify({
    ...message,
    timestamp: message.timestamp || Date.now(),
  });

  clients.forEach((client) => {
    // Apply filters
    if (key && client.apiKey !== key) return;
    if (userId && client.user.id !== userId) return;

    // Send message
    if (client.ws.readyState === client.ws.OPEN) {
      try {
        client.ws.send(messageStr);
        sentCount++;
      } catch (error) {
        console.error('[WebSocket] Error sending to client', client.id, error);
        errorCount++;
        // Remove dead client
        clients.delete(client.id);
      }
    } else {
      // Remove closed client
      clients.delete(client.id);
    }
  });

  if (sentCount > 0 || errorCount > 0) {
    console.log('[WebSocket] Broadcast', {
      type: message.type,
      sent: sentCount,
      errors: errorCount,
    });
  }
}

/**
 * Broadcast log message
 * @param {string} level - Log level (info, warn, error, debug)
 * @param {string} message - Log message
 * @param {Object} metadata - Additional metadata
 */
export function broadcastLog(level, message, metadata = {}) {
  broadcast({
    type: 'log',
    level,
    message,
    ...metadata,
  });
}

/**
 * Broadcast event
 * @param {string} eventType - Event type (e.g., 'screen.updated', 'pairing.created')
 * @param {Object} payload - Event payload
 */
export function broadcastEvent(eventType, payload) {
  broadcast({
    type: 'event',
    event: eventType,
    data: payload,
  });
}

/**
 * Get connected clients count
 */
export function getConnectedClientsCount() {
  return clients.size;
}

/**
 * Get connected clients info (for debugging)
 */
export function getConnectedClients() {
  return Array.from(clients.values()).map((client) => ({
    id: client.id,
    userId: client.user.id,
    role: client.user.role,
    origin: client.origin,
    connectedAt: client.connectedAt,
  }));
}

/**
 * Close WebSocket server gracefully
 */
export function closeWebSocketServer() {
  if (!wss) return;

  console.log('[WebSocket] Closing server...');
  
  // Close all client connections
  clients.forEach((client) => {
    try {
      client.ws.close(1000, 'Server shutting down');
    } catch (error) {
      console.error('[WebSocket] Error closing client', client.id, error);
    }
  });

  // Close server
  wss.close(() => {
    console.log('[WebSocket] Server closed');
    wss = null;
    clients.clear();
  });
}

