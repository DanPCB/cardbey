/**
 * SSE Connection Registry for Orchestrator Tasks
 * 
 * Manages SSE connections per tenant for real-time task status updates.
 * Each tenant only receives updates for their own tasks.
 */

import { randomUUID } from 'crypto';

/**
 * SSE client connection
 * @typedef {Object} SseClient
 * @property {string} id - Client ID
 * @property {string} tenantId - Tenant ID
 * @property {any} res - Express Response object
 * @property {NodeJS.Timeout} heartbeat - Heartbeat interval
 */

/**
 * Map of tenantId -> array of client connections
 * @type {Map<string, SseClient[]>}
 */
const connections = new Map();

/**
 * Add a client connection for a tenant
 * 
 * @param {string} tenantId - Tenant ID
 * @param {any} res - Express Response object
 * @returns {string} Client ID
 */
export function addClient(tenantId, res) {
  const clientId = randomUUID();
  const client = {
    id: clientId,
    tenantId,
    res,
    heartbeat: null,
  };

  if (!connections.has(tenantId)) {
    connections.set(tenantId, []);
  }

  connections.get(tenantId).push(client);

  console.log(`[OrchestratorSSE] Client connected: ${clientId} (tenant: ${tenantId})`, {
    totalClients: Array.from(connections.values()).flat().length,
    clientsForTenant: connections.get(tenantId).length,
  });

  return clientId;
}

/**
 * Remove a client connection
 * 
 * @param {string} tenantId - Tenant ID
 * @param {any} res - Express Response object
 */
export function removeClient(tenantId, res) {
  const tenantConnections = connections.get(tenantId);
  if (!tenantConnections) {
    return;
  }

  const index = tenantConnections.findIndex((client) => client.res === res);
  if (index === -1) {
    return;
  }

  const client = tenantConnections[index];

  // Clear heartbeat
  if (client.heartbeat) {
    clearInterval(client.heartbeat);
    client.heartbeat = null;
  }

  // Remove from array
  tenantConnections.splice(index, 1);

  // Clean up empty tenant arrays
  if (tenantConnections.length === 0) {
    connections.delete(tenantId);
  }

  console.log(`[OrchestratorSSE] Client disconnected: ${client.id} (tenant: ${tenantId})`, {
    totalClients: Array.from(connections.values()).flat().length,
    clientsForTenant: tenantConnections.length,
  });
}

/**
 * Broadcast an event to all clients for a specific tenant
 * 
 * @param {string} tenantId - Tenant ID
 * @param {Object} eventData - Event data to send
 */
export function broadcast(tenantId, eventData) {
  const tenantConnections = connections.get(tenantId);
  if (!tenantConnections || tenantConnections.length === 0) {
    // No clients connected for this tenant - this is normal
    return;
  }

  const payload = JSON.stringify(eventData);
  const message = `event: task_update\ndata: ${payload}\n\n`;

  const toRemove = [];

  for (const client of tenantConnections) {
    // Check if connection is still valid
    if (client.res.writableEnded || client.res.destroyed) {
      toRemove.push(client);
      continue;
    }

    try {
      client.res.write(message);
    } catch (error) {
      console.error(`[OrchestratorSSE] Error broadcasting to client ${client.id}:`, error.message);
      toRemove.push(client);
    }
  }

  // Clean up dead connections
  for (const client of toRemove) {
    removeClient(tenantId, client.res);
  }

  if (tenantConnections.length - toRemove.length > 0) {
    console.log(`[OrchestratorSSE] Broadcast to ${tenantConnections.length - toRemove.length} client(s) for tenant ${tenantId}`, {
      eventData,
    });
  }
}

/**
 * Get connection count for a tenant
 * 
 * @param {string} tenantId - Tenant ID
 * @returns {number} Number of connected clients
 */
export function getConnectionCount(tenantId) {
  const tenantConnections = connections.get(tenantId);
  return tenantConnections ? tenantConnections.length : 0;
}

/**
 * Get total connection count across all tenants
 * 
 * @returns {number} Total number of connected clients
 */
export function getTotalConnectionCount() {
  return Array.from(connections.values()).flat().length;
}

/**
 * Set up heartbeat for a client
 * 
 * @param {string} tenantId - Tenant ID
 * @param {any} res - Express Response object
 * @param {number} intervalMs - Heartbeat interval in milliseconds (default: 25000)
 * @returns {NodeJS.Timeout} Heartbeat interval ID
 */
export function setupHeartbeat(tenantId, res, intervalMs = 25000) {
  const tenantConnections = connections.get(tenantId);
  if (!tenantConnections) {
    return null;
  }

  const client = tenantConnections.find((c) => c.res === res);
  if (!client) {
    return null;
  }

  // Clear existing heartbeat if any
  if (client.heartbeat) {
    clearInterval(client.heartbeat);
  }

  // Set up new heartbeat
  client.heartbeat = setInterval(() => {
    if (res.writableEnded || res.destroyed) {
      if (client.heartbeat) {
        clearInterval(client.heartbeat);
        client.heartbeat = null;
      }
      removeClient(tenantId, res);
      return;
    }

    try {
      res.write('event: ping\ndata: "ok"\n\n');
    } catch (error) {
      console.error(`[OrchestratorSSE] Error sending heartbeat:`, error.message);
      if (client.heartbeat) {
        clearInterval(client.heartbeat);
        client.heartbeat = null;
      }
      removeClient(tenantId, res);
    }
  }, intervalMs);

  return client.heartbeat;
}

