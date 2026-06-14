#!/usr/bin/env node
/**
 * Scan explore featured video records for broken or non-canonical URLs.
 *
 * Checks:
 *   - relative /uploads paths (OK when file exists on disk)
 *   - stale absolute loopback/LAN URLs → normalize to relative
 *   - provider temp URLs (Kling delivery hosts)
 *   - HEAD probe failures / text/html responses
 *
 * Usage (from apps/core/cardbey-core):
 *   node scripts/backfill-explore-video-urls.mjs
 *   node scripts/backfill-explore-video-urls.mjs --fix-relative
 *   node scripts/backfill-explore-video-urls.mjs --dry-run
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
const {
  isProviderTempVideoUrl,
  validateExploreVideoPublishUrl,
} = await import('../src/services/explore/exploreVideoUrlValidation.js');

const args = new Set(process.argv.slice(2));
const fixRelative = args.has('--fix-relative');
const dryRun = args.has('--dry-run') || !fixRelative;

function section(title) {
  console.log(`\n=== ${title} ===`);
}

async function main() {
  section('Explore featured video URL audit');
  console.log(`mode: ${fixRelative && !args.has('--dry-run') ? 'fix-relative' : 'report-only'}`);
  if (dryRun && fixRelative) console.log('(dry-run — pass --fix-relative without --dry-run to write)');

  const rows = await listExploreVideos({ includeDraft: true });
  console.log(`records: ${rows.length}`);

  const issues = [];
  let fixed = 0;

  for (const row of rows) {
    const problems = [];
    const raw = row.videoUrl?.trim() ?? '';

    if (!raw) {
      problems.push('missing_url');
    } else if (isProviderTempVideoUrl(raw)) {
      problems.push('provider_temp_url');
    }

    const normalized = normalizeMediaUrlForStorage(raw, null);
    if (normalized && normalized !== raw) {
      problems.push(`normalize:${raw} -> ${normalized}`);
      if (fixRelative && !dryRun) {
        await updateExploreVideo(row.id, { videoUrl: normalized }, null, true);
        fixed += 1;
        row.videoUrl = normalized;
      }
    }

    const validation = await validateExploreVideoPublishUrl(row.videoUrl, { enforceOutputValidation: true });
    if (!validation.ok) {
      problems.push(`${validation.code}:${validation.message}`);
    }

    if (problems.length) {
      issues.push({
        id: row.id,
        title: row.title,
        status: row.status,
        videoUrl: row.videoUrl,
        problems,
      });
    }
  }

  section('Summary');
  console.log(`flagged: ${issues.length}`);
  console.log(`normalized (written): ${fixed}`);

  if (issues.length) {
    section('Flagged records');
    for (const item of issues) {
      console.log(`- [${item.id}] ${item.title} (${item.status})`);
      console.log(`  url: ${item.videoUrl}`);
      for (const p of item.problems) console.log(`  • ${p}`);
    }
  } else {
    console.log('All explore video URLs passed checks.');
  }

  const reportPath = path.join(process.cwd(), '.cache', 'explore-video-url-audit.json');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(
    reportPath,
    JSON.stringify({ generatedAt: new Date().toISOString(), issues, fixed }, null, 2),
    'utf8',
  );
  console.log(`\nWrote ${reportPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
