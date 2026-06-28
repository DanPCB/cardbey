#!/usr/bin/env node
/**
 * audit-duplicate-feed-stores
 *
 * Audits active published Business rows that would appear as duplicate organic
 * feed entries (same store identity). Optionally deactivates duplicate Business
 * rows — never deletes stores.
 *
 * Usage:
 *   node scripts/audit-duplicate-feed-stores.js
 *   node scripts/audit-duplicate-feed-stores.js --repair
 *   node scripts/audit-duplicate-feed-stores.js --dry-run
 */
import { PrismaClient } from '@prisma/client';
import {
  normalizePublicStoreIdentityKey,
} from '../src/services/publishedArtifactProjection/resolvePublicStoreList.js';

const prisma = new PrismaClient();

function parseArgs(argv) {
  return {
    repair: argv.includes('--repair'),
    dryRun: argv.includes('--dry-run') || !argv.includes('--repair'),
  };
}

function pickCanonicalBusiness(candidates) {
  if (candidates.length === 1) return candidates[0];
  const withoutAnd = candidates.find((b) => !String(b.slug ?? '').toLowerCase().includes('-and-'));
  if (withoutAnd) return withoutAnd;
  const withoutSuffix = candidates.find((b) => !/-\d+$/.test(String(b.slug ?? '')));
  if (withoutSuffix) return withoutSuffix;
  return candidates.sort((a, b) => {
    const aTime = a.publishedAt?.getTime?.() ?? a.updatedAt?.getTime?.() ?? 0;
    const bTime = b.publishedAt?.getTime?.() ?? b.updatedAt?.getTime?.() ?? 0;
    return bTime - aTime;
  })[0];
}

async function main() {
  const { repair, dryRun } = parseArgs(process.argv.slice(2));

  const active = await prisma.business.findMany({
    where: { isActive: true },
    orderBy: [{ publishedAt: 'desc' }, { updatedAt: 'desc' }],
    select: {
      id: true,
      name: true,
      slug: true,
      type: true,
      isActive: true,
      publishedAt: true,
      updatedAt: true,
      createdAt: true,
    },
  });

  const groups = new Map();
  for (const business of active) {
    const key = normalizePublicStoreIdentityKey(business);
    const list = groups.get(key) ?? [];
    list.push(business);
    groups.set(key, list);
  }

  const duplicateGroups = [...groups.entries()].filter(([, list]) => list.length > 1);

  console.log('[audit-duplicate-feed-stores] active published businesses:', active.length);
  console.log('[audit-duplicate-feed-stores] duplicate organic identity groups:', duplicateGroups.length);

  if (duplicateGroups.length === 0) {
    console.log('[audit-duplicate-feed-stores] no duplicate feed identities found.');
    return;
  }

  const repairs = [];

  for (const [identityKey, businesses] of duplicateGroups) {
    const canonical = pickCanonicalBusiness(businesses);
    const duplicates = businesses.filter((b) => b.id !== canonical.id);

    console.log('\n[DUPLICATE_GROUP]', {
      identityKey,
      canonical: {
        storeId: canonical.id,
        slug: canonical.slug,
        name: canonical.name,
        publishedAt: canonical.publishedAt?.toISOString?.() ?? null,
      },
      duplicates: duplicates.map((b) => ({
        storeId: b.id,
        slug: b.slug,
        name: b.name,
        publishedAt: b.publishedAt?.toISOString?.() ?? null,
      })),
    });

    for (const dup of duplicates) {
      repairs.push({ identityKey, canonicalId: canonical.id, duplicateId: dup.id });
    }
  }

  if (!repair) {
    console.log('\n[audit-duplicate-feed-stores] audit only. Re-run with --repair to deactivate duplicate Business rows.');
    return;
  }

  if (dryRun) {
    console.log('\n[audit-duplicate-feed-stores] dry-run — would deactivate', repairs.length, 'duplicate Business rows');
    return;
  }

  for (const { duplicateId, canonicalId, identityKey } of repairs) {
    await prisma.business.update({
      where: { id: duplicateId },
      data: { isActive: false },
    });
    console.log('[REPAIR]', { identityKey, deactivated: duplicateId, kept: canonicalId });
  }

  console.log('\n[audit-duplicate-feed-stores] repaired', repairs.length, 'duplicate feed identities.');
}

main()
  .catch((err) => {
    console.error('[audit-duplicate-feed-stores] failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
