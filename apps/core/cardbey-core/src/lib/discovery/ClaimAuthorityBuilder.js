/**
 * ClaimAuthorityBuilder — derive verification methods from scraped social data.
 */

const AU_PHONE_RE = /(?:\+?61\s?|0)(?:4\d{2}[\s-]?\d{3}[\s-]?\d{3}|3[\s-]?\d{4}[\s-]?\d{4})/g;
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

/**
 * @param {object} payload Raw adapter payload
 * @param {object} normalized Normalized store payload
 * @returns {object} claimAuthority object (JSON-serializable)
 */
export function buildClaimAuthority(payload, normalized) {
  const safePayload = payload && typeof payload === 'object' ? payload : {};
  const safeNormalized = normalized && typeof normalized === 'object' ? normalized : {};
  const platform = String(safePayload.platform || safeNormalized.platform || '').toLowerCase();

  const bioText = [
    safePayload.description,
    safePayload.bio,
    safePayload.displayName,
    safeNormalized.businessName,
  ].filter(Boolean).join(' ');

  const contact = safePayload.contact && typeof safePayload.contact === 'object'
    ? safePayload.contact
    : {};

  const phone = extractPhone(bioText) || str(contact.phone);
  const email = extractEmail(bioText) || str(contact.email);

  const socialLinks = safeNormalized.socialLinks && typeof safeNormalized.socialLinks === 'object'
    ? safeNormalized.socialLinks
    : (safePayload.socialLinks && typeof safePayload.socialLinks === 'object' ? safePayload.socialLinks : {});

  const googlePlaceId = extractGooglePlaceId(socialLinks, safePayload);
  const tiktokHandle = extractTiktokHandle(safePayload.sourceUrl || safeNormalized.sourceUrl, socialLinks);
  const facebookPageId = extractFacebookPageId(socialLinks, safePayload.sourceUrl);

  const methods = [];

  if (platform === 'google' && googlePlaceId) {
    methods.push('google_verify');
  }
  if (phone) {
    methods.push('phone_otp');
  }
  if (email) {
    methods.push('email_otp');
  }
  if (platform === 'tiktok') {
    methods.push('tiktok_handle');
  }
  if (platform === 'facebook') {
    methods.push('facebook_page');
  }
  methods.push('manual_review');

  return {
    methods,
    phone: phone || null,
    email: email || null,
    googlePlaceId: googlePlaceId || null,
    tiktokHandle: tiktokHandle || null,
    facebookPageId: facebookPageId || null,
    verifiedAt: null,
    verifiedBy: null,
  };
}

function str(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function extractPhone(text) {
  if (!text) return '';
  const matches = String(text).match(AU_PHONE_RE);
  return matches?.[0]?.trim() || '';
}

function extractEmail(text) {
  if (!text) return '';
  const matches = String(text).match(EMAIL_RE);
  return matches?.[0]?.trim() || '';
}

function extractTiktokHandle(sourceUrl, socialLinks) {
  const urls = [sourceUrl, socialLinks?.tiktok].filter(Boolean);
  for (const url of urls) {
    try {
      const u = new URL(String(url));
      const m = u.pathname.match(/@([^/]+)/);
      if (m?.[1]) return `@${decodeURIComponent(m[1])}`;
    } catch {
      /* skip */
    }
  }
  return null;
}

function extractGooglePlaceId(socialLinks, payload) {
  if (payload.googlePlaceId) return String(payload.googlePlaceId);
  const googleUrl = socialLinks?.google || socialLinks?.maps || '';
  if (!googleUrl) return null;
  const placeMatch = String(googleUrl).match(/place_id[=:]([A-Za-z0-9_-]+)/i);
  if (placeMatch?.[1]) return placeMatch[1];
  const cidMatch = String(googleUrl).match(/[?&]cid=(\d+)/);
  if (cidMatch?.[1]) return `cid:${cidMatch[1]}`;
  return null;
}

function extractFacebookPageId(socialLinks, sourceUrl) {
  const fbUrl = socialLinks?.facebook || (String(sourceUrl || '').includes('facebook.com') ? sourceUrl : '');
  if (!fbUrl) return null;
  try {
    const u = new URL(String(fbUrl));
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts[0] === 'pages' && parts[1]) return parts[1];
    if (parts[0]) return parts[0];
  } catch {
    /* skip */
  }
  return null;
}
