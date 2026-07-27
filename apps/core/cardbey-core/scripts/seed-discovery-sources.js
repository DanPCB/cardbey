/**
 * Idempotent bootstrap for DiscoverySeedSource records (Melbourne SME targets).
 * Safe to re-run — skips existing platform+value pairs, never deletes.
 *
 * Usage: npm run seed:discovery
 */

import '../src/env/ensureDatabaseUrl.js';
import { PrismaClient } from '../src/lib/prismaClient.js';

const prisma = new PrismaClient();

const SEED_SOURCES = [
  // ── TikTok hashtags ──
  // Food & cafe
  {
    type: 'tiktok_hashtag',
    platform: 'tiktok',
    value: '#melbournecafe',
    location: 'Melbourne, VIC',
    category: 'cafe',
    priority: 10,
  },
  {
    type: 'tiktok_hashtag',
    platform: 'tiktok',
    value: '#melbournefood',
    location: 'Melbourne, VIC',
    category: 'food',
    priority: 9,
  },
  {
    type: 'tiktok_hashtag',
    platform: 'tiktok',
    value: '#melbournerestaurant',
    location: 'Melbourne, VIC',
    category: 'restaurant',
    priority: 8,
  },

  // Beauty & wellness
  {
    type: 'tiktok_hashtag',
    platform: 'tiktok',
    value: '#melbournebeauty',
    location: 'Melbourne, VIC',
    category: 'beauty',
    priority: 8,
  },
  {
    type: 'tiktok_hashtag',
    platform: 'tiktok',
    value: '#melbournenails',
    location: 'Melbourne, VIC',
    category: 'beauty',
    priority: 7,
  },
  {
    type: 'tiktok_hashtag',
    platform: 'tiktok',
    value: '#melbournehair',
    location: 'Melbourne, VIC',
    category: 'beauty',
    priority: 7,
  },

  // Travel & experiences
  {
    type: 'tiktok_hashtag',
    platform: 'tiktok',
    value: '#melbournetravel',
    location: 'Melbourne, VIC',
    category: 'travel',
    priority: 9,
  },
  {
    type: 'tiktok_hashtag',
    platform: 'tiktok',
    value: '#visitmelbourne',
    location: 'Melbourne, VIC',
    category: 'travel',
    priority: 8,
  },

  // Fitness & wellness
  {
    type: 'tiktok_hashtag',
    platform: 'tiktok',
    value: '#melbournefitness',
    location: 'Melbourne, VIC',
    category: 'fitness',
    priority: 6,
  },
  {
    type: 'tiktok_hashtag',
    platform: 'tiktok',
    value: '#melbourneyoga',
    location: 'Melbourne, VIC',
    category: 'wellness',
    priority: 5,
  },

  // Retail & fashion
  {
    type: 'tiktok_hashtag',
    platform: 'tiktok',
    value: '#melbournefashion',
    location: 'Melbourne, VIC',
    category: 'retail',
    priority: 6,
  },
  {
    type: 'tiktok_hashtag',
    platform: 'tiktok',
    value: '#melbourneshopping',
    location: 'Melbourne, VIC',
    category: 'retail',
    priority: 5,
  },

  // ── Google Maps search queries ──
  // (stubs for when GoogleMapsSource.js is implemented)
  {
    type: 'google_maps',
    platform: 'google',
    value: 'cafes Richmond VIC',
    location: 'Richmond, VIC',
    category: 'cafe',
    priority: 7,
    isActive: false,
  },
  {
    type: 'google_maps',
    platform: 'google',
    value: 'hair salon Fitzroy Melbourne',
    location: 'Fitzroy, VIC',
    category: 'beauty',
    priority: 6,
    isActive: false,
  },
  {
    type: 'google_maps',
    platform: 'google',
    value: 'travel agency Melbourne CBD',
    location: 'Melbourne CBD, VIC',
    category: 'travel',
    priority: 7,
    isActive: false,
  },
  {
    type: 'google_maps',
    platform: 'google',
    value: 'restaurants Southbank Melbourne',
    location: 'Southbank, VIC',
    category: 'restaurant',
    priority: 6,
    isActive: false,
  },

  // ── URL list — AA Travel pilot (explicit seed) ──
  {
    type: 'url_list',
    platform: 'tiktok',
    value: JSON.stringify(['https://www.tiktok.com/@aatravelandgolftour']),
    location: 'Melbourne, VIC',
    category: 'travel',
    priority: 10,
  },

  // ── Direct website seeds ──
  {
    type: 'web_crawl',
    platform: 'website',
    value: JSON.stringify(['https://www.aatravelandgolftour.com.au']),
    location: 'Melbourne, VIC',
    category: 'travel',
    priority: 10,
  },

  // ── Directory crawl seeds (inactive until verified) ──
  {
    type: 'directory_crawl',
    platform: 'website',
    value: 'https://www.yellowpages.com.au/search/list?clue=cafe&state=VIC&suburb=melbourne',
    location: 'Melbourne, VIC',
    category: 'cafe',
    priority: 6,
    isActive: false,
  },
  {
    type: 'directory_crawl',
    platform: 'website',
    value: 'https://www.truelocal.com.au/find/beauty-salons/melbourne-vic',
    location: 'Melbourne, VIC',
    category: 'beauty',
    priority: 5,
    isActive: false,
  },
  {
    type: 'directory_crawl',
    platform: 'website',
    value: 'https://www.truelocal.com.au/find/travel-agents/melbourne-vic',
    location: 'Melbourne, VIC',
    category: 'travel',
    priority: 6,
    isActive: false,
  },
];

async function main() {
  console.log('=== Discovery Seed Bootstrap ===');

  let created = 0;
  let skipped = 0;

  for (const entry of SEED_SOURCES) {
    const existing = await prisma.discoverySeedSource.findFirst({
      where: { platform: entry.platform, value: entry.value },
    });

    if (existing) {
      console.log(`  [skip] ${entry.platform} ${entry.value}`);
      skipped += 1;
      continue;
    }

    await prisma.discoverySeedSource.create({
      data: {
        type: entry.type,
        platform: entry.platform,
        value: entry.value,
        location: entry.location ?? null,
        category: entry.category ?? null,
        priority: entry.priority ?? 0,
        isActive: entry.isActive ?? true,
        batchLimit: entry.batchLimit ?? null,
        runCount: 0,
        errorCount: 0,
      },
    });

    console.log(`  [created] ${entry.platform} ${entry.value}`);
    created += 1;
  }

  console.log(`Created ${created}, skipped ${skipped}`);
  console.log('--- google_maps sources created as isActive:false');
  console.log('    Activate after GoogleMapsSource.js is implemented');
  console.log('--- directory_crawl sources created as isActive:false');
  console.log('    Activate after manual test: POST /api/discovery/run');
  console.log('    with a single directory seed enabled');
}

main()
  .catch((err) => {
    console.error('[seed-discovery] failed:', err?.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
