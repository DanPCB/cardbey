#!/usr/bin/env node
/**
 * Audit business classification across live stores.
 * Usage: pnpm audit:business-classification
 */

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promises as fs } from 'node:fs';
import {
  auditBusinessClassificationRow,
  formatClassificationAuditReport,
} from './lib/business-classification-audit.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const CORE_ROOT = path.join(REPO_ROOT, 'apps', 'core', 'cardbey-core');

async function main() {
  const prismaPath = path.join(CORE_ROOT, 'src', 'lib', 'prisma.js');
  const { getPrismaClient } = await import(pathToFileURL(prismaPath).href);
  const prisma = getPrismaClient();

  const businesses = await prisma.business.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      slug: true,
      type: true,
      transactionMode: true,
      ctaLabel: true,
      catalogLabel: true,
      storefrontSettings: true,
    },
  });

  const rows = businesses.map((b) =>
    auditBusinessClassificationRow({
      id: b.id,
      name: b.name,
      slug: b.slug,
      type: b.type,
      transactionMode: b.transactionMode,
      ctaLabel: b.ctaLabel,
      catalogLabel: b.catalogLabel,
      storefrontSettings:
        b.storefrontSettings && typeof b.storefrontSettings === 'object'
          ? (b.storefrontSettings as Record<string, unknown>)
          : null,
    }),
  );

  const report = formatClassificationAuditReport(rows);
  const reportDir = path.join(REPO_ROOT, 'docs', 'reports');
  await fs.mkdir(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, 'BUSINESS_CLASSIFICATION_AUDIT.md');
  await fs.writeFile(reportPath, report, 'utf8');
  console.log(report);
  console.log(`\nAudit report: ${reportPath}`);
}

main().catch((err) => {
  console.error('[audit-business-classification] failed:', err);
  process.exit(1);
});
