/**
 * One-time repair: backfill tenantId from Business.userId (store owner) on related rows.
 *
 * Usage (from apps/core/cardbey-core):
 *   node scripts/backfill-store-tenant-id.mjs <storeId>           # dry-run (default)
 *   node scripts/backfill-store-tenant-id.mjs <storeId> --apply
 *
 * Example:
 *   node scripts/backfill-store-tenant-id.mjs cmp65pbkc00gijv90g7svvpg5 --apply
 */
import '../src/env/ensureDatabaseUrl.js';
import { getPrismaClient } from '../src/db/prisma.js';

const storeId = process.argv[2]?.trim();
const apply = process.argv.includes('--apply');

if (!storeId) {
  console.error('Usage: node scripts/backfill-store-tenant-id.mjs <storeId> [--apply]');
  process.exit(1);
}

const prisma = getPrismaClient();

function isBadTenant(value) {
  if (value == null) return true;
  const s = String(value).trim();
  return !s || s === 'missing';
}

function patchDraftInput(input, ownerUserId) {
  const base = input && typeof input === 'object' && !Array.isArray(input) ? { ...input } : {};
  return { ...base, tenantId: ownerUserId };
}

async function main() {
  const business = await prisma.business.findUnique({
    where: { id: storeId },
    select: {
      id: true,
      name: true,
      slug: true,
      userId: true,
      user: { select: { id: true, email: true, displayName: true } },
    },
  });

  if (!business) {
    console.error(`Store not found: ${storeId}`);
    process.exit(1);
  }

  const ownerUserId = business.userId?.trim() || null;
  if (!ownerUserId) {
    console.error(`Store ${storeId} has no userId on Business row — cannot backfill.`);
    process.exit(1);
  }

  console.log('=== Store tenant diagnosis ===');
  console.log({
    storeId: business.id,
    storeName: business.name,
    slug: business.slug,
    ownerUserId,
    ownerEmail: business.user?.email ?? null,
    mode: apply ? 'APPLY' : 'DRY_RUN',
  });

  const drafts = await prisma.draftStore.findMany({
    where: { committedStoreId: storeId },
    select: { id: true, ownerUserId: true, committedUserId: true, input: true, status: true },
  });

  const draftUpdates = [];
  for (const d of drafts) {
    const input = d.input && typeof d.input === 'object' && !Array.isArray(d.input) ? d.input : {};
    const inputTenant = input.tenantId;
    const needsInput = isBadTenant(inputTenant) || String(inputTenant) !== ownerUserId;
    const needsOwner = d.ownerUserId == null || String(d.ownerUserId) !== ownerUserId;
    const needsCommittedUser = isBadTenant(d.committedUserId) || String(d.committedUserId ?? '') !== ownerUserId;
    if (needsInput || needsOwner || needsCommittedUser) {
      draftUpdates.push({
        id: d.id,
        status: d.status,
        before: { inputTenant, ownerUserId: d.ownerUserId, committedUserId: d.committedUserId },
        needsInput,
        needsOwner,
        needsCommittedUser,
      });
    }
  }

  const pipelines = await prisma.missionPipeline.findMany({
    where: { targetType: 'store', targetId: storeId },
    select: { id: true, tenantId: true, title: true, status: true },
  });
  const pipelineUpdates = pipelines.filter((p) => isBadTenant(p.tenantId) || p.tenantId !== ownerUserId);

  const playlists = await prisma.playlist.findMany({
    where: { storeId },
    select: { id: true, tenantId: true, name: true, type: true },
  });
  const playlistUpdates = playlists.filter((p) => isBadTenant(p.tenantId) || p.tenantId !== ownerUserId);

  const devices = await prisma.device.findMany({
    where: { storeId },
    select: { id: true, tenantId: true, name: true },
  });
  const deviceUpdates = devices.filter((d) => isBadTenant(d.tenantId) || d.tenantId !== ownerUserId);

  const pairings = await prisma.devicePairing.findMany({
    where: { storeId },
    select: { id: true, tenantId: true, pairingCode: true },
  });
  const pairingUpdates = pairings.filter((p) => isBadTenant(p.tenantId) || p.tenantId !== ownerUserId);

  console.log('\n=== Rows to repair ===');
  console.log(`DraftStore: ${draftUpdates.length}`);
  for (const d of draftUpdates.slice(0, 20)) {
    console.log(`  draft ${d.id} (${d.status})`, d.before, '→', ownerUserId);
  }
  if (draftUpdates.length > 20) console.log(`  ... and ${draftUpdates.length - 20} more`);

  console.log(`MissionPipeline: ${pipelineUpdates.length}`);
  for (const p of pipelineUpdates.slice(0, 10)) {
    console.log(`  pipeline ${p.id}`, p.tenantId, '→', ownerUserId);
  }

  console.log(`Playlist: ${playlistUpdates.length}`);
  console.log(`Device: ${deviceUpdates.length}`);
  console.log(`DevicePairing: ${pairingUpdates.length}`);

  const total =
    draftUpdates.length +
    pipelineUpdates.length +
    playlistUpdates.length +
    deviceUpdates.length +
    pairingUpdates.length;

  if (total === 0) {
    console.log('\nNo rows need tenantId repair for this store.');
    await prisma.$disconnect();
    return;
  }

  if (!apply) {
    console.log('\nDry run only. Re-run with --apply to write changes.');
    await prisma.$disconnect();
    return;
  }

  let applied = 0;

  for (const d of draftUpdates) {
    const row = drafts.find((x) => x.id === d.id);
    const data = {};
    if (d.needsInput) data.input = patchDraftInput(row?.input, ownerUserId);
    if (d.needsOwner) data.ownerUserId = ownerUserId;
    if (d.needsCommittedUser) data.committedUserId = ownerUserId;
    await prisma.draftStore.update({ where: { id: d.id }, data });
    applied += 1;
  }

  for (const p of pipelineUpdates) {
    await prisma.missionPipeline.update({
      where: { id: p.id },
      data: { tenantId: ownerUserId },
    });
    applied += 1;
  }

  for (const p of playlistUpdates) {
    await prisma.playlist.update({
      where: { id: p.id },
      data: { tenantId: ownerUserId },
    });
    applied += 1;
  }

  for (const d of deviceUpdates) {
    await prisma.device.update({
      where: { id: d.id },
      data: { tenantId: ownerUserId },
    });
    applied += 1;
  }

  for (const p of pairingUpdates) {
    await prisma.devicePairing.update({
      where: { id: p.id },
      data: { tenantId: ownerUserId },
    });
    applied += 1;
  }

  console.log(`\nApplied ${applied} updates. Owner tenantId = ${ownerUserId}`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
