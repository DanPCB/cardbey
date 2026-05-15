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

function isPostgresUrl(url) {
  const u = String(url ?? '').trim().toLowerCase();
  return u.startsWith('postgresql://') || u.startsWith('postgres://');
}

function pickPostgresUrl() {
  const candidates = [
    ['POSTGRES_DATABASE_URL', process.env.POSTGRES_DATABASE_URL],
    ['DATABASE_URL', process.env.DATABASE_URL],
    ['POSTGRES_URL', process.env.POSTGRES_URL],
    ['POSTGRES_PRISMA_URL', process.env.POSTGRES_PRISMA_URL],
  ];
  for (const [name, value] of candidates) {
    if (isPostgresUrl(value)) return { url: String(value).trim(), source: name };
  }
  return { url: '', source: null };
}

const { url: postgresUrl, source } = pickPostgresUrl();
if (!postgresUrl) {
  const primary = String(process.env.DATABASE_URL ?? '').trim();
  console.error('[run-postgres-prisma] No Postgres URL found.');
  console.error('  Checked: POSTGRES_DATABASE_URL, DATABASE_URL, POSTGRES_URL, POSTGRES_PRISMA_URL');
  if (primary) {
    console.error('  DATABASE_URL is set but is not postgres (starts with):', primary.slice(0, 24));
    if (primary.toLowerCase().startsWith('file:')) {
      console.error('  → Render staging must use postgresql:// from the linked Postgres database, not file:');
    }
  } else {
    console.error('  DATABASE_URL is empty in this shell.');
  }
  console.error('');
  console.error('Fix (Render dashboard → cardbey-core-staging → Environment):');
  console.error('  Set DATABASE_URL to the Internal Database URL from your Render Postgres (Connect menu).');
  console.error('');
  console.error('One-off shell (paste Internal URL from dashboard):');
  console.error('  export DATABASE_URL="postgresql://..."');
  console.error('  node scripts/run-postgres-prisma.js migrate resolve --rolled-back 20260301000000_baseline_postgres');
  process.exit(1);
}

if (source && source !== 'DATABASE_URL') {
  console.log(`[run-postgres-prisma] Using ${source} as DATABASE_URL for this command`);
}

const args = process.argv.slice(2);
const prismaArgs = ['prisma', ...args, '--schema', 'prisma/postgres/schema.prisma'];
const env = { ...process.env, DATABASE_URL: postgresUrl };
const r = spawnSync('npx', prismaArgs, { env, stdio: 'inherit', shell: true });
process.exit(r.status ?? 1);
