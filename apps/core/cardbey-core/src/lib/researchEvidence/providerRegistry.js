import { getProviderName, getProviderTier } from './evidenceTiers.js';

export function createProviderRegistry() {
  return new Map(Object.entries({
    official_website: { id: 'official_website', name: getProviderName('official_website'), tier: getProviderTier('official_website') },
    google_business_profile: { id: 'google_business_profile', name: getProviderName('google_business_profile'), tier: getProviderTier('google_business_profile') },
    facebook_business_page: { id: 'facebook_business_page', name: getProviderName('facebook_business_page'), tier: getProviderTier('facebook_business_page') },
    instagram_business_profile: { id: 'instagram_business_profile', name: getProviderName('instagram_business_profile'), tier: getProviderTier('instagram_business_profile') },
    bookwell: { id: 'bookwell', name: getProviderName('bookwell'), tier: getProviderTier('bookwell') },
    fresha: { id: 'fresha', name: getProviderName('fresha'), tier: getProviderTier('fresha') },
    timely: { id: 'timely', name: getProviderName('timely'), tier: getProviderTier('timely') },
    mindbody: { id: 'mindbody', name: getProviderName('mindbody'), tier: getProviderTier('mindbody') },
    uploaded_business_card: { id: 'uploaded_business_card', name: getProviderName('uploaded_business_card'), tier: getProviderTier('uploaded_business_card') },
    uploaded_menu: { id: 'uploaded_menu', name: getProviderName('uploaded_menu'), tier: getProviderTier('uploaded_menu') },
    uploaded_brochure: { id: 'uploaded_brochure', name: getProviderName('uploaded_brochure'), tier: getProviderTier('uploaded_brochure') },
    uploaded_image_ocr: { id: 'uploaded_image_ocr', name: getProviderName('uploaded_image_ocr'), tier: getProviderTier('uploaded_image_ocr') },
    ai_template: { id: 'ai_template', name: getProviderName('ai_template'), tier: getProviderTier('ai_template') },
  }));
}

export function getResearchProvider(registry, providerId) {
  return registry.get(providerId) ?? null;
}
