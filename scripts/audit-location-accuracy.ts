#!/usr/bin/env node
/**
 * Audit store location accuracy (canonical vs demo fallbacks).
 *
 * Usage:
 *   pnpm audit:location-accuracy
 */

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promises as fs } from 'node:fs';
import {
  auditLocationAccuracyRow,
  formatLocationAuditReport,
} from './lib/location-accuracy-audit.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const CORE_ROOT = path.join(REPO_ROOT, 'apps', 'core', 'cardbey-core');

async function main() {
  const prismaPath = path.join(CORE_ROOT, 'src', 'lib', 'prisma.js');
  const { getPrismaClient } = await import(pathToFileURL(prismaPath).href);
  const prisma = getPrismaClient();

  const stores = await prisma.business.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      region: true,
      address: true,
      suburb: true,
      state: true,
      postcode: true,
      country: true,
    },
    orderBy: { name: 'asc' },
  });

  const audited = stores.map((s) => auditLocationAccuracyRow(s));
  const report = formatLocationAuditReport(audited);
  console.log(report);

  const reportDir = path.join(REPO_ROOT, 'docs', 'reports');
  await fs.mkdir(reportDir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const outPath = path.join(reportDir, `LOCATION_ACCURACY_AUDIT_${stamp}.md`);
  await fs.writeFile(outPath, report, 'utf8');
  console.log(`\nWrote ${outPath}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    process.exit(0);
  });
