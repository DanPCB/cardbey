/**
 * One-time backfill: create Safari-safe *.ios.mp4 siblings for existing hero videos.
 *
 * Usage (from apps/core/cardbey-core):
 *   node scripts/backfill-ios-video-derivatives.mjs              # dry-run (default)
 *   node scripts/backfill-ios-video-derivatives.mjs --apply       # transcode missing siblings
 *   node scripts/backfill-ios-video-derivatives.mjs --apply --force  # overwrite existing .ios.mp4
 *   node scripts/backfill-ios-video-derivatives.mjs --slug=my-bakery --apply
 */
import '../src/env/ensureDatabaseUrl.js';
import { getPrismaClient } from '../src/db/prisma.js';
import {
  backfillIosSafeVideoForPublicPath,
  collectHeroVideoMp4PublicPaths,
  iosSafeSiblingExists,
  logIosVideoBackfill,
} from '../src/lib/videoIosSafe.js';

const apply = process.argv.includes('--apply');
const force = process.argv.includes('--force');
const dryRun = !apply;
const slugArg = process.argv.find((a) => a.startsWith('--slug='));
const slugFilter = slugArg ? slugArg.slice('--slug='.length).trim().toLowerCase() : null;

async function main() {
  const prisma = getPrismaClient();
  const uploadsDir = process.env.UPLOADS_DIR;

  console.log('[IOS_VIDEO_BACKFILL] start', {
    mode: dryRun ? 'dry_run' : 'apply',
    force,
    slugFilter,
    uploadsDir: uploadsDir ?? '(default uploads/media)',
  });

  let candidates = await collectHeroVideoMp4PublicPaths(prisma);

  if (slugFilter) {
    candidates = candidates.filter((c) =>
      c.refs.some((r) => r.toLowerCase().includes(slugFilter)),
    );
  }

  console.log('[IOS_VIDEO_BACKFILL] candidates', { count: candidates.length });

  const summary = {
    scanned: candidates.length,
    created: 0,
    skipped_exists: 0,
    skipped_not_local_mp4: 0,
    source_missing: 0,
    dry_run_would_create: 0,
    error: 0,
  };

  for (const { source, refs } of candidates) {
    if (!force && iosSafeSiblingExists(source, uploadsDir)) {
      logIosVideoBackfill({
        source,
        output: source.replace(/\.mp4$/i, '.ios.mp4'),
        status: 'skipped_exists',
        error: null,
      });
      summary.skipped_exists += 1;
      continue;
    }

    console.log('[IOS_VIDEO_BACKFILL] processing', { source, refs });
    const result = await backfillIosSafeVideoForPublicPath(source, {
      force,
      dryRun,
      uploadsDir,
    });
    const key = result.status in summary ? result.status : 'error';
    summary[key] = (summary[key] ?? 0) + 1;
    if (result.created) summary.created += 1;
  }

  console.log('[IOS_VIDEO_BACKFILL] complete', summary);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('[IOS_VIDEO_BACKFILL] fatal', err);
  process.exit(1);
});
