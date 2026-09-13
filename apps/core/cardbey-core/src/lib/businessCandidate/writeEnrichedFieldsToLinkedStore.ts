/**
 * Write enriched BusinessCandidate contact/profile fields onto the linked Business row.
 */

import { getPrismaClient } from '../prisma.js';
import type { BusinessCandidateRecord } from '../types.js';
import { buildBusinessEnrichmentPatch } from './enrichment/buildBusinessEnrichmentPatch.js';

/**
 * @returns number of Business fields written (excludes updatedAt)
 */
export async function writeEnrichedFieldsToLinkedStore(
  candidate: BusinessCandidateRecord,
): Promise<number> {
  const storeId = candidate.storeId?.trim();
  if (!storeId) return 0;

  const prisma = getPrismaClient();
  const existing = await prisma.business.findUnique({
    where: { id: storeId },
    select: {
      phone: true,
      email: true,
      websiteUrl: true,
      address: true,
      suburb: true,
      state: true,
      postcode: true,
      tagline: true,
      description: true,
      heroImageUrl: true,
      avatarImageUrl: true,
      socialLinks: true,
      tradingHours: true,
    },
  });
  if (!existing) {
    console.warn(`[enrich] storeId=${storeId} not found — skip Business write-back`);
    return 0;
  }

  const storePatch = buildBusinessEnrichmentPatch(existing, candidate);
  if (Object.keys(storePatch).length === 0) return 0;

  storePatch.updatedAt = new Date();
  await prisma.business.update({
    where: { id: storeId },
    data: storePatch,
  });
  const fieldCount = Object.keys(storePatch).length - 1;
  console.log(
    `[enrich] wrote ${fieldCount} fields to Business ${storeId} (${candidate.name ?? storeId})`,
  );
  return fieldCount;
}
