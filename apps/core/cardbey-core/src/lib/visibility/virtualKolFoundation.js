/**
 * Virtual KOL foundation — Phase 5 stub (flag-gated).
 * Draft-only; never publishes or claims influence metrics.
 */

import { Features } from '../../config/features.js';
import { skpToPublicDto } from '../storeKnowledge/index.js';

export function isVirtualKolEnabled() {
  return Features.visibility?.virtualKolV1 === true;
}

/**
 * Build a draft Virtual KOL profile from SKP (not persisted, not published).
 * @param {object | null} skp
 */
export function draftVirtualKolFromSkp(skp) {
  if (!isVirtualKolEnabled()) {
    return {
      ok: false,
      skipped: true,
      reason: 'virtual_kol_disabled',
      message: 'ENABLE_VIRTUAL_KOL_V1 is off. Drafts are blocked until first-party reviews exist.',
    };
  }
  if (!skp) {
    return { ok: false, skipped: true, reason: 'skp_required' };
  }
  const dto = skpToPublicDto(skp);
  if (!dto) {
    return { ok: false, skipped: true, reason: 'skp_dto_unavailable' };
  }

  return {
    ok: true,
    published: false,
    draft: {
      storeId: dto.id,
      slug: dto.slug,
      displayName: dto.name,
      suburb: dto.suburb,
      canonicalUrl: dto.canonicalUrl,
      personaSeed: {
        tone: 'local_expert',
        topics: [dto.category, dto.suburb].filter(Boolean),
      },
      requirements: {
        skpReady: true,
        ssrLive: false, // operator must confirm
        firstPartyReviews: false, // Review model still absent
      },
    },
    note: 'Foundation draft only. Not a live Virtual KOL. Do not claim AI visibility.',
  };
}
