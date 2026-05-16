/**
 * AI Orchestration - SSE Event Bus
 * Broadcasts AI suggestions to connected clients
 * Phase 2: With heartbeat and reliability
 */

const clients = new Map();

/**
 * Register a new SSE client
 */
export function addAIClient(id, res) {
  clients.set(id, { id, res, lastPing: Date.now() });
  console.log(`[AI SSE] Client connected: ${id} (total: ${clients.size})`);
  
  // Send initial connection message
  res.write(`event: connected\ndata: ${JSON.stringify({ id, timestamp: new Date().toISOString() })}\n\n`);
  
  // Start heartbeat for this client
  const heartbeat = setInterval(() => {
    try {
      res.write(`:ping ${Date.now()}\n\n`);
      clients.get(id).lastPing = Date.now();
    } catch (err) {
      console.error(`[AI SSE] Heartbeat failed for ${id}:`, err);
      clearInterval(heartbeat);
      clients.delete(id);
    }
  }, 20000); // Every 20s
  
  // Store heartbeat interval for cleanup
  clients.get(id).heartbeat = heartbeat;
}

/**
 * Remove an SSE client
 */
export function removeAIClient(id) {
  const client = clients.get(id);
  if (client) {
    if (client.heartbeat) {
      clearInterval(client.heartbeat);
    }
    clients.delete(id);
    console.log(`[AI SSE] Client disconnected: ${id} (total: ${clients.size})`);
  }
}

/**
 * Broadcast an event to all connected clients
 */
export function broadcastAI(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  let sent = 0;

  for (const [id, client] of clients.entries()) {
    try {
      client.res.write(payload);
      sent++;
    } catch (err) {
      console.error(`[AI SSE] Error writing to client ${id}:`, err);
      removeAIClient(id);
    }
  }

  if (sent > 0) {
    console.log(`[AI SSE] Broadcast '${event}' to ${sent} client(s)`);
  }
}

/**
 * Broadcast a suggestion
 */
export function broadcastSuggestion(suggestion) {
  broadcastAI('suggestion', suggestion);
}

/**
 * Broadcast suggestion applied event
 */
export function broadcastSuggestionApplied(data) {
  broadcastAI('suggestion.applied', data);
}

/**
 * Get client count
 */
export function getAIClientCount() {
  return clients.size;
}







