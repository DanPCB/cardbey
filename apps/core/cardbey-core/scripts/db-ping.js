#!/usr/bin/env node
/**
 * Database Ping Script
 * Quick probe to test database connection
 * Exits with code 0 on success, non-zero on failure
 */

import { testDatabaseConnection } from '../src/db/prisma.js';
import { disconnectDatabase } from '../src/db/prisma.js';

async function main() {
  console.log('[DB] Testing database connection...');
  
  const result = await testDatabaseConnection();
  
  if (result.ok) {
    console.log(`[DB] ✅ Connected (${result.dialect}, ${result.latencyMs}ms)`);
    await disconnectDatabase();
    process.exit(0);
  } else {
    console.error(`[DB] ❌ Connection failed: ${result.reason || result.error}`);
    if (result.error === 'env/DATABASE_URL') {
      console.error('[DB] 💡 Set DATABASE_URL in your .env file');
    }
    await disconnectDatabase();
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('[DB] Fatal error:', error);
  process.exit(1);
});

