/**
 * Simple, robust SSE (Server-Sent Events) implementation
 * 
 * This is a minimal, battle-tested SSE server that:
 * - Never closes connections until the client disconnects
 * - Sends periodic heartbeats to keep connections alive
 * - Allows broadcasting events to clients by key
 * 
 * Manual test (PowerShell):
 *   Invoke-WebRequest `
 *     -Uri "http://192.168.1.7:3001/api/stream?key=admin" `
 *     -Headers @{ Origin = "http://192.168.1.7:5174"; Accept = "text/event-stream" } `
 *     -Method Get `
 *     -TimeoutSec 30
 * 
 * Expect:
 *   - StatusCode = 200
 *   - Content includes ": connected" and periodic ": heartbeat" comments
 *   - The request hangs for the full 30 seconds (no early close)
 */

import { randomUUID } from 'crypto';

/**
 * SSE client connection
 * @typedef {Object} SseClient
 * @property {string} id - Client ID
 * @property {string} key - Client key (e.g., 'admin')
 * @property {any} res - Express Response object
 */

const clients = new Map();

/**
 * Handle SSE connection request
 * Sets up headers, sends initial comment, registers client, and starts heartbeat
 */
export function handleSse(req, res) {
  const key = String(req.query?.key || 'admin');
  const missionId = typeof req.query?.missionId === 'string' && req.query.missionId.trim() ? req.query.missionId.trim() : null;
  const id = randomUUID();
  const origin = req.headers.origin;

  // CORS + SSE headers - use same logic as main server
  res.status(200);
  
  // Set CORS origin - allow all in development, check whitelist in production
  if (process.env.NODE_ENV !== 'production') {
    // Development: allow all origins
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    } else {
      res.setHeader('Access-Control-Allow-Origin', '*');
    }
  } else {
    // Production: check whitelist (import isOriginAllowed if needed, but for now use origin or *)
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    } else {
      res.setHeader('Access-Control-Allow-Origin', '*');
    }
  }
  
  res.setHeader('Access-Control-Allow-Credentials', 'false');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Cache-Control, Last-Event-ID, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Vary', 'Origin');

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Prevent nginx/proxies from buffering SSE

  // Configure socket for long-lived connection (no timeout so proxies don't close at ~20s)
  if (req.socket) {
    req.socket.setKeepAlive(true);
    req.socket.setTimeout(0);
  }

  // CRITICAL: Flush headers immediately BEFORE writing any data
  // This ensures the browser receives headers and knows it's an SSE stream
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  } else if (typeof res.flush === 'function') {
    res.flush();
  }

  // CRITICAL: Write initial comment immediately after flushing headers
  // This must happen BEFORE any async operations to ensure the stream is "open"
  try {
    res.write(`: connected ${Date.now()}\n\n`);
    // Flush the initial data to ensure it's sent immediately
    if (typeof res.flush === 'function') {
      res.flush();
    }
  } catch (error) {
    console.error('[SSE] Error writing initial comment:', error);
    return; // Connection is broken, exit early
  }

  const client = { id, key, missionId, threadId: null, res, heartbeat: null };
  clients.set(id, client);

  console.log('[SSE] ✅ Client connected', { 
    id,
    key,
    missionId: missionId || 'none',
    origin,
    totalClients: clients.size,
    clientsWithKey: Array.from(clients.values()).filter(c => c.key === key).length,
    allKeys: Array.from(new Set(Array.from(clients.values()).map(c => c.key))),
  });

  // CRITICAL: Debounce cleanup to prevent multiple calls
  let cleanupCalled = false;
  const cleanup = (reason) => {
    // Prevent multiple cleanup calls (req.close, res.close, req.aborted can all fire)
    if (cleanupCalled) {
      return;
    }
    cleanupCalled = true;

    // Double-check client still exists (race condition protection)
    if (!clients.has(id)) {
      return;
    }

    console.log('[SSE] disconnect', {
      id,
      key,
      reason,
      writableEnded: res.writableEnded,
      destroyed: res.destroyed,
    });

    // Clear heartbeat if it exists
    if (client.heartbeat) {
      clearInterval(client.heartbeat);
      client.heartbeat = null;
    }

    // Remove from clients map
    clients.delete(id);

    // DO NOT call res.end() here; the close event means it's already closed.
  };

  // Heartbeat every 15s - SSE comment ping keeps proxies from closing idle streams
  client.heartbeat = setInterval(() => {
    if (res.writableEnded || res.destroyed || cleanupCalled) {
      if (client.heartbeat) {
        clearInterval(client.heartbeat);
        client.heartbeat = null;
      }
      return;
    }
    try {
      res.write(':\n\n');
      if (typeof res.flush === 'function') res.flush();
    } catch (error) {
      console.error('[SSE] Error sending heartbeat:', error);
      if (client.heartbeat) {
        clearInterval(client.heartbeat);
        client.heartbeat = null;
      }
    }
  }, 15000);

  // CRITICAL: Only bind each event listener ONCE to prevent duplicate cleanup calls
  // Use once: true to ensure each event only fires once
  req.once('close', () => cleanup('req.close'));
  req.once('aborted', () => cleanup('req.aborted'));
  res.once('close', () => cleanup('res.close'));

  // Error handlers - log but don't always cleanup (errors can be transient)
  req.on('error', (err) => {
    // Only log - don't cleanup on req.error (let req.close handle it)
    // 'aborted' errors are normal when client disconnects
    if (!cleanupCalled) {
      console.warn('[SSE] req error', { id, key, err: String(err) });
    }
  });

  res.on('error', (err) => {
    // Only log - don't cleanup on res.error (let res.close handle it)
    if (!cleanupCalled) {
      console.warn('[SSE] res error', { id, key, err: String(err) });
    }
  });
}

