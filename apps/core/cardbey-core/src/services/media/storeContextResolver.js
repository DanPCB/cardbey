/**
 * Resolves store/mission context for media search query enrichment.
 */

import { getPrismaClient } from '../../lib/prisma.js';
import { getMissionById } from '../../lib/missionBlackboard.js';
import { parseBrandColorsField } from '../store/brandKitService.js';

/**
 * @typedef {{
 *   industry: string;
 *   brandKit: { tone: string; colors: string[]; style: string };
 *   website: string;
 *   name: string;
 * }} StoreContextShape
 */

const EMPTY_CONTEXT = Object.freeze({
  industry: '',
  brandKit: { tone: '', colors: [], style: 'modern' },
  website: '',
  name: '',
});

/**
 * @param {unknown} raw
 */
function parseJsonObject(raw) {
  if (raw == null) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw);
      return p && typeof p === 'object' && !Array.isArray(p) ? p : {};
    } catch {
      return {};
    }
  }
  return {};
}

/**
 * @param {string} industry
 */
export function deriveToneFromIndustry(industry) {
  const ind = String(industry ?? '').toLowerCase();
  if (/(beauty|spa|wellness|salon|nail|skincare)/.test(ind)) return 'luxury';
  if (/(cafe|coffee|restaurant|food|bakery|bistro|diner)/.test(ind)) return 'warm';
  if (/(retail|fashion|boutique|apparel|clothing)/.test(ind)) return 'modern';
  if (/(tech|electronics|software|digital|gadget)/.test(ind)) return 'minimal';
  return 'professional';
}

/**
 * @param {string} urlOrDomain
 */
