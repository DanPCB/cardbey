/**
 * Score generated draft store package completeness (0–100).
 * Used by activation store build runway to avoid fake success on empty shells.
 */

export type DraftPackageCompleteness = {
  score: number;
  checks: {
    businessProfile: boolean;
    hero: boolean;
    about: boolean;
    contact: boolean;
    category: boolean;
    offerOrPromotion: boolean;
    contentSections: boolean;
  };
  missing: string[];
};

function parsePreview(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  if (typeof raw === 'object' && raw !== null) return raw as Record<string, unknown>;
  return {};
}

function websiteSections(preview: Record<string, unknown>): Array<Record<string, unknown>> {
  const website = preview.website;
  if (!website || typeof website !== 'object') return [];
  const sections = (website as { sections?: unknown }).sections;
  return Array.isArray(sections)
    ? sections.filter((s): s is Record<string, unknown> => Boolean(s && typeof s === 'object'))
    : [];
}

function sectionType(section: Record<string, unknown>): string {
  return String(section.type ?? '').toLowerCase();
}

function hasWebsiteSection(preview: Record<string, unknown>, type: string): boolean {
  return websiteSections(preview).some((s) => sectionType(s) === type.toLowerCase());
}

function itemCount(preview: Record<string, unknown>): number {
  const items = preview.items ?? preview.products;
  return Array.isArray(items) ? items.length : 0;
}

export function scoreDraftPackageCompleteness(rawPreview: unknown): DraftPackageCompleteness {
  const preview = parsePreview(rawPreview);
  const meta =
    preview.meta && typeof preview.meta === 'object'
      ? (preview.meta as Record<string, unknown>)
      : {};

  const storeName = preview.storeName ?? meta.storeName;
  const storeType = preview.storeType ?? meta.storeType;
  const heroImageUrl =
    preview.heroImageUrl ??
    (preview.hero && typeof preview.hero === 'object'
      ? (preview.hero as Record<string, unknown>).imageUrl ??
        (preview.hero as Record<string, unknown>).url
      : null);

  const checks = {
    businessProfile: Boolean(typeof storeName === 'string' && storeName.trim()),
    hero: Boolean(heroImageUrl) || hasWebsiteSection(preview, 'hero'),
    about:
      hasWebsiteSection(preview, 'about') ||
      Boolean(typeof preview.tagline === 'string' && preview.tagline.trim()) ||
      Boolean(typeof preview.heroText === 'string' && preview.heroText.trim()),
    contact:
      hasWebsiteSection(preview, 'contact') ||
      Boolean(preview.phone || preview.email || preview.address),
    category:
      Boolean(typeof storeType === 'string' && storeType.trim() && storeType !== 'general') ||
      (Array.isArray(preview.categories) && preview.categories.length > 0),
    offerOrPromotion:
      itemCount(preview) >= 1 ||
      hasWebsiteSection(preview, 'offers') ||
      hasWebsiteSection(preview, 'promotions') ||
      hasWebsiteSection(preview, 'menu'),
    contentSections: websiteSections(preview).length >= 2 || itemCount(preview) >= 2,
  };

  const weights: Record<keyof typeof checks, number> = {
    businessProfile: 15,
    hero: 15,
    about: 15,
    contact: 15,
    category: 10,
    offerOrPromotion: 15,
    contentSections: 15,
  };

  let score = 0;
  const missing: string[] = [];
  for (const key of Object.keys(checks) as Array<keyof typeof checks>) {
    if (checks[key]) {
      score += weights[key];
    } else {
      missing.push(key);
    }
  }

  return { score: Math.min(100, score), checks, missing };
}
