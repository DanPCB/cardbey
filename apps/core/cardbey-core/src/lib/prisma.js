/**
 * Single Prisma client for the core app.
 * Single runtime Prisma client from client-gen (see ./prismaClient.js).
 *
 * This file merges:
 * - stable single-client runtime from old src/lib/prisma.js
 * - connection/bootstrap helpers from old src/db/prisma.js
 *
 * Regenerate with the correct schema before running:
 *   SQLite:   npx prisma generate --schema prisma/sqlite/schema.prisma
 *   Postgres: npx prisma generate --schema prisma/postgres/schema.prisma
 *
 * Runtime imports client-gen (not @prisma/client) via ./prismaClient.js.
 */

import { PrismaClient } from './prismaClient.js';
import { getPrismaInteractiveTransactionOptions } from './prismaTransactionOptions.js';
import { logDbCapabilitiesOnce } from './persistence/dbCapabilityRegistry.js';

let prisma = null;
let connectionTested = false;
let connectionError = null;
let campaignModelsAsserted = false;
let connectPromise = null;

function isPrismaConnectionError(error) {
  const message = String(error?.message ?? '').toLowerCase();
  return (
    message.includes('connection has not been opened') ||
    message.includes('database is closed') ||
    message.includes('connection closed') ||
    error?.name === 'PrismaClientInitializationError'
  );
}

/** Ensure Prisma is connected (idempotent). */
export async function ensurePrismaConnection() {
  const client = getPrismaClient();
  if (!connectPromise) {
    connectPromise = client.$connect().then(() => client).catch((err) => {
      connectPromise = null;
      throw err;
    });
  }
  return connectPromise;
}

/** Reset singleton after connection failure (recovery path). */
export function resetPrismaClientForRecovery() {
  prisma = null;
  connectPromise = null;
  connectionTested = false;
  connectionError = null;
}

/**
 * Run a Prisma operation with connect + one reconnect retry on closed connection.
 * @template T
 * @param {(client: import('./prismaClient.js').PrismaClient) => Promise<T>} fn
 */
export async function withPrismaConnection(fn) {
  try {
    const client = await ensurePrismaConnection();
    return await fn(client);
  } catch (error) {
    if (isPrismaConnectionError(error)) {
      console.warn('[Prisma] connection error — recreating client:', error?.message || error);
      resetPrismaClientForRecovery();
      const client = await ensurePrismaConnection();
      return await fn(client);
    }
    throw error;
  }
}

/** Campaign routes require these Prisma model delegates (camelCase). */
const REQUIRED_CAMPAIGN_MODELS = [
  'campaignPlan',
  'campaignValidationResult',
  'campaignV2',
  'campaignScheduleItem',
  'creativeCopy',
  'creativeAsset',
  'offer',
  'channelDeployment',
  'campaignReport',
];

/** Parse PRISMA_LOG env (e.g. "query,info,warn,error"). */
function getPrismaLogLevels() {
  const env = process.env.PRISMA_LOG;
  if (env && typeof env === 'string' && env.trim()) {
    return env.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'];
}

/** Return the singleton Prisma client. */
export function getPrismaClient() {
  if (!prisma) {
    prisma = new PrismaClient({
      log: getPrismaLogLevels(),
      transactionOptions: getPrismaInteractiveTransactionOptions(),
    });

    logDbCapabilitiesOnce();

    if (process.env.NODE_ENV !== 'production') {
      console.log('[Prisma sanity] workflowRun delegate:', typeof prisma.workflowRun?.findFirst);
      if (typeof prisma.workflowRun?.findFirst !== 'function') {
        console.warn(
          '[prisma] prisma.workflowRun missing — WorkflowRun sync may no-op. ' +
          'Regenerate with the schema that matches your runtime database.'
        );
      }
    }

    if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
      const t = (name) =>
        prisma[name] != null && typeof prisma[name].findFirst === 'function' ? 'ok' : 'missing';

      console.log('[DB] Prisma client campaign models (dev):', {
        campaignPlan: t('campaignPlan'),
        campaignV2: t('campaignV2'),
        campaignScheduleItem: t('campaignScheduleItem'),
      });
    }
  }

  return prisma;
}

/** Ensure the Prisma client has campaign models. */
export function assertCampaignModels(client) {
  if (!client || typeof client !== 'object') {
    throw new Error('[DB] assertCampaignModels: client is required');
  }

  const missing = [];
  for (const name of REQUIRED_CAMPAIGN_MODELS) {
    const delegate = client[name];
    if (delegate == null || typeof delegate.findFirst !== 'function') {
      missing.push(name);
    }
  }

  if (missing.length > 0) {
    const schemaHint =
      process.env.DATABASE_URL &&
      (process.env.DATABASE_URL.startsWith('file:') || process.env.DATABASE_URL.includes('.db'))
        ? 'npx prisma generate --schema prisma/sqlite/schema.prisma && npx prisma db push --schema prisma/sqlite/schema.prisma'
        : 'npx prisma generate --schema prisma/postgres/schema.prisma && npx prisma migrate deploy --schema prisma/postgres/schema.prisma';

    throw new Error(
      `[DB] Prisma client is missing campaign models: ${missing.join(', ')}. ` +
        `Runtime uses client-gen (see src/lib/prismaClient.js). ` +
        `If other campaign models are present, postgres schema.prisma may be missing models that sqlite has. ` +
        `Run from apps/core/cardbey-core: ${schemaHint} then restart the server.`
    );
  }

  campaignModelsAsserted = true;
}

