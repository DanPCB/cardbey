/**
 * Pre-flight checks for Device Agent endpoints
 * Tests all required endpoints for the slideshow agent
 */

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001';

async function testEndpoint(method, path, body = null, description) {
  try {
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(`${BASE_URL}${path}`, options);
    let data;
    try {
      data = await response.json();
    } catch {
      const text = await response.text();
      data = { text };
    }

    const status = response.ok ? '✅' : '❌';
    console.log(`${status} ${description}`);
    console.log(`   ${method} ${path} → ${response.status} ${response.statusText}`);
    
    if (response.ok) {
      console.log(`   Response:`, JSON.stringify(data, null, 2).substring(0, 200));
    } else {
      console.log(`   Error:`, data.error || data.message || JSON.stringify(data));
    }
    console.log('');

    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    console.log(`❌ ${description}`);
    console.log(`   ${method} ${path} → ERROR: ${error.message}`);
    console.log('');
    return { ok: false, error: error.message };
  }
}

async function runTests() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Device Agent Pre-flight Checks');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`Base URL: ${BASE_URL}\n`);

  // Test 1: Health endpoint
  console.log('1. Testing Health Endpoint');
  console.log('───────────────────────────────────────────────────────────');
  const healthResult = await testEndpoint('GET', '/api/health', null, 'GET /api/health');

  // Test 2: Device Registration
  console.log('2. Testing Device Registration');
  console.log('───────────────────────────────────────────────────────────');
  const registerResult = await testEndpoint(
    'POST',
    '/api/devices/register',
    {
      platform: 'android_tv',
      metadata: {
        appVersion: '1.0.0',
        model: 'Test Device',
      },
    },
    'POST /api/devices/register'
  );

  let deviceId = null;
  if (registerResult.ok && registerResult.data.deviceId) {
    deviceId = registerResult.data.deviceId;
    console.log(`   ✓ Device registered with ID: ${deviceId}`);
    console.log(`   Config:`, JSON.stringify(registerResult.data.config, null, 2));
    console.log('');
  } else {
    console.log('   ⚠️  Could not get deviceId, using placeholder for remaining tests');
    deviceId = 'test-device-id';
    console.log('');
  }

  // Test 3: Get Playlist
  console.log('3. Testing Get Playlist');
  console.log('───────────────────────────────────────────────────────────');
  if (deviceId && deviceId !== 'test-device-id') {
    await testEndpoint(
      'GET',
      `/api/devices/${deviceId}/playlist`,
      null,
      `GET /api/devices/${deviceId}/playlist`
    );
  } else {
    console.log('⚠️  Skipping playlist test (no valid deviceId)');
    console.log('');
  }

  // Test 4: Heartbeat
  console.log('4. Testing Heartbeat');
  console.log('───────────────────────────────────────────────────────────');
  if (deviceId && deviceId !== 'test-device-id') {
    await testEndpoint(
      'POST',
      `/api/devices/${deviceId}/heartbeat`,
      {
        status: 'online',
        info: {
          battery: 100,
          network: 'wifi',
          playlistVersion: '1.0.0',
        },
      },
      `POST /api/devices/${deviceId}/heartbeat`
    );
  } else {
    console.log('⚠️  Skipping heartbeat test (no valid deviceId)');
    console.log('');
  }

  // Test 5: WebSocket endpoint info
  console.log('5. WebSocket Endpoint');
  console.log('───────────────────────────────────────────────────────────');
  if (deviceId && deviceId !== 'test-device-id' && registerResult.data.config) {
    const wsUrl = registerResult.data.config.streamBaseUrl || BASE_URL.replace('http', 'ws');
    console.log(`   WebSocket URL: ${wsUrl}/api/devices/${deviceId}/realtime`);
    console.log(`   ⚠️  Manual test required: Use wscat or WebSocket client to connect`);
    console.log(`   Example: wscat -c "${wsUrl}/api/devices/${deviceId}/realtime"`);
    console.log('');
  } else {
    console.log('   ⚠️  WebSocket URL not available (no device config)');
    console.log(`   Expected format: ws://${BASE_URL.replace('http://', '')}/api/devices/:deviceId/realtime`);
    console.log('');
  }

  // Summary
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Summary');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`Health endpoint: ${healthResult.ok ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Device registration: ${registerResult.ok ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Device ID obtained: ${deviceId && deviceId !== 'test-device-id' ? '✅ YES' : '❌ NO'}`);
  console.log('');
  console.log('Next steps:');
  console.log('1. Verify Device and SystemEvent tables exist in database');
  console.log('2. Test WebSocket connection manually with wscat');
  console.log('3. Verify device appears in database after registration');
  console.log('');
}

// Run tests
runTests().catch((error) => {
  console.error('Test runner error:', error);
  process.exit(1);
});

