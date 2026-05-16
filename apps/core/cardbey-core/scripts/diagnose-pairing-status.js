/**
 * Diagnostic script to check pairing session status
 * Run with: node scripts/diagnose-pairing-status.js <sessionId>
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function diagnoseSession(sessionId) {
  console.log(`\n=== Diagnosing PairingSession: ${sessionId} ===\n`);

  try {
    // Get session from database
    const session = await prisma.pairingSession.findUnique({
      where: { sessionId },
      include: {
        screen: {
          select: {
            id: true,
            name: true,
            token: true, // Check if Screen has token field
          },
        },
      },
    });

    if (!session) {
      console.log('❌ Session not found in database');
      return;
    }

    console.log('📋 Session Details:');
    console.log(`   sessionId: ${session.sessionId}`);
    console.log(`   code: ${session.code}`);
    console.log(`   status: ${session.status}`);
    console.log(`   screenId: ${session.screenId || 'NULL'}`);
    console.log(`   deviceToken: ${session.deviceToken || 'NULL'}`);
    console.log(`   expiresAt: ${session.expiresAt}`);
    console.log(`   fingerprint: ${session.fingerprint}`);
    console.log(`   model: ${session.model}`);

    if (session.screen) {
      console.log('\n📺 Linked Screen:');
      console.log(`   id: ${session.screen.id}`);
      console.log(`   name: ${session.screen.name || 'NULL'}`);
      console.log(`   token: ${session.screen.token || 'NULL (Screen model has no token field)'}`);
    } else {
      console.log('\n📺 Linked Screen: NULL');
    }

    // Simulate what the status endpoint would return
    console.log('\n🔍 Status Endpoint Response Simulation:');
    const expiresAtDate = new Date(session.expiresAt);
    const ttlLeftMs = Math.max(0, expiresAtDate.getTime() - Date.now());
    let status = session.status;
    
    if (ttlLeftMs <= 0 && status !== 'bound' && status !== 'expired') {
      status = 'expired';
    }

    const payload = {
      ok: true,
      sessionId: session.sessionId,
      status: status,
      ttlLeftMs: status === 'bound' ? 0 : ttlLeftMs,
    };

    if (status === 'bound' && session.screenId) {
      payload.screenId = session.screenId;
      let token = session.deviceToken;
      
      if (!token && session.screen) {
        token = session.screen.token || null;
      }
      
      if (token) {
        payload.token = token;
      }
    }

    console.log(JSON.stringify(payload, null, 2));

    // Check what tablet expects
    console.log('\n✅ Tablet Validation:');
    if (payload.status === 'bound') {
      if (payload.screenId && payload.token) {
        console.log('   ✅ Has screenId and token - Tablet should accept');
      } else {
        console.log('   ❌ Missing credentials:');
        console.log(`      screenId: ${payload.screenId ? '✅' : '❌ MISSING'}`);
        console.log(`      token: ${payload.token ? '✅' : '❌ MISSING'}`);
        console.log('   → This will cause "Invalid response: missing credentials" error');
      }
    } else {
      console.log(`   ℹ️  Status is "${payload.status}" - Tablet should continue waiting`);
    }

    // Check if /pair/complete was called
    console.log('\n🔍 Completion Check:');
    if (session.status === 'bound') {
      if (session.screenId && session.deviceToken) {
        console.log('   ✅ Session is properly bound with credentials');
      } else {
        console.log('   ❌ Session marked as "bound" but missing credentials:');
        console.log(`      screenId: ${session.screenId ? '✅' : '❌ MISSING'}`);
        console.log(`      deviceToken: ${session.deviceToken ? '✅' : '❌ MISSING'}`);
        console.log('   → /pair/complete may not have set these fields correctly');
      }
    } else {
      console.log(`   ℹ️  Session status is "${session.status}" - pairing not completed yet`);
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Get sessionId from command line
const sessionId = process.argv[2];

if (!sessionId) {
  console.log('Usage: node scripts/diagnose-pairing-status.js <sessionId>');
  console.log('\nTo find sessionId, check recent pairing sessions:');
  console.log('  node scripts/list-pairing-sessions.js');
  process.exit(1);
}

diagnoseSession(sessionId);