/**
 * Test database connection.
 * Returns { ok, latencyMs?, error?, reason?, dialect? }.
 */
export async function testDatabaseConnection() {
  const startTime = Date.now();

  if (!process.env.DATABASE_URL) {
    return {
      ok: false,
      error: 'env/DATABASE_URL',
      reason: 'DATABASE_URL environment variable is not set',
    };
  }

  try {
    const client = getPrismaClient();
    await ensurePrismaConnection();

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Database connection timeout (2s)')), 2000);
    });

    const queryPromise = client.$queryRaw`SELECT 1 as test`;

    await Promise.race([queryPromise, timeoutPromise]);

    const latencyMs = Date.now() - startTime;
    connectionTested = true;
    connectionError = null;

    const dbUrl = process.env.DATABASE_URL;
    let dialect = 'unknown';
    if (dbUrl.startsWith('file:') || dbUrl.includes('.db')) {
      dialect = 'sqlite';
    } else if (
      dbUrl.startsWith('postgresql://') ||
      dbUrl.startsWith('postgres://') ||
      dbUrl.startsWith('prisma://') ||
      dbUrl.startsWith('prisma+postgres://')
    ) {
      dialect = 'postgres';
    } else if (dbUrl.startsWith('mysql://')) {
      dialect = 'mysql';
    }

    return {
      ok: true,
      latencyMs,
      dialect,
    };
  } catch (error) {
    connectionError = error;
    const latencyMs = Date.now() - startTime;

    let reason = 'connection_failed';
    if (error.message?.includes('timeout')) {
      reason = 'timeout';
    } else if (error.name === 'PrismaClientInitializationError') {
      reason = 'initialization_error';
    } else if (error.name === 'PrismaClientKnownRequestError') {
      reason = 'query_error';
    }

    return {
      ok: false,
      latencyMs,
      error: reason,
      reason: error.message,
    };
  }
}

/** Optional schema sanity check. */
export async function checkSchemaSync() {
  try {
    const client = getPrismaClient();

    await client.$queryRaw`
      SELECT "primaryColor" FROM "Business" LIMIT 1
    `.catch(() => {
      throw new Error('Business.primaryColor column not found');
    });

    await client.$queryRaw`
      SELECT "id" FROM "StorePromo" LIMIT 1
    `.catch(() => {
      throw new Error('StorePromo table not found');
    });

    return { ok: true, message: 'Schema is in sync' };
  } catch (error) {
    return {
      ok: false,
      error: error.message,
      message: 'Database schema is out of sync with Prisma schema.',
    };
  }
}

/** Initialize and test database connection on startup. */
export async function initializeDatabase() {
  console.log('[DB] Initializing database connection...');

  const result = await testDatabaseConnection();

  if (result.ok) {
    const url = (process.env.DATABASE_URL || '').trim();
    const dbDisplay = url.toLowerCase().startsWith('postgres')
      ? 'postgresql (see DATABASE_URL in env)'
      : url || '(not set)';

    console.log(`[DB] ✅ Connected (${result.dialect}, ${result.latencyMs}ms) — using: ${dbDisplay}`);

    // Enable WAL mode for SQLite to reduce write contention (P1008 timeouts).
    // Use a brief direct sqlite handle: at this point getPrismaClient() may already be in use
    // (imports / bootstrap), so $executeRawUnsafe can hit "database is locked".
    if (result.dialect === 'sqlite') {
      try {
        const { resolveSqliteDatabasePath } = await import('./sqliteDbPath.js');
        const dbPath = resolveSqliteDatabasePath();
        if (dbPath) {
          const { DatabaseSync } = await import('node:sqlite');
          const sqlite = new DatabaseSync(dbPath);
          sqlite.exec('PRAGMA journal_mode=WAL;');
          sqlite.exec('PRAGMA synchronous=NORMAL;');
          sqlite.exec('PRAGMA cache_size=-64000;');
          sqlite.close();
          console.log('[DB] WAL mode enabled (SQLite contention fix)');
        }
      } catch (walErr) {
        console.warn('[DB] WAL pragma failed (non-fatal):', walErr?.message || walErr);
      }
    }

    if (process.env.NODE_ENV !== 'test' && !campaignModelsAsserted) {
      try {
        assertCampaignModels(getPrismaClient());
      } catch (err) {
        console.error('[DB] ❌', err.message);
        throw err;
      }
    }

    if (process.env.NODE_ENV !== 'test' && process.env.VITEST !== 'true') {
      const { verifyDatabaseSchemaAtStartup } = await import('./schemaDoctor.js');
      await verifyDatabaseSchemaAtStartup();
    }
  } else {
    console.error(`[DB] ❌ Connection failed: ${result.reason || result.error}`);
    if (result.error === 'env/DATABASE_URL') {
      console.error('[DB] 💡 Set DATABASE_URL in your .env file');
    }
  }

  return result;
}

/** Disconnect Prisma client for cleanup. */
export async function disconnectDatabase() {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
    connectPromise = null;
    connectionTested = false;
    connectionError = null;
  }
}

const client = getPrismaClient();

export default client;
export { client as prisma, PrismaClient };