/**
 * Broadcast an SSE event to all clients with the specified key
 * 
 * @param {string} key - Client key to target (e.g., 'admin')
 * @param {string} type - Event type (e.g., 'screen.pair_session.created')
 * @param {*} data - Event payload
 */
export function broadcastSse(key, type, data) {
  // Send event with the actual event type name (not just "message")
  // This allows dashboards to listen for specific events like 'pairing_started' or 'screen.pair_session.created'
  const payload = JSON.stringify(data);
  const line = `event: ${type}\ndata: ${payload}\n\n`;

  let sent = 0;
  const toDelete = [];

  for (const client of clients.values()) {
    if (client.key !== key) continue;
    if (client.res.writableEnded || client.res.destroyed) {
      toDelete.push(client.id);
      continue;
    }

    try {
      client.res.write(line);
      sent++;
    } catch (err) {
      console.error('[SSE] broadcast error', {
        id: client.id,
        key: client.key,
        err: String(err),
      });
      toDelete.push(client.id);
    }
  }

  // Clean up dead connections
  for (const id of toDelete) {
    clients.delete(id);
  }

  if (sent > 0) {
    console.log(`[SSE] Broadcast '${type}' to ${sent} client(s) with key '${key}'`, {
      totalClients: clients.size,
      clientsWithKey: Array.from(clients.values()).filter(c => c.key === key).length,
      allKeys: Array.from(new Set(Array.from(clients.values()).map(c => c.key))),
    });
  } else {
    console.warn(`[SSE] No clients connected with key '${key}' to receive '${type}' event`, {
      totalClients: clients.size,
      allKeys: Array.from(new Set(Array.from(clients.values()).map(c => c.key))),
      eventType: type,
    });
  }
}

/**
 * Broadcast an agent-message event to all clients subscribed to this missionId
 * Used when a new AgentMessage is created (POST /api/agent-messages).
 *
 * @param {string} missionId - Mission ID (clients connect with ?missionId=...)
 * @param {object} payload - { missionId, message } (message = full AgentMessage row)
 */
export function broadcastAgentMessage(missionId, payload) {
  if (!missionId || typeof missionId !== 'string') return;
  const data = { missionId, message: payload.message };
  const line = `event: agent-message\ndata: ${JSON.stringify(data)}\n\n`;

  let sent = 0;
  const toDelete = [];

  for (const client of clients.values()) {
    if (client.missionId !== missionId) continue;
    if (client.res.writableEnded || client.res.destroyed) {
      toDelete.push(client.id);
      continue;
    }
    try {
      client.res.write(line);
      sent++;
    } catch (err) {
      console.error('[SSE] broadcastAgentMessage error', { id: client.id, missionId, err: String(err) });
      toDelete.push(client.id);
    }
  }

  for (const id of toDelete) {
    clients.delete(id);
  }

  if (sent > 0) {
    console.log(`[SSE] Broadcast agent-message to ${sent} client(s) for missionId=${missionId}`);
  }
}

/**
 * Broadcast a mission-checkpoint event to all clients subscribed to this missionId.
 * Used by the structured mission pipeline when a checkpoint step enters awaiting_input.
 *
 * @param {string} missionId - Mission ID (clients connect with ?missionId=...)
 * @param {object} checkpoint - { stepId, prompt, options, outputKey }
 */
export function broadcastMissionCheckpoint(missionId, checkpoint) {
  if (!missionId || typeof missionId !== 'string') return;
  const data = { missionId, checkpoint };
  const line = `event: mission.checkpoint\ndata: ${JSON.stringify(data)}\n\n`;

  let sent = 0;
  const toDelete = [];

  for (const client of clients.values()) {
    if (client.missionId !== missionId) continue;
    if (client.res.writableEnded || client.res.destroyed) {
      toDelete.push(client.id);
      continue;
    }
    try {
      client.res.write(line);
      sent++;
    } catch (err) {
      console.error('[SSE] broadcastMissionCheckpoint error', { id: client.id, missionId, err: String(err) });
      toDelete.push(client.id);
    }
  }

  for (const id of toDelete) {
    clients.delete(id);
  }

  if (sent > 0) {
    console.log(`[SSE] Broadcast mission.checkpoint to ${sent} client(s) for missionId=${missionId}`);
  }
}

/**
 * Broadcast a reasoning_line event to agent-chat SSE clients subscribed to this missionId.
 * Payload should include { line, timestamp } (and optional agent). Matches Blackboard / draft emit path.
 *
 * @param {string} missionId
 * @param {{ line: string, timestamp?: number, agent?: string }} payload
 */
