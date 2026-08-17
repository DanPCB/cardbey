/**
 * Deterministic seed completeness scoring — no I/O.
 * Tier never self-promotes to prestige_ready (human QA flag only).
 */

export const COMPLETENESS_TIERS = Object.freeze([
  'blocked',
  'publishable',
  'good',
  'prestige_ready',
]);

export const HERO_MIN_WIDTH = 1200;
export const HERO_MIN_HEIGHT = 600;

export const BLOCKER_CODES = Object.freeze([
  'HERO_MISSING',
  'HERO_LOW_RES',
  'HERO_LOGO_SUSPECT',
  'NAME_MISSING',
  'CATEGORY_MISSING',
  'ADDRESS_OR_HOURS_MISSING',
  'ITEMS_INSUFFICIENT',
]);

export const GOOD_GAP_CODES = Object.freeze([
  'ITEMS_UNDESCRIBED',
  'ITEMS_UNPRICED',
  'GALLERY_THIN',
  'ABOUT_MISSING',
]);

export const PRESTIGE_GAP_CODES = Object.freeze([
  'HERO_STOCK_FALLBACK',
  'SOCIAL_MISSING',
]);

/** Hero provenances trusted for prestige eligibility (function still does not assert prestige_ready). */
export const PRESTIGE_HERO_PROVENANCE = Object.freeze([
  'website_extraction',
  'social_og',
  'admin_curated',
]);

function isBlank(value) {
  return value == null || String(value).trim() === '';
}

function namedItems(items) {
  return (Array.isArray(items) ? items : []).filter((item) => !isBlank(item?.name));
}

function hasSocialLinks(socialLinks) {
  if (!socialLinks || typeof socialLinks !== 'object') return false;
  return Object.values(socialLinks).some((v) => !isBlank(v));
}

function setReport(fieldReport, key, status, detail) {
  fieldReport[key] = detail ? { status, detail } : { status };
}

/**
 * @param {object} seed
 * @returns {{
 *   tier: 'blocked' | 'publishable' | 'good' | 'prestige_ready',
 *   score: number,
 *   blockers: string[],
 *   gaps: string[],
 *   fieldReport: Record<string, { status: 'pass' | 'fail' | 'warn', detail?: string }>
 * }}
 */
