import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import { getPrismaClient } from '../db/prisma.js';
import { sseCorsOptions, isOriginAllowed } from '../config/cors.js';
import { handleSse, broadcastSse } from './simpleSse.js';
import { verifyAgentChatStreamToken } from '../lib/agentChatStreamAuth.js';

export const router = express.Router();

const prisma = getPrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-change-this';

const clients = new Map();
let lastSseBroadcastAt = Date.now(); // Track last broadcast for health checks

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function normalize(value) {
  if (!value) return undefined;
  return String(value).trim();
}

// Note: isOriginAllowed is imported from '../config/cors.js' - using centralized CORS logic

/**
 * Setup SSE-specific headers including CORS
 * CORS headers MUST be set before any response is written
 * This function sets headers manually to ensure they're present even if middleware fails
 * 
 * CORS Policy:
 * - Uses specific origin from request if it matches allowed list
 * - Supports localhost, 127.0.0.1, and 192.168.1.x:5174
 * - Sets Access-Control-Allow-Credentials: true for SSE
 */
export function setupSseHeaders(res, req) {
  // Determine allowed origin dynamically - CORS bullet-proof setup
  const origin = req.headers.origin ?? '';
  const allowedOrigins = [
    'http://localhost:5174',
    'http://127.0.0.1:5174',
    `http://${req.hostname}:5174`,
  ];
  
  // Check for 192.168.1.x:5174 pattern (any LAN IP)
  const isLanIp = origin.match(/^http:\/\/192\.168\.1\.\d+:5174$/);
  const isAllowed = allowedOrigins.includes(origin) || isLanIp;
  const corsOrigin = isAllowed ? origin : allowedOrigins[0];
  
  // Set CORS headers - MUST be set before any data is written
  res.setHeader('Access-Control-Allow-Origin', corsOrigin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Type');
  
  // SSE-specific headers
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  
  // Disable default timeouts on this socket
  if (req.socket) {
    req.socket.setKeepAlive(true);
    req.socket.setTimeout(0);
  }
  
  // Flush headers immediately - critical for SSE
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  } else if (typeof res.flush === 'function') {
    res.flush();
  }
}

/**
 * @deprecated Use setupSseHeaders() instead - CORS is handled by middleware
 * Kept for backward compatibility but should not set CORS headers
 */
export function prepareSseResponse(req, res) {
  // Setup headers including CORS (fallback if middleware doesn't work)
  setupSseHeaders(res, req);
  return true;
}

