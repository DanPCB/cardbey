/**
 * Unpublish (or delete) public stores by id or slug — ops / repair script.
 *
 * Usage (from apps/core/cardbey-core):
 *   node scripts/unpublish-public-store.mjs my-business my-business-2           # dry-run
 *   node scripts/unpublish-public-store.mjs my-business my-business-2 --apply   # unpublish
 *   node scripts/unpublish-public-store.mjs cmp6ukzgm001zos5c917l954r --apply --delete
 */
import '../src/env/ensureDatabaseUrl.js';
import { getPrismaClient } from '../src/db/prisma.js';
import { dbSupports } from '../src/lib/dbCapabilities.js';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const apply = process.argv.includes('--apply');
const hardDelete = process.argv.includes('--delete');

if (args.length === 0) {
  console.error('Usage: node scripts/unpublish-public-store.mjs <id-or-slug> [...] [--apply] [--delete]');
  process.exit(1);
}

const prisma = getPrismaClient();

function businessCleanupSelect() {
  const base = {
    id: true,
    name: true,
    slug: true,
    userId: true,
    isActive: true,
    publishedAt: true,
    user: { select: { id: true, email: true, role: true } },
  };
  if (dbSupports.extendedBusinessFields) {
    return { ...base, isGuestDraft: true, expiresAt: true };
  }
  return base;
}

async function resolveBusiness(key) {
  const trimmed = String(key ?? '').trim();
  if (!trimmed) return null;
  const select = businessCleanupSelect();
  const byId = await prisma.business.findUnique({
    where: { id: trimmed },
    select,
  });
  if (byId) return byId;
  return prisma.business.findUnique({
    where: { slug: trimmed.toLowerCase() },
    select,
  });
}

async function unpublishBusiness(business) {
  const data = {
    isActive: false,
    publishedAt: null,
  };
  if (dbSupports.extendedBusinessFields) {
    data.isGuestDraft = true;
    data.expiresAt = new Date(Date.now() - 60_000);
  }
  await prisma.business.update({
    where: { id: business.id },
    data,
  });
}

async function deleteBusiness(business) {
  const storeId = business.id;
  await prisma.$transaction(async (tx) => {
    await tx.promotionPlacement.deleteMany({ where: { storeId } }).catch(() => {});
    await tx.promotion.deleteMany({ where: { storeId } }).catch(() => {});
    await tx.smartObject.deleteMany({ where: { storeId } }).catch(() => {});
    await tx.intentOpportunity.deleteMany({ where: { storeId } }).catch(() => {});
    await tx.intentSignal.deleteMany({ where: { storeId } }).catch(() => {});
    await tx.storeOffer.deleteMany({ where: { storeId } }).catch(() => {});
    await tx.storePromo.deleteMany({ where: { storeId } }).catch(() => {});
    await tx.product.deleteMany({ where: { businessId: storeId } }).catch(() => {});
    await tx.business.delete({ where: { id: storeId } });
  });
}

async function main() {
  console.log(`Mode: ${apply ? (hardDelete ? 'DELETE' : 'UNPUBLISH') : 'DRY-RUN'}\n`);

  for (const key of args) {
    const business = await resolveBusiness(key);
    if (!business) {
      console.warn(`❌ Not found: ${key}`);
      continue;
    }

    console.log('Store:', {
      id: business.id,
      name: business.name,
      slug: business.slug,
      userId: business.userId,
      ownerEmail: business.user?.email ?? null,
      ownerRole: business.user?.role ?? null,
      isActive: business.isActive,
      publishedAt: business.publishedAt,
      isGuestDraft: business.isGuestDraft ?? false,
    });

    if (!apply) {
      console.log(`→ Would ${hardDelete ? 'delete' : 'unpublish'} ${business.slug}\n`);
      continue;
    }

    if (hardDelete) {
      await deleteBusiness(business);
      console.log(`✅ Deleted ${business.slug}\n`);
    } else {
      await unpublishBusiness(business);
      console.log(`✅ Unpublished ${business.slug}\n`);
    }
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
