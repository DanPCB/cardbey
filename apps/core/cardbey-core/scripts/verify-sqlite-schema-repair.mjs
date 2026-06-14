#!/usr/bin/env node
/**
 * Verify local SQLite schema repairs for publish/PIL/loyalty/docs paths.
 */
import '../src/env/ensureDatabaseUrl.js';
import { getPrismaClient } from '../src/lib/prisma.js';
import { recordPilEvent } from '../src/services/pilEventsService.js';
import { persistPublishedBusinessArtifact } from '../src/services/publishedArtifactProjection/persistPublishedBusinessArtifact.js';

async function main() {
  const prisma = getPrismaClient();
  const checks = [];

  const productCols = await prisma.$queryRawUnsafe('PRAGMA table_info("Product")');
  const hasFeatured = productCols.some((c) => c.name === 'isFeatured');
  checks.push({ name: 'Product.isFeatured', ok: hasFeatured });

  const projectionCols = await prisma.$queryRawUnsafe('PRAGMA table_info("PublishedArtifactProjection")');
  checks.push({ name: 'PublishedArtifactProjection.heroVideoUrl', ok: projectionCols.some((c) => c.name === 'heroVideoUrl') });
  checks.push({ name: 'PublishedArtifactProjection.heroMediaType', ok: projectionCols.some((c) => c.name === 'heroMediaType') });

  const tables = await prisma.$queryRawUnsafe(
    "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('PilEvent','LoyaltyProgramStamp','SmartDocument','LoyaltyStamp','DocumentPromoRedemption')",
  );
  const tableSet = new Set(tables.map((t) => t.name));
  for (const t of ['PilEvent', 'LoyaltyProgramStamp', 'SmartDocument', 'LoyaltyStamp', 'DocumentPromoRedemption']) {
    checks.push({ name: `table:${t}`, ok: tableSet.has(t) });
  }

  const loyaltyStampCols = await prisma.$queryRawUnsafe('PRAGMA table_info("LoyaltyStamp")');
  checks.push({
    name: 'LoyaltyStamp.doc-scoped',
    ok: loyaltyStampCols.some((c) => c.name === 'docId') && loyaltyStampCols.some((c) => c.name === 'visitorId'),
  });

  let userId = null;
  let businessId = null;
  try {
    const user = await prisma.user.create({
      data: {
        email: `schema-verify-${Date.now()}@test.local`,
        passwordHash: 'test',
        displayName: 'Schema Verify',
        roles: '["owner"]',
        role: 'owner',
      },
    });
    userId = user.id;
    const business = await prisma.business.create({
      data: {
        userId,
        slug: `schema-verify-${Date.now()}`,
        name: 'Schema Verify Store',
        type: 'cafe',
        isActive: true,
      },
    });
    businessId = business.id;

    const created = await prisma.product.createMany({
      data: [
        {
          businessId,
          name: 'Verify Latte',
          price: 5,
          isPublished: true,
          isFeatured: false,
        },
      ],
    });
    checks.push({ name: 'product.createMany', ok: created.count === 1 });

    const pil = await recordPilEvent({ type: 'attention_signal', userId, metadata: { surface: 'verify' } });
    checks.push({ name: 'pilEvent.create', ok: pil.persisted === true && Boolean(pil.id) });

    await prisma.loyaltyProgram.findMany({
      where: { storeId: businessId },
      include: { _count: { select: { stamps: true } } },
      take: 1,
    });
    checks.push({ name: 'loyaltyProgram.findMany+stamps', ok: true });

    await prisma.smartDocument.findMany({
      where: { userId },
      take: 1,
      select: {
        id: true,
        _count: { select: { stamps: true, redemptions: true, rsvps: true, conversations: true, checkIns: true } },
      },
    });
    checks.push({ name: 'smartDocument.findMany', ok: true });

    await persistPublishedBusinessArtifact(
      prisma,
      {
        artifactType: 'business',
        businessId,
        tenantId: userId,
        storeId: businessId,
        slug: business.slug,
        artifactVersion: 'v1',
        hero: { videoUrl: 'https://example.com/hero.mp4' },
        diagnostics: {},
      },
      { sourceDraftId: null, publishRunId: null },
    );
    checks.push({ name: 'publishedArtifactProjection.upsert', ok: true });
  } finally {
    if (businessId) {
      await prisma.publishedArtifactProjection.deleteMany({ where: { businessId } }).catch(() => {});
      await prisma.product.deleteMany({ where: { businessId } }).catch(() => {});
      await prisma.business.delete({ where: { id: businessId } }).catch(() => {});
    }
    if (userId) await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    await prisma.$disconnect().catch(() => {});
  }

  const failed = checks.filter((c) => !c.ok);
  console.log('[verify-sqlite-schema-repair]', { checks, failed: failed.map((f) => f.name) });
  process.exitCode = failed.length === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error('[verify-sqlite-schema-repair] FAIL', err?.message ?? err);
  process.exitCode = 1;
});
