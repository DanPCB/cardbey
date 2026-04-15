/**
 * Run a Prisma command against the Postgres schema.
 * Uses POSTGRES_DATABASE_URL for DATABASE_URL when set, so you can keep
 * DATABASE_URL=file:./prisma/test.db in .env for tests and set POSTGRES_DATABASE_URL
 * for postgres (e.g. postgresql://user:pass@localhost:5432/cardbey).
 *
 * Usage: node scripts/run-postgres-prisma.js <prisma-args...>
 * Example: node scripts/run-postgres-prisma.js migrate dev --name add_opportunity_source
 * Example: node scripts/run-postgres-prisma.js generate
 */

import { spawnSync } from 'child_process';

const postgresUrl = process.env.POSTGRES_DATABASE_URL || process.env.DATABASE_URL;
if (!postgresUrl || typeof postgresUrl !== 'string') {
  console.error('Set POSTGRES_DATABASE_URL or DATABASE_URL to a postgres URL, e.g.:');
  console.error('  POSTGRES_DATABASE_URL=postgresql://user:pass@localhost:5432/cardbey');
  process.exit(1);
}
if (!postgresUrl.startsWith('postgresql://') && !postgresUrl.startsWith('postgres://')) {
  console.error('DATABASE_URL must be a postgres URL (postgresql:// or postgres://) for this command.');
  console.error('Current value starts with:', postgresUrl.slice(0, 20) + '...');
  console.error('Use POSTGRES_DATABASE_URL=postgresql://... for this script.');
  process.exit(1);
}

const args = process.argv.slice(2);
const prismaArgs = ['prisma', ...args, '--schema', 'prisma/postgres/schema.prisma'];
const env = { ...process.env, DATABASE_URL: postgresUrl };
const r = spawnSync('npx', prismaArgs, { env, stdio: 'inherit', shell: true });
process.exit(r.status ?? 1);