function extractDomainFromUrl(urlOrDomain) {
  const raw = String(urlOrDomain ?? '').trim();
  if (!raw) return '';
  try {
    const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const host = new URL(withProto).hostname.replace(/^www\./i, '');
    return host || '';
  } catch {
    return raw
      .replace(/^https?:\/\//i, '')
      .replace(/^www\./i, '')
      .split('/')[0]
      .split('?')[0]
      .trim();
  }
}

/**
 * @param {object} prefs
 */
function colorsFromStylePreferences(prefs) {
  const out = [];
  if (Array.isArray(prefs.colors)) {
    for (const c of prefs.colors) {
      const s = String(c ?? '').trim();
      if (s) out.push(s);
    }
  }
  if (Array.isArray(prefs.brandColors)) {
    for (const c of prefs.brandColors) {
      const s = String(c ?? '').trim();
      if (s) out.push(s);
    }
  }
  if (typeof prefs.primaryColor === 'string' && prefs.primaryColor.trim()) {
    out.push(prefs.primaryColor.trim());
  }
  if (typeof prefs.secondaryColor === 'string' && prefs.secondaryColor.trim()) {
    out.push(prefs.secondaryColor.trim());
  }
  const seen = new Set();
  return out.filter((c) => {
    const key = c.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 2);
}

/**
 * @param {object} sources
 * @returns {StoreContextShape}
 */
function mergeContextSources(sources) {
  const industry =
    normalizeField(sources.industry) ||
    normalizeField(sources.businessType) ||
    normalizeField(sources.storeType) ||
    normalizeField(sources.vertical) ||
    '';

  const name =
    normalizeField(sources.name) ||
    normalizeField(sources.storeName) ||
    normalizeField(sources.businessName) ||
    '';

  const website =
    extractDomainFromUrl(sources.website) ||
    extractDomainFromUrl(sources.websiteDomain) ||
    extractDomainFromUrl(sources.websiteUrl) ||
    '';

  const prefs = parseJsonObject(sources.stylePreferences);
  const brandKitRaw = parseJsonObject(sources.brandKit);
  const dbColors = parseBrandColorsField(sources.brandColors);

  const tone =
    normalizeField(sources.brandTone) ||
    normalizeField(brandKitRaw.tone) ||
    normalizeField(prefs.tone) ||
    normalizeField(prefs.mood) ||
    (industry ? deriveToneFromIndustry(industry) : 'professional');

  const style =
    normalizeField(sources.brandStyle) ||
    normalizeField(brandKitRaw.style) ||
    normalizeField(prefs.style) ||
    'modern';

  const legacyColors = colorsFromStylePreferences({
    ...prefs,
    ...brandKitRaw,
    primaryColor: brandKitRaw.primaryColor ?? prefs.primaryColor ?? sources.primaryColor,
    secondaryColor: brandKitRaw.secondaryColor ?? prefs.secondaryColor ?? sources.secondaryColor,
  });
  const colors = dbColors.length ? dbColors : legacyColors;

  return {
    industry,
    brandKit: {
      tone,
      colors,
      style,
    },
    website,
    name,
  };
}

/**
 * @param {unknown} v
 */
function normalizeField(v) {
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * @param {string | null | undefined} storeId
 */
async function loadStoreFields(storeId) {
  if (!storeId || typeof storeId !== 'string') return {};
  const id = storeId.trim();
  if (!id) return {};

  const prisma = getPrismaClient();

  try {
    const business = await prisma.business.findUnique({
      where: { id },
      select: {
        name: true,
        type: true,
        primaryColor: true,
        secondaryColor: true,
        stylePreferences: true,
        brandTone: true,
        brandStyle: true,
        brandColors: true,
      },
    });
    if (business) {
      const prefs = parseJsonObject(business.stylePreferences);
      return {
        name: business.name,
        industry: business.type,
        businessType: business.type,
        stylePreferences: prefs,
        primaryColor: business.primaryColor,
        secondaryColor: business.secondaryColor,
        brandTone: business.brandTone,
        brandStyle: business.brandStyle,
        brandColors: business.brandColors,
        brandKit: prefs.brandKit ?? prefs,
      };
    }
  } catch {
    /* fall through */
  }

  try {
    const draft = await prisma.draftStore.findUnique({
      where: { id },
      select: {
        input: true,
        preview: true,
        brandTone: true,
        brandStyle: true,
        brandColors: true,
      },
    });
    if (draft) {
      const input = parseJsonObject(draft.input);
      const preview = parseJsonObject(draft.preview);
      return {
        name: preview.storeName ?? input.storeName ?? input.businessName,
        industry: input.businessType ?? input.storeType ?? preview.storeType,
        businessType: input.businessType ?? input.storeType,
        storeType: preview.storeType ?? input.storeType,
        website: input.websiteDomain ?? input.websiteUrl ?? preview.websiteDomain,
        websiteDomain: input.websiteDomain ?? preview.websiteDomain,
        websiteUrl: input.websiteUrl ?? preview.websiteUrl,
        stylePreferences: preview.stylePreferences ?? input.stylePreferences,
        brandTone: draft.brandTone,
        brandStyle: draft.brandStyle,
        brandColors: draft.brandColors,
        brandKit: preview.brandKit ?? input.brandKit,
      };
    }
  } catch {
    /* fall through */
  }

  return {};
}

/**
 * @param {string | null | undefined} missionId
 * @param {string | null | undefined} storeId
 * @returns {Promise<StoreContextShape>}
 */
export async function resolveStoreContext(missionId, storeId) {
  try {
    const sources = {};

    const resolvedStoreId =
      typeof storeId === 'string' && storeId.trim() ? storeId.trim() : null;

    if (resolvedStoreId) {
      Object.assign(sources, await loadStoreFields(resolvedStoreId));
    }

    const mid = typeof missionId === 'string' ? missionId.trim() : '';
    if (mid) {
      const mission = await getMissionById(mid);
      if (mission) {
        const prisma = getPrismaClient();
        const row = await prisma.missionPipeline.findUnique({
          where: { id: mid },
          select: { metadataJson: true, targetId: true, title: true },
        });
        const meta = parseJsonObject(row?.metadataJson);
        Object.assign(sources, meta);
        if (!sources.name && row?.title) sources.name = row.title;
        const targetId =
          resolvedStoreId ||
          (typeof row?.targetId === 'string' && row.targetId.trim() ? row.targetId.trim() : null) ||
          (typeof meta.storeId === 'string' && meta.storeId.trim() ? meta.storeId.trim() : null) ||
          (typeof mission.storeId === 'string' && mission.storeId.trim() ? mission.storeId.trim() : null);
        if (targetId && targetId !== resolvedStoreId) {
          Object.assign(sources, await loadStoreFields(targetId));
        }
      }
    }

    if (!Object.keys(sources).length) {
      return { ...EMPTY_CONTEXT, brandKit: { ...EMPTY_CONTEXT.brandKit } };
    }

    return mergeContextSources(sources);
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[storeContextResolver] failed:', err?.message || err);
    }
    return { ...EMPTY_CONTEXT, brandKit: { ...EMPTY_CONTEXT.brandKit } };
  }
}

export default { resolveStoreContext, deriveToneFromIndustry };
