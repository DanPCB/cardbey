/**
 * Pairing Flow Contract Test
 * 
 * This test ensures the pairing workflow works end-to-end:
 * 1. Device requests pairing (creates temp device)
 * 2. Dashboard completes pairing (claims device to real tenant/store)
 * 3. Device appears in device list under tenant/store
 * 4. Status polling works correctly
 * 
 * This is a "gold flow" test - if it fails, pairing is broken.
 * CI will block merging if this test fails.
 * 
 * Policy: NEVER REBUILD ANYTHING DONE
 * If this test fails, it's a regression - fix the breaking change, don't rebuild.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fetch from 'node-fetch';
import { prisma } from './test-helpers.js';
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001';
const TEST_TIMEOUT = 30000; // 30 seconds

describe('Pairing Flow Contract Test', () => {
  let testTenantId;
  let testStoreId;
  let testDeviceId;
  let pairingCode;
  let sessionId;

  beforeAll(async () => {
    // Create test tenant and store
    // Note: In real test, you might use test fixtures or seed data
    // For now, we'll use existing test data or create minimal test entities
    
    // You may need to adjust this based on your test setup
    testTenantId = process.env.TEST_TENANT_ID || 'test-tenant-id';
    testStoreId = process.env.TEST_STORE_ID || 'test-store-id';
  });

  afterAll(async () => {
    // Cleanup: Remove test device if it was created
    if (testDeviceId) {
      try {
        await prisma.device.delete({
          where: { id: testDeviceId },
        }).catch(() => {
          // Ignore if already deleted
        });
      } catch (e) {
        // Ignore cleanup errors
      }
    }
    await prisma.$disconnect();
  });

  it('Step 1: Device requests pairing - creates temp device with pairing code', async () => {
    const response = await fetch(`${API_BASE_URL}/api/device/request-pairing`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        platform: 'android_tv',
        deviceModel: 'Test Device',
        deviceType: 'screen',
        appVersion: '1.0.0',
      }),
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    
    expect(data).toHaveProperty('ok', true);
    expect(data).toHaveProperty('sessionId');
    expect(data).toHaveProperty('code');
    expect(data).toHaveProperty('expiresAt');
    
    sessionId = data.sessionId;
    pairingCode = data.code;
    
    expect(sessionId).toBeTruthy();
    expect(pairingCode).toBeTruthy();
    expect(pairingCode.length).toBeGreaterThanOrEqual(4); // At least 4 chars
    
    // Verify device was created in database with temp tenant/store
    const device = await prisma.device.findUnique({
      where: { id: sessionId },
    });
    
    expect(device).toBeTruthy();
    expect(device.tenantId).toBe('temp');
    expect(device.storeId).toBe('temp');
    expect(device.pairingCode).toBe(pairingCode);
    
    testDeviceId = sessionId;
    
    console.log(`[Pairing Contract Test] Step 1 passed: Device created with sessionId=${sessionId}, code=${pairingCode}`);
  }, TEST_TIMEOUT);

  it('Step 2: Device can poll pairing status - returns "pending"', async () => {
    expect(sessionId).toBeTruthy();
    
    const response = await fetch(`${API_BASE_URL}/api/device/pair-status/${sessionId}`, {
      method: 'GET',
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    
    expect(data).toHaveProperty('ok', true);
    expect(data).toHaveProperty('status');
    expect(data.status).toBe('pending');
    expect(data).toHaveProperty('pairingCode', pairingCode);
    
    console.log(`[Pairing Contract Test] Step 2 passed: Status polling works, status=${data.status}`);
  }, TEST_TIMEOUT);

  it('Step 3: Dashboard completes pairing - claims device to real tenant/store', async () => {
    expect(pairingCode).toBeTruthy();
    expect(testTenantId).toBeTruthy();
    expect(testStoreId).toBeTruthy();
    
    const response = await fetch(`${API_BASE_URL}/api/device/complete-pairing`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        pairingCode: pairingCode,
        tenantId: testTenantId,
        storeId: testStoreId,
        name: 'Contract Test Device',
      }),
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    
    expect(data).toHaveProperty('ok', true);
    expect(data).toHaveProperty('deviceId');
    expect(data.deviceId).toBe(testDeviceId);
    expect(data).toHaveProperty('status');
    
    // Verify device was updated in database with real tenant/store
    const device = await prisma.device.findUnique({
      where: { id: testDeviceId },
    });
    
    expect(device).toBeTruthy();
    expect(device.tenantId).toBe(testTenantId);
    expect(device.storeId).toBe(testStoreId);
    expect(device.pairingCode).toBeNull(); // Pairing code should be cleared
    expect(device.name).toBe('Contract Test Device');
    
    console.log(`[Pairing Contract Test] Step 3 passed: Device claimed to tenant=${testTenantId}, store=${testStoreId}`);
  }, TEST_TIMEOUT);

  it('Step 4: Device appears in device list under tenant/store', async () => {
    expect(testTenantId).toBeTruthy();
    expect(testStoreId).toBeTruthy();
    expect(testDeviceId).toBeTruthy();
    
    // Note: This endpoint might require auth - adjust based on your setup
    const response = await fetch(
      `${API_BASE_URL}/api/device/list?tenantId=${testTenantId}&storeId=${testStoreId}`,
      {
        method: 'GET',
        headers: {
          // Add auth headers if needed
          // 'Authorization': `Bearer ${testToken}`,
        },
      }
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    
    expect(data).toHaveProperty('ok', true);
    expect(data).toHaveProperty('data');
    expect(data.data).toHaveProperty('devices');
    expect(Array.isArray(data.data.devices)).toBe(true);
    
    // Find our test device in the list
    const device = data.data.devices.find(d => d.id === testDeviceId);
    
    expect(device).toBeTruthy();
    expect(device.tenantId).toBe(testTenantId);
    expect(device.storeId).toBe(testStoreId);
    expect(device.name).toBe('Contract Test Device');
    
    console.log(`[Pairing Contract Test] Step 4 passed: Device found in list`);
  }, TEST_TIMEOUT);

  it('Step 5: Device can poll pairing status - returns "claimed" with deviceId', async () => {
    expect(sessionId).toBeTruthy();
    
    const response = await fetch(`${API_BASE_URL}/api/device/pair-status/${sessionId}`, {
      method: 'GET',
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    
    expect(data).toHaveProperty('ok', true);
    expect(data).toHaveProperty('status');
    expect(data.status).toBe('claimed');
    expect(data).toHaveProperty('deviceId', testDeviceId);
    
    console.log(`[Pairing Contract Test] Step 5 passed: Status polling returns claimed, deviceId=${data.deviceId}`);
  }, TEST_TIMEOUT);

  it('Step 6: Device heartbeat works after pairing', async () => {
    expect(testDeviceId).toBeTruthy();
    
    const response = await fetch(`${API_BASE_URL}/api/device/heartbeat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        deviceId: testDeviceId,
        engineVersion: 'DEVICE_V2',
        platform: 'android_tv',
        status: 'online',
      }),
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    
    expect(data).toHaveProperty('ok', true);
    expect(data).toHaveProperty('deviceId', testDeviceId);
    expect(data).toHaveProperty('status');
    expect(data).toHaveProperty('pairingStatus');
    // After pairing, pairingStatus should be PAIRED_NO_PLAYLIST or PAIRED_PLAYLIST_ASSIGNED
    expect(['PAIRED_NO_PLAYLIST', 'PAIRED_PLAYLIST_ASSIGNED']).toContain(data.pairingStatus);
    
    console.log(`[Pairing Contract Test] Step 6 passed: Heartbeat works, pairingStatus=${data.pairingStatus}`);
  }, TEST_TIMEOUT);
});

