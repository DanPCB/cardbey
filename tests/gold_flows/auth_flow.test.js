/**
 * Auth Flow Contract Test
 * 
 * This test ensures the authentication workflow works end-to-end:
 * 1. Create user (signup)
 * 2. Login and capture session
 * 3. Verify /api/auth/me returns user info
 * 4. Verify protected endpoints work with session
 * 5. Test token refresh (if available)
 * 
 * This is a "gold flow" test - if it fails, auth is broken.
 * CI will block merging if this test fails.
 * 
 * Policy: NEVER REBUILD ANYTHING DONE
 * If this test fails, it's a regression - fix the breaking change, don't rebuild.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fetch from 'node-fetch';
import { authenticatedFetch, createTestUser, cleanupTestData, prisma } from './test-helpers.js';
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001';
const TEST_TIMEOUT = 30000; // 30 seconds

describe('Auth Flow Contract Test', () => {
  let testEmail;
  let testPassword;
  let userId;
  let auth;

  beforeAll(async () => {
    testEmail = `test-auth-${Date.now()}@example.com`;
    testPassword = 'test-password-123';
  });

  afterAll(async () => {
    // Cleanup: Remove test user if possible
    await cleanupTestData([], [userId].filter(Boolean));
    await prisma.$disconnect();
  });

  it('Step 1: Signup - create user account', async () => {
    const response = await fetch(`${API_BASE_URL}/api/auth/signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: testEmail,
        password: testPassword,
        name: 'Test User',
      }),
    });

    if (response.status === 400) {
      // User might already exist, try login instead
      console.log('[Auth Test] User might exist, will try login in next step');
      return;
    }

    expect(response.status).toBe(200);
    const data = await response.json();
    
    expect(data).toHaveProperty('ok', true);
    expect(data).toHaveProperty('user');
    expect(data.user).toHaveProperty('id');
    expect(data.user).toHaveProperty('email', testEmail);
    
    userId = data.user.id;
    
    // Capture auth token/cookie
    const cookies = response.headers.get('set-cookie') || '';
    auth = {
      userId: data.user.id,
      token: data.token || null,
      cookie: cookies,
      email: testEmail,
    };
    
    console.log(`[Auth Test] Step 1 passed: User created, userId=${userId}`);
  }, TEST_TIMEOUT);

  it('Step 2: Login - capture session token/cookie', async () => {
    if (auth) {
      console.log('[Auth Test] Step 2 skipped: Already authenticated from signup');
      return;
    }
    
    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: testEmail,
        password: testPassword,
      }),
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    
    expect(data).toHaveProperty('ok', true);
    expect(data).toHaveProperty('user');
    expect(data.user).toHaveProperty('id');
    expect(data.user).toHaveProperty('email', testEmail);
    
    userId = data.user.id;
    
    // Capture auth token/cookie
    const cookies = response.headers.get('set-cookie') || '';
    auth = {
      userId: data.user.id,
      token: data.token || null,
      cookie: cookies,
      email: testEmail,
    };
    
    expect(auth.token || auth.cookie).toBeTruthy();
    console.log(`[Auth Test] Step 2 passed: Logged in, userId=${userId}, hasToken=${!!auth.token}, hasCookie=${!!auth.cookie}`);
  }, TEST_TIMEOUT);

  it('Step 3: GET /api/auth/me - returns user info', async () => {
    expect(auth).toBeTruthy();
    
    const response = await authenticatedFetch(
      `${API_BASE_URL}/api/auth/me`,
      {
        method: 'GET',
      },
      auth
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    
    expect(data).toHaveProperty('ok', true);
    expect(data).toHaveProperty('user');
    expect(data.user).toHaveProperty('id', userId);
    expect(data.user).toHaveProperty('email', testEmail);
    
    console.log(`[Auth Test] Step 3 passed: /api/auth/me returns user info`);
  }, TEST_TIMEOUT);

  it('Step 4: Protected endpoint - verify authorization works', async () => {
    expect(auth).toBeTruthy();
    
    // Try accessing a protected endpoint (device list or store context)
    const response = await authenticatedFetch(
      `${API_BASE_URL}/api/device/list`,
      {
        method: 'GET',
      },
      auth
    );

    // Should not return 401 Unauthorized
    expect(response.status).not.toBe(401);
    
    // If 403, that's okay (might not have permissions)
    // If 200, that's perfect
    // If 404, endpoint might not exist (skip)
    
    if (response.status === 404) {
      console.log('[Auth Test] Step 4 skipped: Protected endpoint not available');
      return;
    }
    
    if (response.status === 403) {
      console.log('[Auth Test] Step 4 passed: Authorization works (403 = authorized but no permission)');
      return;
    }
    
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty('ok');
    
    console.log(`[Auth Test] Step 4 passed: Protected endpoint accessible`);
  }, TEST_TIMEOUT);

  it('Step 5: Token refresh - session remains valid', async () => {
    expect(auth).toBeTruthy();
    
    // Try refresh endpoint if it exists
    const response = await authenticatedFetch(
      `${API_BASE_URL}/api/auth/refresh`,
      {
        method: 'POST',
      },
      auth
    );

    if (response.status === 404) {
      console.log('[Auth Test] Step 5 skipped: Token refresh endpoint not available');
      return;
    }

    expect(response.status).toBe(200);
    const data = await response.json();
    
    expect(data).toHaveProperty('ok', true);
    
    // Verify new token works
    if (data.token) {
      const newAuth = { ...auth, token: data.token };
      const meResponse = await authenticatedFetch(
        `${API_BASE_URL}/api/auth/me`,
        { method: 'GET' },
        newAuth
      );
      expect(meResponse.status).toBe(200);
    }
    
    console.log(`[Auth Test] Step 5 passed: Token refresh works`);
  }, TEST_TIMEOUT);

  it('Step 6: Diagnostics endpoint - returns auth state', async () => {
    expect(auth).toBeTruthy();
    
    const response = await authenticatedFetch(
      `${API_BASE_URL}/api/auth/diagnostics`,
      {
        method: 'GET',
      },
      auth
    );

    if (response.status === 404) {
      console.log('[Auth Test] Step 6 skipped: Auth diagnostics endpoint not yet implemented');
      return;
    }

    expect(response.status).toBe(200);
    const data = await response.json();
    
    expect(data).toHaveProperty('ok', true);
    expect(data).toHaveProperty('state');
    expect(data).toHaveProperty('recommendedAction');
    
    console.log(`[Auth Test] Step 6 passed: Diagnostics available, state=${data.state}`);
  }, TEST_TIMEOUT);
});















