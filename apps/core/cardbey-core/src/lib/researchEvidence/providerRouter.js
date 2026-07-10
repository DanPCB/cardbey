import { createProviderRegistry } from './providerRegistry.js';

function push(planned, providerId, reason) {
  if (!providerId) return;
  if (planned.some((row) => row.providerId === providerId)) return;
  planned.push({ providerId, reason });
}

export function selectResearchProviders(input = {}) {
  const registry = createProviderRegistry();
  /** @type {Array<{ providerId: string, reason: string }>} */
  const planned = [];
  const category = String(input.category ?? input.businessType ?? '').toLowerCase();
  const website = String(input.website ?? '').toLowerCase();
  const hasUploads = Boolean(String(input.ocrText ?? '').trim());
  const social = input.socialLinks && typeof input.socialLinks === 'object' ? input.socialLinks : {};

  if (website) push(planned, 'official_website', 'website_provided');
  if (input.businessName) push(planned, 'google_business_profile', 'business_identity_lookup');
  if (social.facebook) push(planned, 'facebook_business_page', 'social_link_provided');
  if (social.instagram) push(planned, 'instagram_business_profile', 'social_link_provided');
  if (hasUploads) push(planned, 'uploaded_image_ocr', 'uploaded_document');

  if (/beaut|salon|spa|wellness|nail|barber/.test(category) || website.includes('bookwell') || website.includes('fresha')) {
    push(planned, website.includes('fresha') ? 'fresha' : 'bookwell', 'beauty_vertical');
  }
  if (/restaurant|cafe|food/.test(category)) {
    push(planned, 'official_website', 'menu_lookup');
    if (hasUploads) push(planned, 'uploaded_menu', 'menu_ocr');
  }
  if (/tile|trade|builder|plumb|electric/.test(category)) {
    push(planned, 'uploaded_brochure', 'trade_brochure');
  }

  push(planned, 'ai_template', 'fallback_if_needed');

  return planned
    .map((row) => {
      const provider = registry.get(row.providerId);
      return provider ? { ...provider, reason: row.reason } : null;
    })
    .filter(Boolean);
}
