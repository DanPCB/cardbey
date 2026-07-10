/**
 * Validation rule packs per artifact family.
 */

/** @typedef {{ id: string; severity: 'error'|'warning'; message: string; field?: string }} ValidationFinding */

/**
 * @param {Record<string, unknown>} generated
 * @param {string[]} [ruleIds]
 * @returns {ValidationFinding[]}
 */
export function runValidationPack(packId, generated, ruleIds = []) {
  const pack = VALIDATION_PACKS[packId];
  if (!pack) return [];
  return pack(generated, ruleIds);
}

/**
 * @param {string} artifactType
 */
export function resolveValidationPackId(artifactType) {
  return VALIDATION_PACK_BY_TYPE[artifactType] ?? 'generic';
}

const VALIDATION_PACK_BY_TYPE = {
  promotion_graphic: 'promotion_graphic',
  poster: 'promotion_graphic',
  flyer: 'promotion_graphic',
  brochure: 'promotion_graphic',
  promotion_video: 'promotion_video',
  reel: 'promotion_video',
  story: 'promotion_video',
  slideshow: 'promotion_video',
  website: 'website',
  landing_page: 'website',
  store_profile: 'website',
  menu: 'menu',
  catalog: 'menu',
  loyalty_program: 'loyalty',
  promotion_offer: 'promotion_graphic',
  coupon: 'promotion_graphic',
  social_post: 'promotion_graphic',
  email_campaign: 'promotion_graphic',
};

/** @type {Record<string, (generated: Record<string, unknown>, ruleIds?: string[]) => ValidationFinding[]>} */
const VALIDATION_PACKS = {
  generic: (generated) => {
    const findings = [];
    if (!generated || typeof generated !== 'object') {
      findings.push({ id: 'generic.empty', severity: 'error', message: 'No generated output' });
    }
    return findings;
  },
  promotion_graphic: (generated) => {
    const findings = VALIDATION_PACKS.generic(generated);
    const text = String(generated.headline ?? generated.title ?? generated.copy ?? '').trim();
    if (!text) findings.push({ id: 'graphic.text', severity: 'warning', message: 'Missing headline or copy', field: 'text' });
    if (!generated.url && !generated.previewUrl && !generated.imageUrl) {
      findings.push({ id: 'graphic.asset', severity: 'error', message: 'Missing graphic output URL', field: 'url' });
    }
    return findings;
  },
  promotion_video: (generated) => {
    const findings = VALIDATION_PACKS.generic(generated);
    if (!generated.url && !generated.previewUrl) {
      findings.push({ id: 'video.url', severity: 'error', message: 'Missing video URL', field: 'url' });
    }
    const duration = Number(generated.durationSeconds ?? generated.duration);
    if (Number.isFinite(duration) && duration > 600) {
      findings.push({ id: 'video.duration', severity: 'warning', message: 'Video exceeds 10 minutes', field: 'duration' });
    }
    return findings;
  },
  website: (generated) => {
    const findings = VALIDATION_PACKS.generic(generated);
    const pages = generated.pages ?? generated.structure?.pages;
    if (!pages) findings.push({ id: 'website.pages', severity: 'warning', message: 'No pages defined in blueprint', field: 'pages' });
    return findings;
  },
  menu: (generated) => {
    const findings = VALIDATION_PACKS.generic(generated);
    const items = generated.items ?? generated.menuItems ?? generated.catalog;
    if (!items) findings.push({ id: 'menu.items', severity: 'warning', message: 'Menu has no items', field: 'items' });
    return findings;
  },
  loyalty: (generated) => {
    const findings = VALIDATION_PACKS.generic(generated);
    const rewards = generated.rewards ?? generated.program?.rewards ?? generated.draft?.rewards;
    if (!rewards) findings.push({ id: 'loyalty.rewards', severity: 'error', message: 'Loyalty program missing rewards', field: 'rewards' });
    return findings;
  },
};
