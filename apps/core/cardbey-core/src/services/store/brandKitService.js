/**
 * BrandKit persistence — shared by HTTP route and update_brand_kit tool executor.
 */

import { deriveToneFromIndustry } from '../media/storeContextResolver.js';

export const ALLOWED_BRAND_TONES = new Set([
  'luxury',
  'friendly',
  'minimal',
  'bold',
  'warm',
  'modern',
  'playful',
  'professional',
]);

const BRAND_KIT_SELECT = {
  id: true,
  brandTone: true,
  brandStyle: true,
  brandColors: true,
  type: true,
  name: true,
};

const DRAFT_BRAND_KIT_SELECT = {
  id: true,
  brandTone: true,
  brandStyle: true,
  brandColors: true,
  input: true,
  preview: true,
  ownerUserId: true,
  generationRunId: true,
};

/**
 * @param {unknown} raw
 * @returns {string[]}
 */
export function parseBrandColorsField(raw) {
  if (raw == null || raw === '') return [];
  if (Array.isArray(raw)) {
    return raw.map((c) => String(c ?? '').trim()).filter(Boolean).slice(0, 5);
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.map((c) => String(c ?? '').trim()).filter(Boolean).slice(0, 5);
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * @param {string[] | undefined | null} colors
 */
export function serializeBrandColors(colors) {
  if (!Array.isArray(colors) || colors.length === 0) return null;
  const cleaned = colors
    .map((c) => String(c ?? '').trim())
    .filter((c) => c.length > 0 && c.length <= 30)
    .slice(0, 5);
  return cleaned.length ? JSON.stringify(cleaned) : null;
}

/**
 * @param {{ brandTone?: string | null, brandStyle?: string | null, brandColors?: string | null, type?: string }} record
 * @param {string} [industryFallback]
 */
export function brandKitFromRecord(record, industryFallback = '') {
  const industry = typeof record?.type === 'string' ? record.type : industryFallback;
  const tone =
    (typeof record?.brandTone === 'string' && record.brandTone.trim()) ||
    deriveToneFromIndustry(industry);
  const style =
    (typeof record?.brandStyle === 'string' && record.brandStyle.trim()) || 'modern';
  return {
    tone,
    style,
    colors: parseBrandColorsField(record?.brandColors),
  };
}

/**
 * @param {object} body
 * @returns {{ ok: true, data: { tone?: string | null, style?: string | null, colors?: string[] } } | { ok: false, code: string, message: string }}
 */
export function validateBrandKitPatch(body = {}) {
  const out = {};

  if (body.tone !== undefined) {
    if (body.tone === null || body.tone === '') {
      out.tone = null;
    } else {
      const tone = String(body.tone).trim().toLowerCase();
      if (!ALLOWED_BRAND_TONES.has(tone)) {
        return {
          ok: false,
          code: 'INVALID_TONE',
          message: `tone must be one of: ${[...ALLOWED_BRAND_TONES].join(', ')}`,
        };
      }
      out.tone = tone;
    }
  }

  if (body.style !== undefined) {
    if (body.style === null || body.style === '') {
      out.style = null;
    } else {
      const style = String(body.style).trim();
      if (style.length > 50) {
        return { ok: false, code: 'INVALID_STYLE', message: 'style must be at most 50 characters' };
      }
      out.style = style;
    }
  }

  if (body.colors !== undefined) {
    if (body.colors === null) {
      out.colors = null;
    } else if (!Array.isArray(body.colors)) {
      return { ok: false, code: 'INVALID_COLORS', message: 'colors must be an array of strings' };
    } else {
      const colors = body.colors.map((c) => String(c ?? '').trim()).filter(Boolean);
      if (colors.length > 5) {
        return { ok: false, code: 'INVALID_COLORS', message: 'colors supports at most 5 items' };
      }
      if (colors.some((c) => c.length > 30)) {
        return { ok: false, code: 'INVALID_COLORS', message: 'each color must be at most 30 characters' };
      }
      out.colors = colors;
    }
  }

  if (!Object.keys(out).length) {
    return { ok: false, code: 'EMPTY_PATCH', message: 'Provide at least one of tone, style, colors' };
  }

  return { ok: true, data: out };
}

/**
 * @param {import('../../lib/prisma.js').PrismaClient | import('../../lib/prisma.js').Prisma.TransactionClient} prisma
 * @param {string} storeId
 */
export async function resolveBrandKitTarget(prisma, storeId) {
  const id = String(storeId ?? '').trim();
  if (!id) return null;

  const draftById = await prisma.draftStore.findUnique({
    where: { id },
    select: DRAFT_BRAND_KIT_SELECT,
  });
  if (draftById) {
    return { kind: 'draft', record: draftById };
  }

  const business = await prisma.business.findUnique({
    where: { id },
    select: { ...BRAND_KIT_SELECT, userId: true },
  });
  if (business) {
    return { kind: 'business', record: business };
  }

  return null;
}

/**
 * @param {import('../../lib/prisma.js').PrismaClient} prisma
 * @param {string} storeId
 * @param {{ tone?: string | null, style?: string | null, colors?: string[] | null }} patch
 */
export async function updateBrandKitForStoreId(prisma, storeId, patch) {
  const target = await resolveBrandKitTarget(prisma, storeId);
  if (!target) {
    return { ok: false, code: 'STORE_NOT_FOUND', message: 'Store or draft not found' };
  }

  const data = {};
  if (patch.tone !== undefined) data.brandTone = patch.tone;
  if (patch.style !== undefined) data.brandStyle = patch.style;
  if (patch.colors !== undefined) {
    data.brandColors = patch.colors === null ? null : serializeBrandColors(patch.colors);
  }

  let updated;
  if (target.kind === 'draft') {
    updated = await prisma.draftStore.update({
      where: { id: target.record.id },
      data,
      select: BRAND_KIT_SELECT,
    });
  } else {
    updated = await prisma.business.update({
      where: { id: target.record.id },
      data,
      select: BRAND_KIT_SELECT,
    });
  }

  const industry =
    target.kind === 'business'
      ? updated.type
      : (() => {
          try {
            const input =
              typeof target.record.input === 'string'
                ? JSON.parse(target.record.input)
                : target.record.input || {};
            return input.businessType || input.storeType || '';
          } catch {
            return '';
          }
        })();

  return {
    ok: true,
    targetKind: target.kind,
    storeId: updated.id,
    brandKit: brandKitFromRecord(updated, industry),
  };
}

export default {
  parseBrandColorsField,
  serializeBrandColors,
  brandKitFromRecord,
  validateBrandKitPatch,
  resolveBrandKitTarget,
  updateBrandKitForStoreId,
};
