/**
 * Store contact intake: parse address, build map URL, apply scraped contact + hero/logo to DraftStore.
 */

import {
  applyPipelineGeneratedHeroImage,
  getExistingVideoUrlFromPreview,
  readCanonicalHeroFromPreview,
} from './draftPreviewHeroSync.js';

const AU_STATES = ['NSW', 'VIC', 'QLD', 'SA', 'WA', 'TAS', 'NT', 'ACT'];

/**
 * @param {string | null | undefined} address
 * @returns {string | null}
 */
export function buildMapUrl(address) {
  if (!address || typeof address !== 'string' || !address.trim()) return null;
  const encoded = encodeURIComponent(address.trim());
  return `https://www.google.com/maps/search/?api=1&query=${encoded}`;
}

/**
 * Rough AU address component extraction (no geocoding).
 * @param {string | null | undefined} address
 * @returns {{ suburb: string | null, state: string | null, postcode: string | null, country: string | null }}
 */
export function parseAddress(address) {
  if (!address || typeof address !== 'string' || !address.trim()) {
    return { suburb: null, state: null, postcode: null, country: null };
  }
  const text = address.trim();
  let state = null;
  for (const st of AU_STATES) {
    const re = new RegExp(`\\b${st}\\b`, 'i');
    if (re.test(text)) {
      state = st;
      break;
    }
  }
  const postcodeMatches = text.match(/\b(\d{4})\b/g);
  const postcode = postcodeMatches?.length ? postcodeMatches[postcodeMatches.length - 1] : null;
  const country = state ? 'Australia' : null;
  let suburb = null;
  if (state) {
    const beforeState = text.split(new RegExp(`\\b${state}\\b`, 'i'))[0] || '';
    const parts = beforeState
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length > 0) {
      suburb = parts[parts.length - 1].replace(/\b\d{4}\b/g, '').trim() || null;
    }
  }
  return { suburb, state, postcode, country };
}

/**
 * @param {unknown} url
 * @returns {boolean}
 */
export function isValidImageUrl(url) {
  if (!url || typeof url !== 'string') return false;
  if (!url.startsWith('http')) return false;
  if (url.length < 12) return false;
  return true;
}

/**
 * @param {object | null | undefined} meta
 * @returns {object | null}
 */
export function buildContactIntakeFromMissionMeta(meta) {
  if (!meta || typeof meta !== 'object') return null;
  const address = meta.address ?? meta.location ?? null;
  const parsed = parseAddress(typeof address === 'string' ? address : null);
  return {
    phone: meta.phone ?? null,
    email: meta.email ?? null,
    websiteUrl: meta.websiteUrl ?? meta.socialImport?.sourceUrl ?? null,
    address: typeof address === 'string' ? address : null,
    suburb: meta.suburb ?? parsed.suburb,
    state: meta.state ?? parsed.state,
    postcode: meta.postcode ?? parsed.postcode,
    country: meta.country ?? parsed.country,
    mapUrl: meta.mapUrl ?? buildMapUrl(typeof address === 'string' ? address : null),
    lat: meta.lat ?? null,
    lng: meta.lng ?? null,
    coverPhoto: meta.heroImageUrl ?? meta.heroMediaUrl ?? null,
    profilePhoto: meta.avatarUrl ?? meta.logoUrl ?? null,
    heroImageUrl: meta.heroImageUrl ?? meta.heroMediaUrl ?? null,
    logoUrl: meta.avatarUrl ?? meta.logoUrl ?? null,
  };
}

/**
 * @param {unknown} raw
 * @returns {object}
 */
export function parsePreviewJson(raw) {
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return { ...raw };
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return typeof parsed === 'object' && parsed && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} draftId
 * @param {object} intake
 */
