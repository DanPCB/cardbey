#!/usr/bin/env node
/**
 * Repair store location metadata from canonical resolver (dry-run by default).
 *
 * Usage:
 *   pnpm repair:location-accuracy:dry-run
 *   LOCATION_REPAIR_CONFIRM=1 pnpm repair:location-accuracy -- --apply
 */

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promises as fs } from 'node:fs';
import {
  auditLocationAccuracyRow,
  formatLocationAuditReport,
} from './lib/location-accuracy-audit.ts';
import { logLocationRepairCandidate } from '../apps/core/cardbey-core/src/lib/location/resolveCanonicalBusinessLocation.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const CORE_ROOT = path.join(REPO_ROOT, 'apps', 'core', 'cardbey-core');

const apply = process.argv.includes('--apply');
const confirm = process.env.LOCATION_REPAIR_CONFIRM === '1';

async function main() {
  if (apply && !confirm) {
    console.error('Refusing --apply without LOCATION_REPAIR_CONFIRM=1');
    process.exit(1);
  }

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
      stylePreferences: true,
    },
    orderBy: { name: 'asc' },
  });

  const audited = stores.map((s) => auditLocationAccuracyRow(s));
  const repairTargets = audited.filter((r) => r.needsRepair && r.suggested);

  let repaired = 0;
  for (const target of repairTargets) {
    const business = stores.find((b) => b.id === target.id);
    if (!business || !target.suggested) continue;

    logLocationRepairCandidate({
      storeId: business.id,
      slug: business.slug,
      issue: target.issue,
      before: {
        region: business.region,
        suburb: business.suburb,
        state: business.state,
        country: business.country,
      },
      after: target.suggested,
    });

    if (apply) {
      const stylePreferences =
        business.stylePreferences && typeof business.stylePreferences === 'object'
          ? { ...(business.stylePreferences as Record<string, unknown>) }
          : {};
      await prisma.business.update({
        where: { id: business.id },
        data: {
          suburb: target.suggested.suburb,
          state: target.suggested.state,
          country: target.suggested.country,
          region:
            target.issue === 'demo_fallback_region' || target.issue === 'region_without_address'
              ? null
              : business.region,
          stylePreferences: {
            ...stylePreferences,
            needsLocationReview: false,
            locationRepairAt: new Date().toISOString(),
          },
        },
      });
      repaired++;
    }
  }

  const reviewTargets = audited.filter((r) => r.needsLocationReview);
  if (apply) {
    for (const target of reviewTargets) {
      const business = stores.find((b) => b.id === target.id);
      if (!business) continue;
      const stylePreferences =
        business.stylePreferences && typeof business.stylePreferences === 'object'
          ? { ...(business.stylePreferences as Record<string, unknown>) }
          : {};
      await prisma.business.update({
        where: { id: business.id },
        data: {
          stylePreferences: {
            ...stylePreferences,
            needsLocationReview: true,
          },
        },
      });
    }
  }

  const mode = apply ? 'APPLIED' : 'DRY RUN';
  const report = [
    formatLocationAuditReport(audited),
    '',
    '## Repair',
    '',
    `Mode: **${mode}**`,
    `Repair candidates: ${repairTargets.length}`,
    `Repaired: ${repaired}`,
    `Flagged needs_location_review: ${reviewTargets.length}`,
  ].join('\n');

  console.log(report);

  const reportDir = path.join(REPO_ROOT, 'docs', 'reports');
  await fs.mkdir(reportDir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const suffix = apply ? 'APPLIED' : 'DRY_RUN';
  const outPath = path.join(reportDir, `LOCATION_ACCURACY_REPAIR_${suffix}_${stamp}.md`);
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
