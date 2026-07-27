/**
 * Device WebSocket Hub
 * Manages WebSocket connections per device for real-time communication
 * Endpoint: /api/devices/:deviceId/realtime
 */

import { WebSocketServer } from 'ws';

/**
 * Device socket connection
 * @typedef {Object} DeviceSocket
 * @property {string} deviceId - Device ID
 * @property {WebSocket} socket - WebSocket connection
 * @property {Date} connectedAt - Connection timestamp
 */

/**
 * Device WebSocket Hub
 * Tracks connections per device and provides methods to send messages
 */
class DeviceWebSocketHub {
  constructor() {
    /** @type {Map<string, Set<WebSocket>>} */
    this.connections = new Map();
  }

  /**
   * Handle new device connection
   * 
   * @param {string} deviceId - Device ID
   * @param {WebSocket} socket - WebSocket connection
   */
  handleConnection(deviceId, socket) {
    console.log(`[WS] Device connected: ${deviceId}`);
    console.log('[DeviceWebSocketHub] Connection', { deviceId });

    // Initialize device connections set if not exists
    if (!this.connections.has(deviceId)) {
      this.connections.set(deviceId, new Set());
    }

    // Add socket to device's connection set
    const deviceConnections = this.connections.get(deviceId);
    deviceConnections.add(socket);

    // Handle socket close
    socket.on('close', () => {
      console.log(`[WS] Device disconnected: ${deviceId}`);
      console.log('[DeviceWebSocketHub] Disconnection', { deviceId });
      deviceConnections.delete(socket);
      if (deviceConnections.size === 0) {
        this.connections.delete(deviceId);
      }
    });

    // Handle socket error
    socket.on('error', (error) => {
      console.error('[DeviceWebSocketHub] Socket error', { deviceId, error: error.message });
      deviceConnections.delete(socket);
      if (deviceConnections.size === 0) {
        this.connections.delete(deviceId);
      }
    });

    // Handle incoming messages
    socket.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        console.log('[DeviceWebSocketHub] Message from device', { deviceId, type: message.type });
        
        // Handle ping/pong
        if (message.type === 'ping') {
          socket.send(JSON.stringify({
            type: 'pong',
            timestamp: Date.now(),
          }));
        }
      } catch (error) {
        console.error('[DeviceWebSocketHub] Error parsing message', { deviceId, error: error.message });
      }
    });

    // Send welcome message
    socket.send(JSON.stringify({
      type: 'connected',
      deviceId,
      timestamp: Date.now(),
      message: 'Device WebSocket connection established',
    }));
  }

  /**
   * Remove connection
   * 
   * @param {string} deviceId - Device ID
   * @param {WebSocket} socket - WebSocket connection
   */
  removeConnection(deviceId, socket) {
    const deviceConnections = this.connections.get(deviceId);
    if (deviceConnections) {
      deviceConnections.delete(socket);
      if (deviceConnections.size === 0) {
        this.connections.delete(deviceId);
      }
    }
  }

  /**
   * Send message to a specific device
   * 
   * @param {string} deviceId - Device ID
   * @param {any} payload - Message payload
   * @returns {boolean} True if message was sent to at least one connection
   */
  sendToDevice(deviceId, payload) {
    const deviceConnections = this.connections.get(deviceId);
    if (!deviceConnections || deviceConnections.size === 0) {
      console.warn('[DeviceWebSocketHub] No connections for device', { deviceId });
      return false;
    }

    const message = JSON.stringify(payload);
    let sent = false;

    deviceConnections.forEach((socket) => {
      if (socket.readyState === socket.OPEN) {
        try {
          socket.send(message);
          sent = true;
        } catch (error) {
          console.error('[DeviceWebSocketHub] Error sending message', {
            deviceId,
            error: error.message,
          });
        }
      }
    });

    if (sent) {
      console.log('[DeviceWebSocketHub] Message sent to device', {
        deviceId,
        type: payload.type,
        connectionCount: deviceConnections.size,
      });
    }

    return sent;
  }

  /**
   * Broadcast message to multiple devices
   * 
   * @param {string[]} deviceIds - Array of device IDs
   * @param {any} payload - Message payload
   * @returns {number} Number of devices that received the message
   */
  broadcastToDevices(deviceIds, payload) {
    let sentCount = 0;
    deviceIds.forEach((deviceId) => {
      if (this.sendToDevice(deviceId, payload)) {
        sentCount++;
      }
    });
    return sentCount;
  }

  /**
   * Get connection count for a device
   * 
   * @param {string} deviceId - Device ID
   * @returns {number} Number of active connections
   */
  getConnectionCount(deviceId) {
    const deviceConnections = this.connections.get(deviceId);
    return deviceConnections ? deviceConnections.size : 0;
  }

  /**
   * Get all connected device IDs
   * 
   * @returns {string[]} Array of device IDs with active connections
   */
  getConnectedDevices() {
    return Array.from(this.connections.keys());
  }
}

// Singleton instance
let hubInstance = null;

/**
 * Get or create DeviceWebSocketHub instance
 * 
 * @returns {DeviceWebSocketHub} Hub instance
 */
export function getDeviceWebSocketHub() {
  if (!hubInstance) {
    hubInstance = new DeviceWebSocketHub();
  }
  return hubInstance;
}

/**
 * Initialize device WebSocket server
 * Extends existing WebSocket server with device-specific routes
 * 
 * @param {http.Server} server - HTTP server instance
 */
export function initializeDeviceWebSocketServer(server) {
  const hub = getDeviceWebSocketHub();
  const deviceWss = new WebSocketServer({ noServer: true });

  // Intercept HTTP upgrade requests for device WebSocket paths
  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const pathMatch = url.pathname.match(/^\/api\/devices\/([^/]+)\/realtime$/);
    
    if (!pathMatch) {
      // Not a device WebSocket path - let other handlers process it
      return;
    }

    const deviceId = pathMatch[1];
    
    if (!deviceId) {
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
      socket.destroy();
      return;
    }

    // Handle upgrade for device WebSocket
    deviceWss.handleUpgrade(request, socket, head, (ws) => {
      console.log('[DeviceWebSocketHub] Device WebSocket connection', { deviceId });
      hub.handleConnection(deviceId, ws);
    });
  });

  console.log('[DeviceWebSocketHub] Device WebSocket server initialized - devices connect to /api/devices/:deviceId/realtime');
}