export function computeSeedCompleteness(seed = {}) {
  const blockers = [];
  const gaps = [];
  const fieldReport = {};

  const name = seed.businessName ?? null;
  const category = seed.category ?? null;
  const businessType = seed.businessType === 'retail' || seed.businessType === 'hospitality' || seed.businessType === 'service'
    ? seed.businessType
    : 'unknown';
  const address = seed.address ?? null;
  const hours = seed.hours ?? null;
  const tagline = seed.tagline ?? null;
  const about = seed.about ?? null;
  const hero = seed.hero && typeof seed.hero === 'object' ? seed.hero : null;
  const gallery = Array.isArray(seed.gallery) ? seed.gallery : [];
  const items = Array.isArray(seed.items) ? seed.items : [];
  const socialLinks = seed.socialLinks ?? null;

  if (isBlank(name)) {
    blockers.push('NAME_MISSING');
    setReport(fieldReport, 'businessName', 'fail', 'businessName is empty');
  } else {
    setReport(fieldReport, 'businessName', 'pass');
  }

  if (isBlank(category)) {
    blockers.push('CATEGORY_MISSING');
    setReport(fieldReport, 'category', 'fail', 'category is empty');
  } else {
    setReport(fieldReport, 'category', 'pass');
  }

  if (isBlank(address) && hours == null) {
    blockers.push('ADDRESS_OR_HOURS_MISSING');
    setReport(fieldReport, 'addressOrHours', 'fail', 'address and hours are both missing');
  } else {
    setReport(fieldReport, 'addressOrHours', 'pass');
  }

  const heroUrl = hero?.url ?? null;
  if (isBlank(heroUrl)) {
    blockers.push('HERO_MISSING');
    setReport(fieldReport, 'hero', 'fail', 'hero.url is empty');
  } else {
    const width = hero.width == null ? 0 : Number(hero.width);
    const height = hero.height == null ? 0 : Number(hero.height);
    if (width < HERO_MIN_WIDTH || height < HERO_MIN_HEIGHT) {
      blockers.push('HERO_LOW_RES');
      setReport(fieldReport, 'heroResolution', 'fail', `${width}x${height} < ${HERO_MIN_WIDTH}x${HERO_MIN_HEIGHT}`);
    } else {
      setReport(fieldReport, 'heroResolution', 'pass', `${width}x${height}`);
    }

    const provenance = hero.provenance ?? null;
    if (hero.isLogoSuspect === true && provenance !== 'admin_curated') {
      blockers.push('HERO_LOGO_SUSPECT');
      setReport(fieldReport, 'heroLogo', 'fail', `logo-suspect provenance=${provenance ?? 'null'}`);
    } else {
      setReport(fieldReport, 'heroLogo', 'pass');
    }

    if (provenance === 'stock_fallback') {
      gaps.push('HERO_STOCK_FALLBACK');
      setReport(fieldReport, 'heroProvenance', 'warn', 'stock_fallback');
    } else {
      setReport(fieldReport, 'heroProvenance', 'pass', provenance ?? 'unknown');
    }
    setReport(fieldReport, 'hero', 'pass');
  }

  const named = namedItems(items);
  if (named.length < 3) {
    blockers.push('ITEMS_INSUFFICIENT');
    setReport(fieldReport, 'itemsNamed', 'fail', `${named.length}/3 named items`);
  } else {
    setReport(fieldReport, 'itemsNamed', 'pass', `${named.length} named items`);
  }

  const described = named.filter((item) => !isBlank(item.description));
  if (described.length < 5) {
    gaps.push('ITEMS_UNDESCRIBED');
    setReport(fieldReport, 'itemsDescribed', 'warn', `${described.length}/5 described items`);
  } else {
    setReport(fieldReport, 'itemsDescribed', 'pass', `${described.length} described items`);
  }

  if (businessType !== 'service') {
    const priced = named.filter((item) => typeof item.price === 'number' && Number.isFinite(item.price));
    if (priced.length < 3) {
      gaps.push('ITEMS_UNPRICED');
      setReport(fieldReport, 'itemsPriced', 'warn', `${priced.length}/3 priced items`);
    } else {
      setReport(fieldReport, 'itemsPriced', 'pass', `${priced.length} priced items`);
    }
  } else {
    setReport(fieldReport, 'itemsPriced', 'pass', 'skipped for service businesses');
  }

  const galleryCount = gallery.filter((img) => !isBlank(img?.url)).length;
  if (galleryCount < 2) {
    gaps.push('GALLERY_THIN');
    setReport(fieldReport, 'gallery', 'warn', `${galleryCount}/2 gallery images`);
  } else {
    setReport(fieldReport, 'gallery', 'pass', `${galleryCount} gallery images`);
  }

  if (isBlank(tagline) && isBlank(about)) {
    gaps.push('ABOUT_MISSING');
    setReport(fieldReport, 'about', 'warn', 'tagline and about are both empty');
  } else {
    setReport(fieldReport, 'about', 'pass');
  }

  if (!hasSocialLinks(socialLinks)) {
    gaps.push('SOCIAL_MISSING');
    setReport(fieldReport, 'social', 'warn', 'no social links');
  } else {
    setReport(fieldReport, 'social', 'pass');
  }

  const goodGaps = gaps.filter((code) => GOOD_GAP_CODES.includes(code));
  let tier = 'publishable';
  if (blockers.length > 0) {
    tier = 'blocked';
  } else if (goodGaps.length === 0) {
    // Eligible for prestige when prestige gaps are also empty, but never self-promote.
    tier = 'good';
  }

  const score = Math.max(0, 100 - blockers.length * 15 - gaps.length * 5);

  return {
    tier,
    score,
    blockers,
    gaps,
    fieldReport,
  };
}
