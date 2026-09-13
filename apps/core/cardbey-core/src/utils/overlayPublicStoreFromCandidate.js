/**
 * Format Business.tradingHours / candidate.openingHours for public display.
 * Accepts string, { summary }, { raw }, { weekday_text[] }, { lines[] }.
 */

/**
 * @param {unknown} hours
 * @returns {string | null}
 */
export function formatPublicHoursDisplay(hours) {
  if (hours == null) return null;
  if (typeof hours === 'string') {
    const t = hours.trim();
    return t || null;
  }
  if (typeof hours !== 'object' || Array.isArray(hours)) return null;
  /** @type {Record<string, unknown>} */
  const obj = hours;
  if (typeof obj.summary === 'string' && obj.summary.trim()) return obj.summary.trim();
  if (typeof obj.raw === 'string' && obj.raw.trim()) return obj.raw.trim();
  if (Array.isArray(obj.weekday_text)) {
    const lines = obj.weekday_text.map((x) => String(x).trim()).filter(Boolean);
    return lines.length ? lines.join(' · ') : null;
  }
  if (Array.isArray(obj.lines)) {
    const lines = obj.lines.map((x) => String(x).trim()).filter(Boolean);
    return lines.length ? lines.join(' · ') : null;
  }
  if (Array.isArray(obj.weekdayDescriptions)) {
    const lines = obj.weekdayDescriptions.map((x) => String(x).trim()).filter(Boolean);
    return lines.length ? lines.join(' · ') : null;
  }
  return null;
}

/**
 * Fill null/empty public store contact + hours from a linked BusinessCandidate.
 * Does not overwrite non-empty Business fields.
 *
 * @param {Record<string, unknown>} publicStore
 * @param {object | null | undefined} candidate
 * @returns {Record<string, unknown>}
 */
export function overlayPublicStoreFromCandidate(publicStore, candidate) {
  if (!publicStore || !candidate || typeof candidate !== 'object') return publicStore;

  const contact =
    publicStore.contact && typeof publicStore.contact === 'object' && !Array.isArray(publicStore.contact)
      ? { .../** @type {Record<string, unknown>} */ (publicStore.contact) }
      : {};

  const pick = (current, next) => {
    if (current != null && String(current).trim()) return current;
    if (next == null) return current ?? null;
    const s = String(next).trim();
    return s || current || null;
  };

  contact.phone = pick(contact.phone, candidate.phone);
  contact.email = pick(contact.email, candidate.email);
  contact.website = pick(contact.website, candidate.website);
  contact.address = pick(contact.address, candidate.address);
  contact.suburb = pick(contact.suburb, candidate.suburb);
  contact.state = pick(contact.state, candidate.state);
  contact.postcode = pick(contact.postcode, candidate.postcode);

  publicStore.contact = contact;
  if (!publicStore.phone) publicStore.phone = contact.phone ?? null;
  if (!publicStore.email) publicStore.email = contact.email ?? null;
  if (!publicStore.websiteUrl) publicStore.websiteUrl = contact.website ?? null;

  if (!publicStore.description && typeof candidate.description === 'string' && candidate.description.trim()) {
    publicStore.description = candidate.description.trim();
  }
  if (!publicStore.tagline && typeof candidate.tagline === 'string' && candidate.tagline.trim()) {
    publicStore.tagline = candidate.tagline.trim();
  }
  if (
    (!publicStore.heroUrl && !publicStore.bannerUrl && !publicStore.heroImage) &&
    typeof candidate.heroImageUrl === 'string' &&
    candidate.heroImageUrl.trim()
  ) {
    const url = candidate.heroImageUrl.trim();
    publicStore.heroUrl = url;
    publicStore.bannerUrl = url;
    publicStore.heroImage = url;
  }

  const hoursDisplay =
    (typeof publicStore.hours === 'string' && publicStore.hours.trim()) ||
    formatPublicHoursDisplay(publicStore.tradingHours) ||
    formatPublicHoursDisplay(candidate.openingHours);
  if (hoursDisplay) {
    publicStore.hours = hoursDisplay;
    if (!publicStore.tradingHours) {
      publicStore.tradingHours =
        typeof candidate.openingHours === 'object' && candidate.openingHours
          ? candidate.openingHours
          : { summary: hoursDisplay };
    }
  }

  if (!publicStore.socialLinks && Array.isArray(candidate.socialLinks) && candidate.socialLinks.length) {
    /** @type {Record<string, string>} */
    const links = {};
    for (const entry of candidate.socialLinks) {
      const platform = entry?.platform?.trim?.() ?? entry?.platform;
      const url = entry?.url?.trim?.() ?? entry?.url;
      if (platform && url) links[String(platform)] = String(url);
    }
    if (Object.keys(links).length) publicStore.socialLinks = links;
  }

  return publicStore;
}
