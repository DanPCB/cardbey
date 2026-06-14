#!/usr/bin/env node
/**
 * Audit stores for fabricated vs canonical location labels.
 *
 * Usage:
 *   node scripts/audit-store-location-labels.mjs           # report only
 *   node scripts/audit-store-location-labels.mjs --apply     # clear region when no address
 */
import '../src/env/ensureDatabaseUrl.js';
import { PrismaClient } from '@prisma/client';
import { formatStoreLocation, hasCanonicalStoreAddress } from '../src/lib/formatStoreLocation.js';

const apply = process.argv.includes('--apply');
const prisma = new PrismaClient();

const MOCK_CITIES = new Set([
  'melbourne',
  'sydney',
  'ho chi minh city',
  'singapore',
  'austin',
]);

try {
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

  const suspicious = [];
  const missingAddress = [];

  for (const store of stores) {
    const canonical = formatStoreLocation(store);
    const hasAddress = hasCanonicalStoreAddress(store);
    const region = String(store.region ?? '').trim();

    if (!hasAddress && region) {
      suspicious.push({
        id: store.id,
        name: store.name,
        slug: store.slug,
        issue: 'region_without_address',
        region,
        canonical: null,
      });
    }

    if (!hasAddress) {
      missingAddress.push({ id: store.id, name: store.name, slug: store.slug });
    }

    if (region && canonical && region.toLowerCase() !== canonical.toLowerCase()) {
      suspicious.push({
        id: store.id,
        name: store.name,
        slug: store.slug,
        issue: 'region_mismatch',
        region,
        canonical,
      });
    }

    if (region && MOCK_CITIES.has(region.toLowerCase()) && !hasAddress) {
      suspicious.push({
        id: store.id,
        name: store.name,
        slug: store.slug,
        issue: 'likely_mock_city_in_region',
        region,
        canonical,
      });
    }
  }

  console.log('[audit-store-location]', {
    total: stores.length,
    missingAddress: missingAddress.length,
    suspicious: suspicious.length,
    apply,
  });

  if (suspicious.length) {
    console.log('\nSuspicious rows:');
    for (const row of suspicious) {
      console.log(JSON.stringify(row));
    }
  }

  if (apply && suspicious.some((r) => r.issue === 'region_without_address' || r.issue === 'likely_mock_city_in_region')) {
    const ids = [
      ...new Set(
        suspicious
          .filter((r) => r.issue === 'region_without_address' || r.issue === 'likely_mock_city_in_region')
          .map((r) => r.id),
      ),
    ];
    const result = await prisma.business.updateMany({
      where: { id: { in: ids }, address: null, suburb: null },
      data: { region: null },
    });
    console.log(`\n[apply] cleared region on ${result.count} store(s)`);
  } else if (apply) {
    console.log('\n[apply] nothing to clear');
  }
} finally {
  await prisma.$disconnect();
}
