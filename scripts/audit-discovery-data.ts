#!/usr/bin/env node
/**
 * Phase 1 — Discovery data audit (read-only).
 *
 * Usage (from repo root):
 *   pnpm audit:discovery
 *   pnpm audit:discovery -- --readiness
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  REPO_ROOT,
  buildAuditReport,
  ensureCoreEnv,
  formatAuditReportMarkdown,
  formatReadinessMarkdown,
  getCorePrisma,
  loadAuditContext,
  writeReportFile,
} from './lib/discovery-data-audit.ts';

const readiness = process.argv.includes('--readiness');

async function main() {
  await ensureCoreEnv();
  const prisma = await getCorePrisma();

  try {
    const ctx = await loadAuditContext(prisma);
    const report = buildAuditReport(ctx);
    const auditMd = formatAuditReportMarkdown(report);
    const auditPath = await writeReportFile('DISCOVERY_DATA_AUDIT', auditMd);

    console.log(`Audit report written: ${auditPath}`);
    console.log('');
    console.log(auditMd);

    if (readiness) {
      const readinessMd = formatReadinessMarkdown(report);
      const readinessPath = path.join(REPO_ROOT, 'docs', 'MELBOURNE_BATCH0_READINESS.md');
      await fs.mkdir(path.dirname(readinessPath), { recursive: true });
      await fs.writeFile(readinessPath, readinessMd, 'utf8');
      console.log(`\nReadiness report written: ${readinessPath}`);
    }

    console.log('\nClassification summary:');
    console.log(`  PRESERVE stores: ${report.summary.preserveStores}`);
    console.log(`  DELETE CANDIDATES stores: ${report.summary.deleteCandidateStores}`);
    console.log(`  REVIEW REQUIRED stores: ${report.summary.reviewStores}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('[audit-discovery-data] failed:', err);
  process.exit(1);
});
