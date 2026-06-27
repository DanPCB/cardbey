#!/usr/bin/env node
/**
 * Consolidated database schema health report.
 * Usage: npm run schema:doctor
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);

await import('../src/env/loadEnv.js');
await import('../src/env/ensureDatabaseUrl.js');

const { PrismaClient } = await import('@prisma/client');
const { runSchemaDoctor, formatSchemaDoctorReport } = await import('../src/lib/schemaDoctor.js');

const prisma = new PrismaClient();
let exitCode = 0;

try {
  const report = await runSchemaDoctor({
    prisma,
    includeOptionalDraftStoreColumns:
      process.env.PUBLISH_SNAPSHOT_V1 === 'true' || process.env.PUBLISH_SNAPSHOT_V1 === '1',
  });
  console.log(formatSchemaDoctorReport(report));
  if (!report.ok) exitCode = 1;
} catch (err) {
  console.error('[schema:doctor] ERROR:', err?.message || err);
  exitCode = 1;
} finally {
  await prisma.$disconnect().catch(() => {});
}

process.exit(exitCode);
