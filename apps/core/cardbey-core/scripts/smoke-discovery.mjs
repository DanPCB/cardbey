/**
 * Discovery pipeline smoke test (direct lib call, no HTTP).
 * Usage: node scripts/smoke-discovery.mjs [--hashtag melbournecafe] [--db file:./prisma/smoke-discovery.db]
 */
const dbArg = (() => {
  const dbIdx = process.argv.indexOf('--db');
  return dbIdx >= 0 ? process.argv[dbIdx + 1] : null;
})();

const hashtag = process.argv.includes('--hashtag')
  ? process.argv[process.argv.indexOf('--hashtag') + 1]
  : 'melbournecafe';

await import('../src/env/ensureDatabaseUrl.js');
if (dbArg) {
  process.env.DATABASE_URL = dbArg.includes('?') ? dbArg : `${dbArg}?busy_timeout=30000`;
}
const { PrismaClient } = await import('../src/lib/prismaClient.js');
const DiscoveryConfigService = await import('../src/lib/discovery/DiscoveryConfigService.js');
const { runBatch } = await import('../src/lib/discovery/DiscoveryBatchRunner.js');

const prisma = new PrismaClient();

try {
  console.log('=== Discovery Pipeline Smoke Test ===');
  console.log(`DB: ${process.env.DATABASE_URL}`);
  console.log(`Hashtag: #${hashtag.replace(/^#/, '')}`);

  let seed = await prisma.discoverySeedSource.findFirst({
    where: { type: 'tiktok_hashtag', platform: 'tiktok', value: { contains: hashtag } },
  });

  if (!seed) {
    seed = await prisma.discoverySeedSource.create({
      data: {
        type: 'tiktok_hashtag',
        platform: 'tiktok',
        value: `#${hashtag.replace(/^#/, '')}`,
        location: 'Melbourne, VIC',
        category: 'cafe',
        priority: 99,
        isActive: true,
        batchLimit: 2,
      },
    });
    console.log('Created temp seed:', seed.id);
  } else {
    await prisma.discoverySeedSource.update({
      where: { id: seed.id },
      data: { isActive: true, batchLimit: 2 },
    });
    console.log('Using seed:', seed.id, seed.value);
  }

  await DiscoveryConfigService.updateConfig({
    enabled: true,
    batchSize: 2,
    concurrency: 1,
    delayMs: 500,
    maxRunsPerDay: 24,
    pausedUntil: null,
  }, 'smoke-test');

  const runnable = await DiscoveryConfigService.isRunnable();
  console.log('isRunnable:', runnable.ok ? 'YES' : runnable.reason);

  const t0 = Date.now();
  const summary = await runBatch(seed, 2, 'manual', 'smoke-test');
  const elapsed = Date.now() - t0;

  console.log('\n--- Batch Summary ---');
  console.log(JSON.stringify({
    status: summary.status,
    resolveStatus: summary.resolveStatus || null,
    discovered: summary.discovered,
    scraped: summary.scraped,
    created: summary.created,
    skipped: summary.skipped,
    failed: summary.failed,
    preBuilt: summary.preBuilt,
    elapsedMs: elapsed,
    batchId: summary.id,
  }, null, 2));

  const batch = await prisma.discoveryBatchRun.findUnique({ where: { id: summary.id } });
  console.log('\n--- DB Batch Record ---');
  console.log({
    triggeredBy: batch?.triggeredBy,
    configSnapshot: batch?.configSnapshot ? 'present' : 'missing',
    seedType: batch?.seedType,
    status: batch?.status,
  });

  const stores = await prisma.unclaimedStore.findMany({
    where: { discoveryBatch: summary.id },
    select: { id: true, businessName: true, sourceUrl: true, claimAuthority: true },
    take: 5,
  });
  console.log(`\n--- Unclaimed stores from batch: ${stores.length} ---`);
  for (const s of stores) {
    const ca = s.claimAuthority ? JSON.parse(s.claimAuthority) : null;
    console.log(`  ${s.businessName} | ${s.sourceUrl} | methods: ${ca?.methods?.join(',')}`);
  }

  console.log('\n=== Smoke test complete ===');
} catch (e) {
  console.error('SMOKE FAILED:', e?.message || e);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