function attachClient(req, res, { label, skipInitialWrite } = {}) {
  // Headers should already be set by the route handler
  // Only set them here if they weren't set already (fallback)
  // BUT: We must ensure credentials is 'false', not 'true' from setupSseHeaders
  if (!res.headersSent && !res.getHeader('Content-Type')) {
    console.warn('[SSE] Headers not set in route handler, setting in attachClient');
    // Don't use setupSseHeaders here - it sets credentials: true
    // Instead, set headers manually with credentials: false
    const origin = req.headers.origin;
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Access-Control-Allow-Credentials', 'false');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Vary', 'Origin');
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
  } else {
    // Headers are already set - ensure credentials is 'false' (override if needed)
    const currentCreds = res.getHeader('Access-Control-Allow-Credentials');
    if (currentCreds !== 'false') {
      console.warn('[SSE] Overriding Access-Control-Allow-Credentials to false (was:', currentCreds, ')');
      res.setHeader('Access-Control-Allow-Credentials', 'false');
    }
  }
  
  // Ensure socket stays alive and prevent timeouts
  if (req.socket) {
    req.socket.setKeepAlive(true, 60000); // Keep-alive with 60s interval
    req.socket.setTimeout(0); // No timeout
    // Prevent socket from being destroyed on errors
    req.socket.setNoDelay(true); // Disable Nagle's algorithm for lower latency
  }
  
  const id = makeId();
  const key = typeof req.query?.key === 'string' ? req.query.key : null;
  const tag = label ? ` (${label})` : '';
  
  // Create client context
  const ctx = {
    res,
    fingerprint: normalize(req.query?.fingerprint)?.toUpperCase(),
    screenId: normalize(req.query?.screenId),
    key,
    id,
    heartbeat: null, // Will be set below
  };

  // Write initial keep-alive comment to keep connection alive
  // This is critical - without it, the connection may close immediately
  if (!skipInitialWrite) {
    try {
      // Flush headers if not already sent
      if (!res.headersSent && typeof res.flushHeaders === 'function') {
        res.flushHeaders();
      }
      
      // Write initial comment to establish the SSE stream
      // This must be written immediately after headers are set
      res.write(`:connected${tag}\n\n`);
      // Also write a ready event to confirm connection
      res.write(`event: ready\ndata: ${JSON.stringify({ ok: true, key: key || null, timestamp: Date.now() })}\n\n`);
      
      // Force flush to ensure data is sent immediately
      if (typeof res.flush === 'function') {
        res.flush();
      }
      
      console.log('[SSE] Initial SSE data written and flushed', { id, key: key || 'none' });
    } catch (error) {
      console.error('[SSE] Error writing initial comment:', error);
      // Don't throw - log and continue, connection might still work
      console.error('[SSE] Error details:', error.message, error.stack);
      // Try to write an error event instead
      try {
        res.write(`event: error\ndata: ${JSON.stringify({ error: 'Connection error', message: error.message })}\n\n`);
      } catch (writeErr) {
        console.error('[SSE] Failed to write error event:', writeErr);
      }
    }
  }

  // Set up heartbeat to keep connection alive (every 15 seconds)
  // This prevents proxies and browsers from closing idle connections
  ctx.heartbeat = setInterval(() => {
    // Check if connection is still writable
    if (res.writableEnded || res.destroyed) {
      clearInterval(ctx.heartbeat);
      clients.delete(id);
      return;
    }
    
    try {
      // Send keep-alive comment (SSE spec: lines starting with : are comments)
      // Using simple format as per requirements: `:\n\n`
      res.write(`:\n\n`);
    } catch (error) {
      console.error('[SSE] Error sending heartbeat:', error);
      clearInterval(ctx.heartbeat);
      clients.delete(id);
    }
  }, 15000);

  clients.set(id, ctx);
  console.log('[SSE] Client connected', { 
    id, 
    label, 
    key: key || 'none',
    origin: req.headers.origin || 'no-origin',
    clientsCount: clients.size 
  });

  // Cleanup function
  const cleanup = () => {
    if (ctx.heartbeat) {
      clearInterval(ctx.heartbeat);
      ctx.heartbeat = null;
    }
    clients.delete(id);
  };

  // Log when connection closes and end the response
  // NOTE: Only call res.end() when client disconnects, not immediately
  req.on('close', () => {
    console.log('[SSE] DISCONNECT /api/stream', {
      id,
      origin: req.headers.origin,
      key: key || 'none'
    });
    cleanup();
    // End the response when client disconnects
    if (!res.writableEnded && !res.destroyed) {
      try {
        res.end();
      } catch (err) {
        // Ignore errors if response is already ended
      }
    }
  });
  
  // Handle request errors
  req.on('error', (error) => {
    console.error('[SSE] Request error:', { id, error: error.message });
    cleanup();
  });
  
  // Handle response errors
  res.on('error', (error) => {
    console.error('[SSE] Response error:', { id, error: error.message });
    cleanup();
  });

  // Handle response finish (shouldn't happen for SSE until client disconnects)
  // If this fires, it means the response was ended prematurely - log it but don't cleanup
  // because the req.on('close') handler will handle cleanup
  res.on('finish', () => {
    console.warn('[SSE] Response finished unexpectedly (this should not happen for SSE):', { 
      id, 
      writableEnded: res.writableEnded,
      destroyed: res.destroyed 
    });
    // Don't call cleanup() here - let req.on('close') handle it
    // This event might fire if Express ends the response, but we want to keep it open
  });

  return { id, ctx };
}

/**
 * Validate API key from query parameter
 * Supports:
 * - JWT tokens (validated against JWT_SECRET)
 * - Environment-specific keys: SSE_STREAM_KEY (production), 'admin'/'public' (dev only)
 * - User tokens from database
 */
