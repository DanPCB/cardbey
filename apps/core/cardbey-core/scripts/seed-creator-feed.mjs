#!/usr/bin/env node
/**
 * Seed a small public Creator Showcase set (Track A).
 *
 * Default: DRY-RUN (prints planned rows; writes nothing).
 *
 * Apply (explicit confirmation — mutates staging/live DB):
 *   CARDBEY_CONFIRM_LIVE_REPAIR=1 node scripts/seed-creator-feed.mjs --apply
 *
 * Gate (must both be set or showcase stays empty):
 *   CreatorContent.status = 'published'
 *   CreatorContent.visibility = 'public'
 *
 * Types: VIDEO | ARTICLE | LIVESTREAM | CREATOR_SERVICE | DIGITAL_PRODUCT
 */

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const APPLY = process.argv.includes('--apply');
const CONFIRM = process.env.CARDBEY_CONFIRM_LIVE_REPAIR === '1';
const USERNAME = 'cardbey_showcase';

const SEED_CONTENTS = [
  {
    type: 'VIDEO',
    title: 'Welcome to Cardbey Creators',
    description: 'A short intro to publishing original video on Cardbey.',
    durationSeconds: 90,
    categories: ['technology'],
  },
  {
    type: 'ARTICLE',
    title: 'How local businesses grow with Cardbey',
    description: 'Practical tips for Footscray and Melbourne small businesses.',
    durationSeconds: null,
    categories: ['business'],
  },
  {
    type: 'ARTICLE',
    title: 'Creator Studio in 5 minutes',
    description: 'Draft, review, and publish your first article or video.',
    durationSeconds: null,
    categories: ['education'],
  },
  {
    type: 'CREATOR_SERVICE',
    title: 'Brand story consultation',
    description: 'Book a session to shape your Cardbey store and creator presence.',
    durationSeconds: null,
    categories: ['business'],
  },
  {
    type: 'LIVESTREAM',
    title: 'Live: marketplace discovery tips',
    description: 'Join a live walkthrough of Creators and Marketplace.',
    durationSeconds: 1800,
    categories: ['business', 'technology'],
  },
];

async function loadPrisma() {
  try {
    const mod = await import('../src/lib/prismaClient.js');
    if (typeof mod.getPrismaClient === 'function') return mod.getPrismaClient();
    if (mod.prisma) return mod.prisma;
  } catch {
    /* fall through */
  }
  try {
    const { PrismaClient } = require('../node_modules/.prisma/client-gen');
    return new PrismaClient();
  } catch {
    /* fall through */
  }
  const { PrismaClient } = require('@prisma/client');
  return new PrismaClient();
}

async function main() {
  console.log(`[seed-creator-feed] mode=${APPLY ? 'APPLY' : 'DRY-RUN'} username=${USERNAME}`);

  if (APPLY && !CONFIRM) {
    console.error('Refusing --apply without CARDBEY_CONFIRM_LIVE_REPAIR=1');
    process.exit(2);
  }

  const prisma = await loadPrisma();

  const existingCreator = await prisma.creator.findFirst({
    where: { username: USERNAME },
    select: { id: true, userId: true, username: true, categories: true, creatorStatus: true },
  });

  console.log('Gate: CreatorContent must have status=published AND visibility=public');
  console.log('Existing showcase creator:', existingCreator ?? '(none)');
  console.log(
    'Planned contents:',
    SEED_CONTENTS.map((c) => `${c.type}:${c.title} cats=[${c.categories.join(',')}]`),
  );

  if (!APPLY) {
    console.log('Dry-run complete. Re-run with CARDBEY_CONFIRM_LIVE_REPAIR=1 --apply to write.');
    await prisma.$disconnect?.();
    return;
  }

  let creator = existingCreator;
  if (!creator) {
    const user =
      (await prisma.user.findFirst({
        where: { email: { contains: 'admin' } },
        select: { id: true, email: true },
        orderBy: { createdAt: 'asc' },
      })) ||
      (await prisma.user.findFirst({ select: { id: true, email: true }, orderBy: { createdAt: 'asc' } }));

    if (!user) {
      console.error('No User row available to attach Creator profile.');
      process.exit(1);
    }

    const already = await prisma.creator.findUnique({
      where: { userId: user.id },
      select: { id: true, username: true },
    });
    if (already) {
      creator = await prisma.creator.update({
        where: { id: already.id },
        data: {
          username: USERNAME,
          displayName: 'Cardbey Showcase',
          bio: 'Official Cardbey creator showcase seed profile.',
          categories: ['business', 'technology', 'education'],
          creatorStatus: 'active',
          isQualified: true,
          country: 'AU',
        },
      });
      console.log('Updated existing creator for user', user.email, '→', creator.id);
    } else {
      creator = await prisma.creator.create({
        data: {
          userId: user.id,
          username: USERNAME,
          displayName: 'Cardbey Showcase',
          bio: 'Official Cardbey creator showcase seed profile.',
          categories: ['business', 'technology', 'education'],
          creatorStatus: 'active',
          isQualified: true,
          country: 'AU',
          totalViews: 100,
        },
      });
      console.log('Created creator', creator.id, 'for user', user.email);
    }
  } else {
    creator = await prisma.creator.update({
      where: { id: creator.id },
      data: {
        creatorStatus: 'active',
        categories: ['business', 'technology', 'education'],
        isQualified: true,
        displayName: creator.displayName || 'Cardbey Showcase',
      },
    });
  }

  const now = Date.now();
  let created = 0;
  for (let i = 0; i < SEED_CONTENTS.length; i++) {
    const item = SEED_CONTENTS[i];
    const title = item.title;
    const existing = await prisma.creatorContent.findFirst({
      where: { creatorId: creator.id, title },
      select: { id: true, status: true, visibility: true, type: true },
    });
    if (existing) {
      await prisma.creatorContent.update({
        where: { id: existing.id },
        data: {
          type: item.type,
          description: item.description,
          status: 'published',
          visibility: 'public',
          publishedAt: new Date(now - i * 60_000),
          durationSeconds: item.durationSeconds,
          language: 'en',
        },
      });
      console.log('Updated content', existing.id, title);
    } else {
      const row = await prisma.creatorContent.create({
        data: {
          creatorId: creator.id,
          type: item.type,
          title,
          description: item.description,
          language: 'en',
          durationSeconds: item.durationSeconds,
          status: 'published',
          visibility: 'public',
          publishedAt: new Date(now - i * 60_000),
          thumbnail: null,
          mediaUrl: null,
          views: 10 + i,
          likes: i,
        },
      });
      console.log('Created content', row.id, title);
      created++;
    }
  }

  const count = await prisma.creatorContent.count({
    where: { creatorId: creator.id, status: 'published', visibility: 'public' },
  });
  console.log('Published public content for creator:', count, '(new this run:', created, ')');
  console.log('Verify: GET /api/creators/showcase  and  ?type=services  and  ?category=business');
  await prisma.$disconnect?.();
}

main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
