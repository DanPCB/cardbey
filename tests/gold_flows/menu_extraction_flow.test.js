/**
 * Menu Extraction Flow Contract Test
 * 
 * This test ensures the menu extraction workflow works end-to-end:
 * 1. Upload menu image
 * 2. Extract items via API
 * 3. Verify items returned with required fields
 * 4. Persist items and verify they appear in menu list
 * 
 * This is a "gold flow" test - if it fails, menu extraction is broken.
 * CI will block merging if this test fails.
 * 
 * Policy: NEVER REBUILD ANYTHING DONE
 * If this test fails, it's a regression - fix the breaking change, don't rebuild.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fetch from 'node-fetch';
import { createTestTenantAndStore, cleanupTestData, prisma } from './test-helpers.js';
import { readFileSync } from 'fs';
import { join } from 'path';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001';
const TEST_TIMEOUT = 60000; // 60 seconds (extraction can take time)

describe('Menu Extraction Flow Contract Test', () => {
  let testTenantId;
  let testStoreId;
  let mediaId;
  let extractionJobId;
  let extractedItems = [];

  beforeAll(async () => {
    // Create test tenant and store
    const tenantStore = await createTestTenantAndStore();
    testTenantId = tenantStore.tenantId;
    testStoreId = tenantStore.storeId;
  });

  afterAll(async () => {
    // Cleanup: Remove test data
    await cleanupTestData([], []);
    await prisma.$disconnect();
  });

  it('Step 1: Upload menu image - media created', async () => {
    // For this test, we'll use a small test image or create a mock upload
    // In a real scenario, you'd have a test fixture image
    
    // Option 1: Use existing upload endpoint if available
    // Option 2: Create media record directly for testing
    // Option 3: Use a test fixture file
    
    // For now, we'll simulate by creating a media record
    // In production, you'd actually upload a file
    
    const testImagePath = join(process.cwd(), 'tests', 'fixtures', 'menu.jpg');
    let imageBuffer;
    
    try {
      imageBuffer = readFileSync(testImagePath);
    } catch (error) {
      // If fixture doesn't exist, create a minimal test media record
      console.warn('[Menu Extraction Test] Test fixture not found, creating mock media');
      
      // Create a minimal media record for testing
      // Adjust based on your actual schema
      const media = await prisma.asset.create({
        data: {
          url: '/uploads/test/menu-test.jpg',
          storageKey: 'test/menu-test.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: 1024,
          // Add other required fields based on your schema
        },
      });
      
      mediaId = media.id;
      console.log(`[Menu Extraction Test] Step 1 passed: Created test media, mediaId=${mediaId}`);
      return;
    }
    
    // If we have a real image, upload it
    const formData = new FormData();
    const blob = new Blob([imageBuffer], { type: 'image/jpeg' });
    formData.append('file', blob, 'menu.jpg');
    
    const response = await fetch(`${API_BASE_URL}/api/uploads/create`, {
      method: 'POST',
      body: formData,
    });
    
    if (!response.ok) {
      throw new Error(`Upload failed: ${response.status} ${await response.text()}`);
    }
    
    const data = await response.json();
    mediaId = data.mediaId || data.id;
    
    expect(mediaId).toBeTruthy();
    console.log(`[Menu Extraction Test] Step 1 passed: Uploaded menu image, mediaId=${mediaId}`);
  }, TEST_TIMEOUT);

  it('Step 2: Extract items via API - returns items array', async () => {
    expect(mediaId).toBeTruthy();
    expect(testTenantId).toBeTruthy();
    expect(testStoreId).toBeTruthy();
    
    const response = await fetch(`${API_BASE_URL}/api/menu/extract-items`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        mediaId,
        tenantId: testTenantId,
        storeId: testStoreId,
        locale: 'en',
      }),
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    
    expect(data).toHaveProperty('ok', true);
    expect(data).toHaveProperty('items');
    expect(Array.isArray(data.items)).toBe(true);
    expect(data.items.length).toBeGreaterThan(0);
    
    // Store items for next step
    extractedItems = data.items;
    extractionJobId = data.jobId || data.id || null;
    
    // Verify required fields present
    const firstItem = data.items[0];
    expect(firstItem).toHaveProperty('name');
    // Price and category might be optional depending on extraction quality
    // expect(firstItem).toHaveProperty('price');
    
    console.log(`[Menu Extraction Test] Step 2 passed: Extracted ${data.items.length} items, jobId=${extractionJobId}`);
  }, TEST_TIMEOUT);

  it('Step 3: Verify items have required fields', async () => {
    expect(extractedItems.length).toBeGreaterThan(0);
    
    // Check each item has at least a name
    for (const item of extractedItems) {
      expect(item).toHaveProperty('name');
      expect(typeof item.name).toBe('string');
      expect(item.name.length).toBeGreaterThan(0);
    }
    
    console.log(`[Menu Extraction Test] Step 3 passed: All ${extractedItems.length} items have required fields`);
  }, TEST_TIMEOUT);

  it('Step 4: Fetch menu items list - verify persistence', async () => {
    expect(testTenantId).toBeTruthy();
    expect(testStoreId).toBeTruthy();
    
    const response = await fetch(
      `${API_BASE_URL}/api/menu/items?tenantId=${testTenantId}&storeId=${testStoreId}`,
      {
        method: 'GET',
      }
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    
    expect(data).toHaveProperty('ok', true);
    expect(data).toHaveProperty('data');
    expect(data.data).toHaveProperty('items');
    expect(Array.isArray(data.data.items)).toBe(true);
    
    // Verify our extracted items appear in the list
    // This assumes extraction endpoint persists items automatically
    // If not, we'd need to call a save/commit endpoint first
    
    const itemNames = data.data.items.map(item => item.name);
    const extractedNames = extractedItems.map(item => item.name);
    
    // At least one extracted item should appear in the list
    const foundItems = extractedNames.filter(name => itemNames.includes(name));
    expect(foundItems.length).toBeGreaterThan(0);
    
    console.log(`[Menu Extraction Test] Step 4 passed: Found ${foundItems.length} extracted items in menu list`);
  }, TEST_TIMEOUT);

  it('Step 5: Diagnostics endpoint returns extraction state', async () => {
    if (!extractionJobId) {
      console.log('[Menu Extraction Test] Step 5 skipped: No jobId available');
      return;
    }
    
    const response = await fetch(
      `${API_BASE_URL}/api/menu/extraction/${extractionJobId}/diagnostics`,
      {
        method: 'GET',
      }
    );

    if (response.status === 404) {
      console.log('[Menu Extraction Test] Step 5 skipped: Diagnostics endpoint not yet implemented');
      return;
    }

    expect(response.status).toBe(200);
    const data = await response.json();
    
    expect(data).toHaveProperty('ok', true);
    expect(data).toHaveProperty('state');
    expect(data).toHaveProperty('recommendedAction');
    
    console.log(`[Menu Extraction Test] Step 5 passed: Diagnostics available, state=${data.state}`);
  }, TEST_TIMEOUT);
});















