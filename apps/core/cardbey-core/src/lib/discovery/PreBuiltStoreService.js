/**
 * PreBuiltStoreService — system-owned DraftStore shells for unclaimed stores.
 */

import { prisma } from '../prisma.js';
import { slugify } from '../../utils/slug.js';

/**
 * @param {object} normalized Normalized social/discovery payload
 * @param {string} unclaimedStoreId
 * @returns {Promise<{ draftStoreId: string, slug: string } | null>}
 */
export async function buildPreBuiltStore(normalized, unclaimedStoreId) {
  const systemUserId = process.env.DISCOVERY_SYSTEM_USER_ID?.trim();
  if (!systemUserId) {
    console.warn('[PreBuiltStore] DISCOVERY_SYSTEM_USER_ID not set — skipping pre-build');
    return null;
  }

  const businessName = str(normalized.businessName) || 'Unnamed Business';
  const slug = slugify(businessName) || 'store';

  const draft = await prisma.draftStore.create({
    data: {
      mode: 'template',
      status: 'pre_built',
      ownerUserId: systemUserId,
      unclaimedStoreId,
      brandTone: str(normalized.brandTone) || null,
      brandStyle: str(normalized.brandStyle) || null,
      brandColors: normalized.brandColors
        ? (typeof normalized.brandColors === 'string' ? normalized.brandColors : JSON.stringify(normalized.brandColors))
        : null,
      expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      input: {
        businessName,
        bioText: str(normalized.bioText) || '',
        sourceUrl: str(normalized.sourceUrl),
        sourcePlatform: str(normalized.sourcePlatform || normalized.platform),
        followerCount: normalized.followerCount ?? null,
        location: str(normalized.location) || '',
        businessType: str(normalized.businessType) || 'general',
        socialLinks: normalized.socialLinks || null,
        source: 'discovery_agent',
        logoUrl: str(normalized.logoUrl || normalized.avatarUrl) || '',
        heroMedia: normalized.heroMedia || null,
        products: normalized.products || [],
        currencyCode: normalized.currencyCode || 'AUD',
        rawUserText: normalized.rawUserText || '',
      },
      preview: {
        storeName: businessName,
        slogan: str(normalized.bioText).slice(0, 120) || '',
      },
    },
  });

  return { draftStoreId: draft.id, slug };
}

/**
 * Transfer pre-built draft to claimer after OTP verification.
 * @param {string} draftStoreId
 * @param {string} newUserId
 */
export async function transferToClaimer(draftStoreId, newUserId) {
  const draft = await prisma.draftStore.findFirst({
    where: { id: draftStoreId, status: 'pre_built' },
  });
  if (!draft) return null;

  const input = draft.input && typeof draft.input === 'object' ? { ...draft.input } : {};
  input.source = 'claimed';

  return prisma.draftStore.update({
    where: { id: draftStoreId },
    data: {
      ownerUserId: newUserId,
      status: 'draft',
      transferredAt: new Date(),
      input,
    },
  });
}

function str(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}