async function validateApiKey(key) {
  if (!key) {
    return { valid: false, error: 'API key required' };
  }

  // Check environment-specific stream key (for production/staging)
  const envStreamKey = process.env.SSE_STREAM_KEY || process.env.TV_STREAM_KEY;
  if (envStreamKey && key === envStreamKey) {
    return { 
      valid: true, 
      user: { id: 'stream_client', role: 'stream' },
      keyType: 'env'
    };
  }

  // Dev mode: allow 'admin' and 'public' keys (non-production only)
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

// Heartbeat interval - updates lastSseBroadcastAt
setInterval(() => {
  const now = Date.now();
  for (const [id, { res }] of clients.entries()) {
    try {
      res.write(`: hb ${now}\n\n`);
      lastSseBroadcastAt = now; // Update on each heartbeat
    } catch {
      clients.delete(id);
    }
  }
  
  // If no clients, still emit a system ping to keep health check alive
  if (clients.size === 0) {
    // No-op, but we could log if needed
  }
}, 15_000);

// Periodic system ping every 30s (for health checks and keep-alive)
setInterval(() => {
  const now = Date.now();
  lastSseBroadcastAt = now;
  
  // Emit sys:ping event to all connected clients
  const payload = `event: sys:ping\n` + `data: ${JSON.stringify({ timestamp: now })}\n\n`;
  for (const [id, { res }] of clients.entries()) {
    try {
      res.write(payload);
    } catch {
      clients.delete(id);
    }
  }
}, 30_000);

// OPTIONS handler for CORS preflight
// Handles both /api/stream and /api/stream?key=admin
// This MUST be registered before the GET handler
// CRITICAL: This handler must set CORS headers manually to ensure they're always present
// Browsers and XHR polyfills send OPTIONS requests before GET requests for cross-origin SSE connections
// 
// Quick manual test (Windows PowerShell):
// Invoke-WebRequest -Uri "http://192.168.1.7:3001/api/stream?key=admin" `
//   -Headers @{ Origin = "http://192.168.1.7:5174"; Accept = "text/event-stream" } `
//   -Method OPTIONS
//
// Expected: StatusCode 204 with CORS headers
router.options('/stream', (req, res) => {
  const origin = req.headers.origin;
  
  // Use same CORS logic as main server - allow all origins in development
  if (process.env.NODE_ENV !== 'production') {
    // Development: allow all origins
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'false');
    } else {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Credentials', 'false');
    }
  } else {
    // Production: check whitelist
    if (origin && isOriginAllowed(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'false');
    } else {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Credentials', 'false');
    }
  }
  
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Cache-Control, Last-Event-ID, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Max-Age', '86400'); // Cache preflight for 24 hours
  res.setHeader('Vary', 'Origin');
  res.status(204).end();
});

// GET handler for SSE stream
// Handles both /api/stream and /api/stream?key=admin
// CRITICAL: Do NOT call next() - SSE handlers must never complete
// CORS headers are set manually at the very top to ensure they're always present
//
// NOTE: GET /api/stream must not send 204 or end immediately.
// It returns 200 and keeps the connection open for SSE.
//
// Quick manual test (Windows PowerShell):
// Invoke-WebRequest -Uri "http://192.168.1.7:3001/api/stream?key=admin" `
//   -Headers @{ Origin = "http://192.168.1.7:5174"; Accept = "text/event-stream" } `
//   -Method Get -TimeoutSec 5
//
// Expected:
// - StatusCode: 200
// - Headers contain Content-Type: text/event-stream and Access-Control-Allow-Origin
// - Content is non-empty (at least ":ok\n\n")
// GET handler for SSE stream - Now uses simpleSse implementation
// When key=agent-chat&missionId=..., verifyAgentChatStreamToken requires valid streamToken (403 otherwise)
router.get('/stream', verifyAgentChatStreamToken, handleSse);

