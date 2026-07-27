#!/usr/bin/env node
/**
 * Backfill thumbnailUrl (poster) for explore featured videos missing one.
 * Skips records that already have thumbnailUrl. Uses HEAD validation to skip dead assets.
 *
 * Usage (from apps/core/cardbey-core):
 *   node scripts/backfill-explore-video-posters.mjs
 *   node scripts/backfill-explore-video-posters.mjs --dry-run
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.chdir(path.join(__dirname, '..'));

await import('../src/env/loadEnv.js');

const {
  listExploreVideos,
  updateExploreVideo,
} = await import('../src/services/explore/exploreVideoService.js');
const { normalizeMediaUrlForStorage } = await import('../src/utils/publicUrl.js');
const { generateExploreVideoPosterFromUrl } = await import('../src/services/explore/exploreVideoPosterService.js');

const dryRun = process.argv.includes('--dry-run');

function section(title) {
  console.log(`\n=== ${title} ===`);
}

async function main() {
  section('Explore featured video poster backfill');
  console.log(`mode: ${dryRun ? 'dry-run' : 'write'}`);

  const rows = await listExploreVideos({ includeDraft: true });
  const missing = rows.filter((r) => !r.thumbnailUrl?.trim());
  console.log(`records: ${rows.length}, missing poster: ${missing.length}`);

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of missing) {
    const videoUrl = normalizeMediaUrlForStorage(row.videoUrl, null);
    if (!videoUrl?.trim()) {
      console.log(`- [${row.id}] skip — no videoUrl`);
      skipped += 1;
      continue;
    }

    if (dryRun) {
      console.log(`- [${row.id}] would generate poster for ${videoUrl}`);
      continue;
    }

    const poster = await generateExploreVideoPosterFromUrl(videoUrl, {
      durationSec: row.duration ?? null,
      context: 'backfill.explore.poster',
    });

    if (!poster.ok || !poster.url) {
      console.log(`- [${row.id}] failed — ${poster.error ?? 'unknown'}`);
      failed += 1;
      continue;
    }

    const thumbnailUrl = normalizeMediaUrlForStorage(poster.url, null);
    await updateExploreVideo(row.id, { thumbnailUrl }, null, true);
    updated += 1;
    console.log(`- [${row.id}] ok — ${thumbnailUrl}`);
  }

  section('Summary');
  console.log(`updated: ${updated}, skipped: ${skipped}, failed: ${failed}, already had poster: ${rows.length - missing.length}`);

  const reportPath = path.join(process.cwd(), '.cache', 'explore-video-poster-backfill.json');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        dryRun,
        total: rows.length,
        missing: missing.length,
        updated,
        skipped,
        failed,
      },
      null,
      2,
    ),
    'utf8',
  );
  console.log(`Wrote ${reportPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
