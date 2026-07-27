#!/usr/bin/env node
/**
 * Repair business classification metadata (dry-run by default).
 *
 * Usage:
 *   pnpm repair:business-classification:dry-run
 *   CLASSIFICATION_REPAIR_CONFIRM=1 pnpm repair:business-classification -- --apply
 */

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promises as fs } from 'node:fs';
import {
  auditBusinessClassificationRow,
  formatClassificationAuditReport,
} from './lib/business-classification-audit.ts';
import { classifyBusinessVertical } from '../apps/core/cardbey-core/src/lib/classifyBusinessVertical.js';
import { extendedBusinessFieldsFromCommerce } from '../apps/core/cardbey-core/src/lib/dbCapabilities.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const CORE_ROOT = path.join(REPO_ROOT, 'apps', 'core', 'cardbey-core');

const apply = process.argv.includes('--apply');
const confirm = process.env.CLASSIFICATION_REPAIR_CONFIRM === '1';

async function main() {
  if (apply && !confirm) {
    console.error('Refusing --apply without CLASSIFICATION_REPAIR_CONFIRM=1');
    process.exit(1);
  }

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

  const audited = businesses.map((b) =>
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

  const repairTargets = audited.filter((r) => r.needsRepair);
  let repaired = 0;

  for (const target of repairTargets) {
    const business = businesses.find((b) => b.id === target.id);
    if (!business) continue;
    const classification = classifyBusinessVertical({
      businessType: business.type,
      businessName: business.name,
    });
    const settings =
      business.storefrontSettings && typeof business.storefrontSettings === 'object'
        ? { ...(business.storefrontSettings as Record<string, unknown>) }
        : {};
    const patch = {
      storefrontSettings: {
        ...settings,
        businessVertical: classification.businessVertical,
        commerceVerticalMode: classification.commerceMode,
        commerceMode: classification.legacyCommerceMode,
        cta: {
          ...(typeof settings.cta === 'object' && settings.cta ? settings.cta : {}),
          label: classification.ctaLabel,
        },
      },
      ...extendedBusinessFieldsFromCommerce({
        transactionMode: classification.transactionMode,
        catalogLabel: classification.catalogLabel,
        ctaLabel: classification.ctaLabel,
      }),
    };

    if (apply) {
      await prisma.business.update({
        where: { id: business.id },
        data: patch,
      });
      repaired++;
    }
  }

  const mode = apply ? 'APPLIED' : 'DRY RUN';
  const report = [
    formatClassificationAuditReport(audited),
    '',
    '## Repair',
    '',
    `Mode: **${mode}**`,
    `Candidates: ${repairTargets.length}`,
    `Repaired: ${repaired}`,
  ].join('\n');

  const reportDir = path.join(REPO_ROOT, 'docs', 'reports');
  await fs.mkdir(reportDir, { recursive: true });
  const reportPath = path.join(
    reportDir,
    apply ? 'BUSINESS_CLASSIFICATION_REPAIR.md' : 'BUSINESS_CLASSIFICATION_REPAIR_DRY_RUN.md',
  );
  await fs.writeFile(reportPath, report, 'utf8');
  console.log(report);
  console.log(`\nRepair report: ${reportPath}`);
}

main().catch((err) => {
  console.error('[repair-business-classification] failed:', err);
  process.exit(1);
});