// OLD IMPLEMENTATION - KEPT FOR REFERENCE BUT NOT USED
// The route above now uses handleSse from simpleSse.js
/*
router.get('/stream', async (req, res) => {
  const origin = req.headers.origin;
  const key = req.query?.key;
  let clientId = null;
  let heartbeat = null;
  
  // 1) CORS + SSE headers, sent once at the top
  res.status(200);
  res.setHeader('Access-Control-Allow-Origin', origin || '*');
  res.setHeader('Access-Control-Allow-Credentials', 'false');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  
  // Configure socket for long-lived connection
  if (req.socket) {
    req.socket.setKeepAlive(true);
    req.socket.setTimeout(0);
  }
  
  // Flush headers immediately
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  } else if (typeof res.flush === 'function') {
    res.flush();
  }
  
  console.log('[SSE] CONNECT', {
    url: req.originalUrl,
    origin: origin,
    key: key,
  });
  console.log('[SSE] HEADERS SENT', res.getHeaders());
  
  // 2) Initial comment so the browser considers the stream "open"
  try {
    res.write(':ok\n\n');
    if (typeof res.flush === 'function') {
      res.flush();
    }
  } catch (error) {
    console.error('[SSE] Error writing initial :ok:', error);
    // Connection is broken, but don't end it - let client disconnect naturally
    return;
  }
  
  // 3) Register client with SSE hub (if key is valid)
  try {
    if (!key) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: 'API key required' })}\n\n`);
    } else {
      const keyValidation = await validateApiKey(key);
      
      if (!keyValidation.valid) {
        res.write(`event: error\ndata: ${JSON.stringify({ error: keyValidation.error })}\n\n`);
      } else {
        // Valid key - register client
        const label = keyValidation.keyType === 'dev' 
          ? (key === 'admin' ? 'admin' : 'public')
          : `user-${keyValidation.user.id}`;
        
        // Register client in the hub (reuse existing attachClient logic but simplified)
        const id = makeId();
        clientId = id;
        
        const ctx = {
          res,
          fingerprint: null,
          screenId: null,
          key,
          id,
          heartbeat: null,
        };
        
        clients.set(id, ctx);
        console.log('[SSE] Client attached successfully', {
          id,
          origin: origin,
          key: key,
          userId: keyValidation.user?.id,
          keyType: keyValidation.keyType,
        });
      }
    }
  } catch (error) {
    console.error('[SSE] Error validating key or registering client:', error);
    res.write(`event: error\ndata: ${JSON.stringify({ error: 'Connection failed', message: error.message })}\n\n`);
  }
  
  // 4) Heartbeat every 15s - comment-only heartbeat (valid SSE, ignored by EventSource)
  heartbeat = setInterval(() => {
    if (res.writableEnded || res.destroyed) {
      clearInterval(heartbeat);
      return;
    }
    try {
      res.write(':hb\n\n');
      if (typeof res.flush === 'function') {
        res.flush();
      }
    } catch (error) {
      console.error('[SSE] Error sending heartbeat:', error);
      clearInterval(heartbeat);
    }
  }, 15000);
  
  // 5) On close/aborted: cleanup and DO NOT throw
  const cleanup = (reason) => {
    console.log('[SSE] DISCONNECT', {
      id: clientId,
      key: key,
      reason: reason,
      writableEnded: res.writableEnded,
      destroyed: res.destroyed,
    });
    
    if (heartbeat) {
      clearInterval(heartbeat);
      heartbeat = null;
    }
    
    if (clientId) {
      clients.delete(clientId);
    }
    
    // Only end response if client disconnected (not if server error)
    if (reason === 'req.close' || reason === 'req.aborted') {
      if (!res.writableEnded && !res.destroyed) {
        try {
          res.end();
        } catch (err) {
          // Ignore errors if response is already ended
        }
      }
    }
  };
  
  // Set up event listeners for cleanup
  req.on('close', () => cleanup('req.close'));
  req.on('aborted', () => cleanup('req.aborted'));
  
  res.on('close', () => {
    console.log('[SSE] RES close fired', {
      id: clientId,
      key: key,
      writableEnded: res.writableEnded,
      destroyed: res.destroyed,
    });
    cleanup('res.close');
  });
  
  res.on('error', (err) => {
    console.warn('[SSE] RES error', {
      id: clientId,
      key: key,
      error: err.message,
    });
    // Don't cleanup on res.error - let req.close handle it
    // This prevents premature cleanup when client is still connected
  });
  
  // Handle request errors gracefully
  req.on('error', (err) => {
    console.warn('[SSE] REQ error', {
      id: clientId,
      key: key,
      error: err.message,
    });
    // Don't cleanup on req.error - let req.close handle it
    // 'aborted' errors are normal when client disconnects
  });
  
  // CRITICAL: Handler function ends here, but response stream stays open
  // Express will NOT automatically end the response because:
  // 1. We've written data (res.write(':ok\n\n'))
  // 2. We've set headers and flushed them
  // 3. We haven't called res.end() or next()
  // The connection will stay open until client disconnects
});
*/

export function openSseStream(req, res, options) {
  return attachClient(req, res, options);
}

// OLD broadcast function - replaced by broadcastSse in simpleSse.js
// Keeping this as a wrapper for backward compatibility
export function broadcast(event, data, target) {
  // Extract key from target (use environment key in production, 'admin' in dev)
  const defaultKey = process.env.SSE_STREAM_KEY || process.env.TV_STREAM_KEY || (process.env.NODE_ENV === 'production' ? null : 'admin');
  const key = target?.key || defaultKey;
  
  // Use the new simpleSse broadcast function
  broadcastSse(key, event, data);
}

/**
 * Get last SSE broadcast timestamp for health checks
 * @returns {number} Timestamp in milliseconds
 */
export function getLastSseBroadcastAt() {
  return lastSseBroadcastAt;
}

/**
 * Check if SSE is healthy (has broadcasted recently)
 * @param {number} maxAgeMs - Maximum age of last broadcast (default: 60000 = 60s)
 * @returns {boolean}
 */
export function isSseHealthy(maxAgeMs = 60000) {
  const age = Date.now() - lastSseBroadcastAt;
  return age < maxAgeMs;
}

export default router;
