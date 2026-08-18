/**
 * Static PostgreSQL readiness for Live Market migration (no deploy).
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const coreRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const schemaPath = path.join(coreRoot, 'prisma', 'postgres', 'schema.prisma');
const migrationPath = path.join(
  coreRoot,
  'prisma',
  'postgres',
  'migrations',
  '20260813120000_live_market_phase1_foundation',
  'migration.sql',
);
const prismaCli = path.join(coreRoot, 'node_modules', 'prisma', 'build', 'index.js');
const placeholderUrl = 'postgresql://cardbey_validate:cardbey_validate@127.0.0.1:5432/cardbey_validate';

const report = {
  schemaValid: false,
  migrationPresent: false,
  migrationContains: {},
  stagingDeploy: 'PENDING — no authorized Postgres environment used in this check',
  errors: [],
};

try {
  execFileSync(
    process.execPath,
    [prismaCli, 'validate', '--schema', 'prisma/postgres/schema.prisma'],
    {
      cwd: coreRoot,
      env: { ...process.env, DATABASE_URL: placeholderUrl },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  report.schemaValid = true;
} catch (err) {
  report.errors.push(err?.stderr?.toString?.() || err?.message || String(err));
}

if (fs.existsSync(migrationPath)) {
  report.migrationPresent = true;
  const sql = fs.readFileSync(migrationPath, 'utf8');
  for (const table of [
    'LiveMarketPilotEnrollment',
    'LiveMarketSession',
    'LiveMarketSessionSubject',
  ]) {
    report.migrationContains[table] = sql.includes(`"${table}"`);
  }
  report.migrationHasCascade = /ON DELETE CASCADE/i.test(sql);
} else {
  report.errors.push(`Missing migration SQL: ${migrationPath}`);
}

const schema = fs.readFileSync(schemaPath, 'utf8');
report.schemaDefinesModels = {
  LiveMarketPilotEnrollment: /model\s+LiveMarketPilotEnrollment\b/.test(schema),
  LiveMarketSession: /model\s+LiveMarketSession\b/.test(schema),
  LiveMarketSessionSubject: /model\s+LiveMarketSessionSubject\b/.test(schema),
};

const ok =
  report.schemaValid &&
  report.migrationPresent &&
  Object.values(report.migrationContains).every(Boolean) &&
  Object.values(report.schemaDefinesModels).every(Boolean);

console.log(JSON.stringify(report, null, 2));
process.exit(ok ? 0 : 1);
