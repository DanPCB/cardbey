/**
 * Sync manual business profile edits (PATCH /api/stores/:id) into committed draft preview.
 * Business row remains canonical for live /space; draft preview stays aligned for website editor.
 */
import { patchDraftPreview } from './draftStoreService.js';

/**
 * @param {object} updateData - validated StoreUpdateSchema fields
 * @returns {Record<string, unknown>}
 */
export function buildBusinessProfileDraftPatch(updateData) {
  if (!updateData || typeof updateData !== 'object') return {};

  const patch = {};

  if (updateData.name !== undefined) {
    const name = typeof updateData.name === 'string' ? updateData.name.trim() : '';
    if (name) {
      patch.storeName = name;
      patch.name = name;
    }
  }
  if (updateData.tagline !== undefined) {
    const tagline =
      updateData.tagline === '' || updateData.tagline == null
        ? null
        : String(updateData.tagline).trim() || null;
    patch.tagline = tagline;
    if (tagline) patch.slogan = tagline;
  }
  if (updateData.description !== undefined) {
    patch.description =
      updateData.description === '' || updateData.description == null
        ? null
        : String(updateData.description).trim() || null;
  }
  if (updateData.phone !== undefined) {
    patch.phone =
      updateData.phone === '' || updateData.phone == null
        ? null
        : String(updateData.phone).trim() || null;
  }
  if (updateData.contactEmail !== undefined) {
    const email =
      updateData.contactEmail === '' || updateData.contactEmail == null
        ? null
        : String(updateData.contactEmail).trim() || null;
    patch.email = email;
    patch.contactEmail = email;
  }
  if (updateData.address !== undefined) {
    patch.address =
      updateData.address === '' || updateData.address == null
        ? null
        : String(updateData.address).trim() || null;
  }
  if (updateData.suburb !== undefined) {
    patch.suburb =
      updateData.suburb === '' || updateData.suburb == null
        ? null
        : String(updateData.suburb).trim() || null;
  }
  if (updateData.postcode !== undefined) {
    patch.postcode =
      updateData.postcode === '' || updateData.postcode == null
        ? null
        : String(updateData.postcode).trim() || null;
  }
  if (updateData.country !== undefined) {
    patch.country =
      updateData.country === '' || updateData.country == null
        ? null
        : String(updateData.country).trim() || null;
  }

  return patch;
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} businessId
 * @param {object} updateData
 */
export async function syncBusinessProfileToCommittedDraft(prisma, businessId, updateData) {
  const id = String(businessId || '').trim();
  if (!id) return { synced: false, reason: 'no_business_id' };

  const patch = buildBusinessProfileDraftPatch(updateData);
  if (!Object.keys(patch).length) return { synced: false, reason: 'no_profile_fields' };

  const draft = await prisma.draftStore.findFirst({
    where: {
      committedStoreId: id,
      status: { in: ['committed', 'ready'] },
    },
    orderBy: { updatedAt: 'desc' },
    select: { id: true },
  });
  if (!draft?.id) return { synced: false, reason: 'no_draft' };

  await patchDraftPreview(draft.id, patch);
  return { synced: true, draftId: draft.id };
}
