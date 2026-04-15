/**
 * List recent pairing sessions
 * Run with: node scripts/list-pairing-sessions.js
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function listSessions() {
  console.log('\n=== Recent Pairing Sessions ===\n');

  try {
    const sessions = await prisma.pairingSession.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        sessionId: true,
        code: true,
        status: true,
        screenId: true,
        deviceToken: true,
        fingerprint: true,
        model: true,
        name: true,
        createdAt: true,
        expiresAt: true,
      },
    });

    if (sessions.length === 0) {
      console.log('No pairing sessions found');
      return;
    }

    sessions.forEach((session, index) => {
      console.log(`${index + 1}. Code: ${session.code} | Status: ${session.status}`);
      console.log(`   sessionId: ${session.sessionId}`);
      console.log(`   screenId: ${session.screenId || 'NULL'}`);
      console.log(`   deviceToken: ${session.deviceToken ? 'SET' : 'NULL'}`);
      console.log(`   fingerprint: ${session.fingerprint}`);
      console.log(`   model: ${session.model}`);
      console.log(`   created: ${session.createdAt.toISOString()}`);
      console.log(`   expires: ${session.expiresAt.toISOString()}`);
      console.log('');
    });

    console.log('\nTo diagnose a specific session, run:');
    console.log(`  node scripts/diagnose-pairing-status.js <sessionId>`);
    console.log(`\nExample:`);
    console.log(`  node scripts/diagnose-pairing-status.js ${sessions[0].sessionId}`);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

listSessions();









