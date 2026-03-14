/**
 * Gold Flow Test Helpers
 * Utilities for setting up test environment, seeding data, and cleaning up
 * Uses the same Prisma client as the core app (includes WorkflowRun).
 */

import fetch from 'node-fetch';
import { prisma } from '../../apps/core/cardbey-core/src/lib/prisma.js';

export { prisma };
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001';

/**
 * Create a test tenant and store
 * Returns { tenantId, storeId }
 */
export async function createTestTenantAndStore() {
  const tenantId = `test-tenant-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const storeId = `test-store-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  
  // Create tenant (if Tenant model exists)
  // For now, we'll just use the IDs directly since they might be stored in Device/Store models
  // Adjust based on your actual schema
  
  return { tenantId, storeId };
}

/**
 * Create a test user and return auth token/cookie
 * Returns { userId, token, cookie }
 */
export async function createTestUser(email = null, password = 'test-password-123') {
  const testEmail = email || `test-${Date.now()}@example.com`;
  
  try {
    // Try signup endpoint
    const signupRes = await fetch(`${API_BASE_URL}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password,
        name: 'Test User',
      }),
    });
    
    if (signupRes.ok) {
      const data = await signupRes.json();
      const cookies = signupRes.headers.get('set-cookie') || '';
      return {
        userId: data.user?.id || data.id,
        token: data.token || null,
        cookie: cookies,
        email: testEmail,
      };
    }
  } catch (error) {
    console.warn('[Test Helper] Signup failed, trying login:', error.message);
  }
  
  // Try login if signup failed or user exists
  try {
    const loginRes = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password,
      }),
    });
    
    if (loginRes.ok) {
      const data = await loginRes.json();
      const cookies = loginRes.headers.get('set-cookie') || '';
      return {
        userId: data.user?.id || data.id,
        token: data.token || null,
        cookie: cookies,
        email: testEmail,
      };
    }
  } catch (error) {
    console.warn('[Test Helper] Login failed:', error.message);
  }
  
  // Fallback: return mock auth (for tests that don't require real auth)
  return {
    userId: `test-user-${Date.now()}`,
    token: null,
    cookie: '',
    email: testEmail,
  };
}

/**
 * Create a test device via heartbeat
 * Returns { deviceId, sessionId, pairingCode }
 */
export async function createTestDevice(tenantId = 'temp', storeId = 'temp') {
  const response = await fetch(`${API_BASE_URL}/api/device/heartbeat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      engineVersion: 'DEVICE_V2',
      platform: 'test',
      status: 'online',
      tenantId,
      storeId,
    }),
  });
  
  if (!response.ok) {
    throw new Error(`Failed to create test device: ${response.status} ${await response.text()}`);
  }
  
  const data = await response.json();
  return {
    deviceId: data.deviceId,
    sessionId: data.deviceId, // In DeviceEngine V2, deviceId is sessionId
    pairingCode: null, // Will be set when requesting pairing
  };
}

/**
 * Request pairing for a device
 * Returns { sessionId, code, expiresAt }
 */
export async function requestPairingForDevice(deviceId = null) {
  const response = await fetch(`${API_BASE_URL}/api/device/request-pairing`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      deviceId,
      platform: 'test',
      deviceModel: 'Test Device',
      deviceType: 'screen',
      appVersion: '1.0.0',
    }),
  });
  
  if (!response.ok) {
    throw new Error(`Failed to request pairing: ${response.status} ${await response.text()}`);
  }
  
  const data = await response.json();
  return {
    sessionId: data.sessionId,
    code: data.code,
    expiresAt: data.expiresAt,
  };
}

/**
 * Complete pairing
 * Returns { deviceId, status }
 */
export async function completePairingForDevice(pairingCode, tenantId, storeId, name = 'Test Device') {
  const response = await fetch(`${API_BASE_URL}/api/device/complete-pairing`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pairingCode,
      tenantId,
      storeId,
      name,
    }),
  });
  
  if (!response.ok) {
    throw new Error(`Failed to complete pairing: ${response.status} ${await response.text()}`);
  }
  
  const data = await response.json();
  return {
    deviceId: data.deviceId,
    status: data.status,
  };
}

/**
 * Cleanup test data
 */
export async function cleanupTestData(deviceIds = [], userIds = []) {
  try {
    // Delete test devices
    for (const deviceId of deviceIds) {
      await prisma.device.delete({
        where: { id: deviceId },
      }).catch(() => {
        // Ignore if already deleted
      });
    }
    
    // Delete test users (if User model exists)
    // Adjust based on your schema
    
    console.log('[Test Helper] Cleaned up test data');
  } catch (error) {
    console.warn('[Test Helper] Cleanup error (non-fatal):', error.message);
  }
}

/**
 * Wait for server to be ready
 */
export async function waitForServer(maxWaitMs = 30000) {
  const startTime = Date.now();
  while (Date.now() - startTime < maxWaitMs) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/health`);
      if (response.ok) {
        return true;
      }
    } catch (error) {
      // Server not ready yet
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`Server not ready after ${maxWaitMs}ms`);
}

/**
 * Make authenticated request
 */
export async function authenticatedFetch(url, options = {}, auth = null) {
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  
  if (auth?.token) {
    headers['Authorization'] = `Bearer ${auth.token}`;
  }
  
  if (auth?.cookie) {
    headers['Cookie'] = auth.cookie;
  }
  
  return fetch(url, {
    ...options,
    headers,
  });
}















