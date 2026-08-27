#!/usr/bin/env node
/**
 * Rebuild PublishedArtifactProjection for a single store (slug or id).
 *
 * Default: DRY-RUN (prints what would be persisted; writes nothing).
 *
 * Apply (explicit confirmation required — public page impact):
 *   CARDBEY_CONFIRM_LIVE_REPAIR=1 node scripts/republish-one-store-projection.mjs --apply --slug=awe-financial
 *
 * Optional:
 *   --slug=awe-financial
 *   --store-id=cmsn1psxj006elcb3q9p2f79j
 */

import { createRequire } from 'node:module';
import { buildPublishedBusinessArtifact } from '../src/services/publishedArtifactProjection/buildPublishedBusinessArtifact.js';
import {
  persistPublishedBusinessArtifact,
  hasPublishedArtifactProjectionTable,
} from '../src/services/publishedArtifactProjection/persistPublishedBusinessArtifact.js';
import { validatePublishedBusinessArtifact } from '../src/services/publishedArtifactProjection/validatePublishedBusinessArtifact.js';

const require = createRequire(import.meta.url);

async function loadPrisma() {
  try {
    const mod = await import('../src/lib/prismaClient.js');
    if (typeof mod.getPrismaClient === 'function') return mod.getPrismaClient();
    if (mod.prisma) return mod.prisma;
    if (mod.default?.prisma) return mod.default.prisma;
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

const APPLY = process.argv.includes('--apply');
const CONFIRM = process.env.CARDBEY_CONFIRM_LIVE_REPAIR === '1';
const slugArg = process.argv.find((a) => a.startsWith('--slug='));
const idArg = process.argv.find((a) => a.startsWith('--store-id='));
const SLUG = slugArg ? slugArg.slice('--slug='.length).trim() : 'awe-financial';
const STORE_ID = idArg ? idArg.slice('--store-id='.length).trim() : null;

async function main() {
  console.log(
    `[republish-one-store] mode=${APPLY ? 'APPLY' : 'DRY-RUN'} slug=${SLUG} id=${STORE_ID || '(none)'}`,
  );

  if (APPLY && !CONFIRM) {
    console.error('Refusing --apply without CARDBEY_CONFIRM_LIVE_REPAIR=1 (safe-execution gate).');
    process.exit(2);
  }

  const prisma = await loadPrisma();

  if (!hasPublishedArtifactProjectionTable(prisma)) {
    console.error('Prisma client missing publishedArtifactProjection delegate.');
    process.exit(1);
  }

  const business = await prisma.business.findFirst({
    where: STORE_ID
      ? { OR: [{ id: STORE_ID }, { slug: SLUG }] }
      : { slug: SLUG },
    include: {
      products: { take: 200 },
    },
  });

  if (!business) {
    console.error('Business not found for', { SLUG, STORE_ID });
    process.exit(1);
  }

  const prefs =
    business.stylePreferences && typeof business.stylePreferences === 'object'
      ? business.stylePreferences
      : {};
  const mini = prefs.miniWebsite ?? prefs.website ?? null;
  const about = Array.isArray(mini?.sections)
    ? mini.sections.find((s) => s?.type === 'about')
    : null;
  const contact = Array.isArray(mini?.sections)
    ? mini.sections.find((s) => s?.type === 'contact')
    : null;

  console.log('Target:', {
    id: business.id,
    slug: business.slug,
    name: business.name,
    phone: business.phone,
    email: business.email,
    address: business.address,
    suburb: business.suburb,
    state: business.state,
    type: business.type,
    productCount: business.products?.length ?? 0,
    productNames: (business.products || []).slice(0, 12).map((p) => p.name),
    enrichmentGuard: prefs.enrichmentGuard ?? null,
    aboutBodyPreview:
      typeof about?.content?.body === 'string'
        ? about.content.body.slice(0, 120)
        : null,
    contactPreview: {
      phone: contact?.content?.phone ?? null,
      email: contact?.content?.email ?? null,
      address: contact?.content?.address ?? null,
    },
  });

  const projection = buildPublishedBusinessArtifact({
    business,
    source: 'republish_one_store_script',
  });
  const validation = validatePublishedBusinessArtifact(projection);
  projection.diagnostics = projection.diagnostics || {};
  projection.diagnostics.warnings = validation.warnings;

  console.log('Projection preview:', {
    slug: projection.slug,
    name: projection.name,
    phone: projection.phone ?? projection.contact?.phone,
    email: projection.email ?? projection.contact?.email,
    address: projection.address ?? projection.location?.formattedAddress,
    productCount: Array.isArray(projection.products) ? projection.products.length : null,
    warnings: validation.warnings,
  });

  if (!APPLY) {
    console.log(
      'Dry-run complete. Re-run with CARDBEY_CONFIRM_LIVE_REPAIR=1 --apply --slug=' +
        SLUG +
        ' to persist projection.',
    );
    await prisma.$disconnect?.();
    return;
  }

  const result = await persistPublishedBusinessArtifact(prisma, projection, {
    sourceDraftId: null,
    publishRunId: `republish-one-${Date.now()}`,
  });
  console.log('Persisted published projection:', {
    businessId: business.id,
    slug: business.slug,
    result: result && typeof result === 'object' ? Object.keys(result) : result,
  });
  console.log('Done. Verify https://cardbey.com/s/' + business.slug);
  await prisma.$disconnect?.();
}

main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