export async function applyStoreContactIntakeToDraft(prisma, draftId, intake) {
  if (!draftId || !intake || typeof intake !== 'object') return null;

  const draft = await prisma.draftStore.findUnique({
    where: { id: draftId },
    select: { preview: true },
  });
  if (!draft) return null;

  const prevPreview = parsePreviewJson(draft.preview);
  const prevMeta = prevPreview.meta && typeof prevPreview.meta === 'object' ? { ...prevPreview.meta } : {};

  prevPreview.contact = {
    phone: intake.phone ?? null,
    email: intake.email ?? null,
    website: intake.websiteUrl ?? null,
    address: intake.address ?? null,
    mapUrl: intake.mapUrl ?? null,
  };

  const heroCandidate = isValidImageUrl(intake.heroImageUrl)
    ? intake.heroImageUrl
    : isValidImageUrl(intake.coverPhoto)
      ? intake.coverPhoto
      : null;
  const existingHero = readCanonicalHeroFromPreview(prevPreview);
  if (heroCandidate && !existingHero.heroImage && !getExistingVideoUrlFromPreview(prevPreview)) {
    applyPipelineGeneratedHeroImage(prevPreview, heroCandidate, { writer: 'storeContactIntake', draftId });
    prevPreview.hero = {
      ...(prevPreview.hero && typeof prevPreview.hero === 'object' ? prevPreview.hero : {}),
      imageUrl: heroCandidate,
      imageSource: 'imported',
    };
    prevPreview.heroImageUrl = heroCandidate;
    prevMeta.heroImageSource = 'imported';
  }

  const logoCandidate = isValidImageUrl(intake.logoUrl)
    ? intake.logoUrl
    : isValidImageUrl(intake.profilePhoto)
      ? intake.profilePhoto
      : null;
  const existingAvatar = prevPreview.avatarUrl || prevPreview.avatar?.imageUrl;
  if (logoCandidate && !existingAvatar) {
    prevPreview.avatarUrl = logoCandidate;
    prevPreview.avatar = { imageUrl: logoCandidate };
    prevMeta.avatarImageSource = 'imported';
  }
  prevPreview.meta = prevMeta;

  const columnData = {
    phone: intake.phone ?? null,
    email: intake.email ?? null,
    websiteUrl: intake.websiteUrl ?? null,
    address: intake.address ?? null,
    suburb: intake.suburb ?? null,
    state: intake.state ?? null,
    postcode: intake.postcode ?? null,
    country: intake.country ?? null,
    mapUrl: intake.mapUrl ?? null,
    lat: intake.lat ?? null,
    lng: intake.lng ?? null,
    preview: prevPreview,
  };

  await prisma.draftStore.update({
    where: { id: draftId },
    data: columnData,
  });

  return { contact: prevPreview.contact, preview: prevPreview };
}

/**
 * Resolve contact fields for publish: never overwrite manually-set Business values.
 * @param {object | null | undefined} existingBusiness
 * @param {object | null | undefined} draft
 * @param {object | null | undefined} rawPreview
 */
export function resolveContactFieldsForPublish(existingBusiness, draft, rawPreview) {
  const fromPreview =
    rawPreview?.contact && typeof rawPreview.contact === 'object' ? rawPreview.contact : {};
  const hoursFromPreview =
    (typeof fromPreview.hours === 'string' && fromPreview.hours.trim()) ||
    (rawPreview?.hours && typeof rawPreview.hours === 'object' ? rawPreview.hours : null) ||
    (typeof rawPreview?.hours === 'string' && rawPreview.hours.trim()) ||
    null;
  const tradingHours =
    draft?.tradingHours ??
    existingBusiness?.tradingHours ??
    (hoursFromPreview
      ? typeof hoursFromPreview === 'object'
        ? hoursFromPreview
        : { summary: hoursFromPreview }
      : null);
  const draftContact = {
    phone: draft?.phone ?? fromPreview.phone ?? null,
    email: draft?.email ?? fromPreview.email ?? null,
    websiteUrl: draft?.websiteUrl ?? fromPreview.website ?? null,
    address: draft?.address ?? fromPreview.address ?? null,
    suburb: draft?.suburb ?? null,
    state: draft?.state ?? null,
    postcode: draft?.postcode ?? null,
    country: draft?.country ?? null,
    mapUrl: draft?.mapUrl ?? fromPreview.mapUrl ?? null,
    lat: draft?.lat ?? null,
    lng: draft?.lng ?? null,
    tradingHours,
  };
  const existing = existingBusiness ?? {};
  return {
    phone: existing.phone ?? draftContact.phone,
    email: existing.email ?? draftContact.email,
    websiteUrl: existing.websiteUrl ?? draftContact.websiteUrl,
    address: existing.address ?? draftContact.address,
    suburb: existing.suburb ?? draftContact.suburb,
    state: existing.state ?? draftContact.state,
    postcode: existing.postcode ?? draftContact.postcode,
    country: existing.country ?? draftContact.country,
    mapUrl: existing.mapUrl ?? draftContact.mapUrl,
    lat: existing.lat ?? draftContact.lat,
    lng: existing.lng ?? draftContact.lng,
    tradingHours: existing.tradingHours ?? draftContact.tradingHours,
  };
}
