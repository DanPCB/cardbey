/**
 * Test Environment Setup
 * 
 * Loads .env.test before any tests run to ensure test database is used.
 * This runs before Prisma client is imported, ensuring correct DATABASE_URL.
 * 
 * CRITICAL: Set JWT_SECRET FIRST before any imports that might use it.
 */

import dotenv from 'dotenv';
import { resolve } from 'path';
import { CANONICAL_TEST_DB, toFileUrl } from '../lib/sqliteDbPath.js';

// Load .env.test explicitly (separate from dev .env)
const envPath = resolve(process.cwd(), '.env.test');
dotenv.config({ path: envPath });

// Ensure JWT_SECRET is set (override .env.test if needed for tests)
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'test-jwt-secret';
}

// Tests import the Express app directly; never bind the API port during unit/integration runs.
if (process.env.ROLE === 'api') {
  delete process.env.ROLE;
}
process.env.ROLE = process.env.ROLE || 'test';

// Assert NODE_ENV === 'test'
if (process.env.NODE_ENV !== 'test') {
  throw new Error(
    `[TestEnv] CRITICAL: NODE_ENV must be 'test', got: ${process.env.NODE_ENV}. ` +
    `This prevents accidental dev.db usage. Check .env.test file contains NODE_ENV=test`
  );
}

// Pin to canonical prisma/test.db absolute URL (avoids ghost cardbey-core/test.db).
process.env.DATABASE_URL = toFileUrl(CANONICAL_TEST_DB);

if (!process.env.DATABASE_URL.includes('test.db')) {
  throw new Error(
    `[TestEnv] CRITICAL: DATABASE_URL must point to test.db, got: ${process.env.DATABASE_URL}. ` +
    `This prevents polluting dev.db. Check .env.test file exists and contains DATABASE_URL="file:../test.db"`
  );
}

// Test harness baseline: blocking flags default ON in production; tests opt in per case.
if (process.env.BROKER_BLOCK_DIRECT_ACTION === undefined) {
  process.env.BROKER_BLOCK_DIRECT_ACTION = 'false';
}

// Print test environment (bulletproof regression prevention)
console.log(`[TestEnv] DATABASE_URL=${process.env.DATABASE_URL} NODE_ENV=${process.env.NODE_ENV} JWT_SECRET=${process.env.JWT_SECRET ? 'set' : 'missing'}`);

