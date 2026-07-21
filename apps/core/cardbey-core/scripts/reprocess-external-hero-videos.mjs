/**
 * One-shot: ingest allowlisted external hero videos into durable Cardbey storage
 * and update PublishedArtifactProjection (public storefront SOT for hero video).
 *
 * Usage (production):
 *   cd apps/core/cardbey-core
 *   DATABASE_URL=... node scripts/reprocess-external-hero-videos.mjs --slug=ca-handyman-service
 */
import { prisma } from '../src/lib/prisma.js';
import {
  ensureDurableHeroVideo,
  needsDurableHeroVideoIngest,
} from '../src/lib/media/externalHeroVideoPlayback.js';

async function main() {
  const slugArg = process.argv.find((a) => a.startsWith('--slug='));
  const slug = slugArg ? slugArg.slice('--slug='.length).trim() : null;

  const projections = slug
    ? await prisma.publishedArtifactProjection.findMany({
        where: { slug },
        select: { id: true, businessId: true, slug: true, heroVideoUrl: true },
        take: 1,
      })
    : await prisma.publishedArtifactProjection.findMany({
        where: { heroVideoUrl: { contains: 'videos.pexels.com' } },
        select: { id: true, businessId: true, slug: true, heroVideoUrl: true },
        take: 50,
      });

  console.log(`[reprocess-external-hero] candidates=${projections.length}`);

  for (const row of projections) {
    const source =
      typeof row.heroVideoUrl === 'string' && needsDurableHeroVideoIngest(row.heroVideoUrl)
        ? row.heroVideoUrl
        : null;
    if (!source) {
      console.log(`[skip] ${row.slug} — no allowlisted external hero`);
      continue;
    }
    console.log(`[ingest] ${row.slug} ← ${source.slice(0, 120)}`);
    const durable = await ensureDurableHeroVideo(source, { prefix: 'hero-reprocess' });
    if (!durable?.publicPath) {
      console.warn(`[fail] ${row.slug} — ingest returned empty`);
      continue;
    }
    await prisma.publishedArtifactProjection.update({
      where: { id: row.id },
      data: {
        heroVideoUrl: durable.publicPath,
        heroMediaType: 'video',
      },
    });
    console.log(`[ok] ${row.slug} → ${durable.publicPath}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
  });