export function broadcastMissionReasoningLine(missionId, payload) {
  if (!missionId || typeof missionId !== 'string') return;
  const data =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? { missionId, ...payload }
      : { missionId, line: String(payload ?? '') };
  const line = `event: reasoning_line\ndata: ${JSON.stringify(data)}\n\n`;

  let sent = 0;
  const toDelete = [];

  for (const client of clients.values()) {
    if (client.missionId !== missionId) continue;
    if (client.res.writableEnded || client.res.destroyed) {
      toDelete.push(client.id);
      continue;
    }
    try {
      client.res.write(line);
      sent++;
    } catch (err) {
      console.error('[SSE] broadcastMissionReasoningLine error', { id: client.id, missionId, err: String(err) });
      toDelete.push(client.id);
    }
  }

  for (const id of toDelete) {
    clients.delete(id);
  }

  if (sent > 0) {
    console.log(`[SSE] Broadcast reasoning_line to ${sent} client(s) for missionId=${missionId}`);
  }
}

/**
 * Broadcast a chat-message event to all clients subscribed to this threadId.
 * Used when an AgentMessage with threadId is created (POST /api/agent-messages with threadId,
 * or agents posting into a thread).
 *
 * @param {string} threadId - Thread ID (clients connect via GET /api/chat/threads/:id/stream)
 * @param {object} payload - { threadId, message } (message = full AgentMessage row)
 */
export function broadcastThreadMessage(threadId, payload) {
  if (!threadId || typeof threadId !== 'string') return;
  const data = { threadId, message: payload.message };
  const line = `event: chat-message\ndata: ${JSON.stringify(data)}\n\n`;

  let sent = 0;
  const toDelete = [];

  for (const client of clients.values()) {
    if (client.threadId !== threadId) continue;
    if (client.res.writableEnded || client.res.destroyed) {
      toDelete.push(client.id);
      continue;
    }
    try {
      client.res.write(line);
      sent++;
    } catch (err) {
      console.error('[SSE] broadcastThreadMessage error', { id: client.id, threadId, err: String(err) });
      toDelete.push(client.id);
    }
  }

  for (const id of toDelete) {
    clients.delete(id);
  }

  if (sent > 0) {
    console.log(`[SSE] Broadcast chat-message to ${sent} client(s) for threadId=${threadId}`);
  }
}

/**
 * Handle SSE connection for a thread (GET /api/chat/threads/:id/stream).
 * Registers the client with threadId so broadcastThreadMessage(threadId, ...) delivers to this connection.
 * Does not modify existing handleSse / missionId behaviour.
 */
export function handleThreadSse(req, res, threadId) {
  const id = randomUUID();
  const origin = req.headers.origin;
  const threadIdTrimmed = typeof threadId === 'string' && threadId.trim() ? threadId.trim() : null;

  res.status(200);
  if (process.env.NODE_ENV !== 'production') {
    if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
    else res.setHeader('Access-Control-Allow-Origin', '*');
  } else {
    if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
    else res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Credentials', 'false');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Cache-Control, Last-Event-ID, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  if (req.socket) {
    req.socket.setKeepAlive(true);
    req.socket.setTimeout(0);
  }
  if (typeof res.flushHeaders === 'function') res.flushHeaders();
  try {
    res.write(`: connected ${Date.now()}\n\n`);
    if (typeof res.flush === 'function') res.flush();
  } catch (error) {
    console.error('[SSE] Error writing initial comment (thread):', error);
    return;
  }

  const client = { id, key: 'thread', missionId: null, threadId: threadIdTrimmed, res, heartbeat: null };
  clients.set(id, client);
  console.log('[SSE] ✅ Thread client connected', { id, threadId: threadIdTrimmed, totalClients: clients.size });

  let cleanupCalled = false;
  const cleanup = (reason) => {
    if (cleanupCalled) return;
    cleanupCalled = true;
    if (!clients.has(id)) return;
    if (client.heartbeat) {
      clearInterval(client.heartbeat);
      client.heartbeat = null;
    }
    clients.delete(id);
    console.log('[SSE] thread disconnect', { id, threadId: threadIdTrimmed, reason });
  };

  client.heartbeat = setInterval(() => {
    if (res.writableEnded || res.destroyed || cleanupCalled) {
      if (client.heartbeat) {
        clearInterval(client.heartbeat);
        client.heartbeat = null;
      }
      return;
    }
    try {
      res.write(':\n\n');
      if (typeof res.flush === 'function') res.flush();
    } catch (error) {
      if (client.heartbeat) {
        clearInterval(client.heartbeat);
        client.heartbeat = null;
      }
    }
  }, 15000);

  req.once('close', () => cleanup('req.close'));
  req.once('aborted', () => cleanup('req.aborted'));
  res.once('close', () => cleanup('res.close'));
  req.on('error', () => {});
  res.on('error', () => {});
}

/**
 * Get the number of connected SSE clients
 */
export function getSseClientCount() {
  return clients.size;
}

