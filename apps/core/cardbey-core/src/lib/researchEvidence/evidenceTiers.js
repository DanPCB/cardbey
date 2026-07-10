export const EVIDENCE_TIERS = {
  BUSINESS_CONTROLLED: 1,
  INDUSTRY_PLATFORM: 2,
  PUBLIC_DIRECTORY: 3,
  BUSINESS_DOCUMENT: 4,
  CUSTOMER_CONTENT: 5,
  SOCIAL_CONTENT: 6,
  AI_FALLBACK: 7,
};

export const PROVIDER_CATALOG = {
  official_website: { providerName: 'Official Website', tier: EVIDENCE_TIERS.BUSINESS_CONTROLLED },
  google_business_profile: { providerName: 'Google Business Profile', tier: EVIDENCE_TIERS.BUSINESS_CONTROLLED },
  apple_business_connect: { providerName: 'Apple Business Connect', tier: EVIDENCE_TIERS.BUSINESS_CONTROLLED },
  facebook_business_page: { providerName: 'Facebook Business Page', tier: EVIDENCE_TIERS.BUSINESS_CONTROLLED },
  instagram_business_profile: { providerName: 'Instagram Business Profile', tier: EVIDENCE_TIERS.BUSINESS_CONTROLLED },
  linkedin_company_page: { providerName: 'LinkedIn Company Page', tier: EVIDENCE_TIERS.BUSINESS_CONTROLLED },
  youtube_channel: { providerName: 'YouTube Channel', tier: EVIDENCE_TIERS.BUSINESS_CONTROLLED },
  tiktok_business_account: { providerName: 'TikTok Business Account', tier: EVIDENCE_TIERS.BUSINESS_CONTROLLED },
  fresha: { providerName: 'Fresha', tier: EVIDENCE_TIERS.INDUSTRY_PLATFORM },
  bookwell: { providerName: 'Bookwell', tier: EVIDENCE_TIERS.INDUSTRY_PLATFORM },
  timely: { providerName: 'Timely', tier: EVIDENCE_TIERS.INDUSTRY_PLATFORM },
  vagaro: { providerName: 'Vagaro', tier: EVIDENCE_TIERS.INDUSTRY_PLATFORM },
  treatwell: { providerName: 'Treatwell', tier: EVIDENCE_TIERS.INDUSTRY_PLATFORM },
  mindbody: { providerName: 'Mindbody', tier: EVIDENCE_TIERS.INDUSTRY_PLATFORM },
  opentable: { providerName: 'OpenTable', tier: EVIDENCE_TIERS.INDUSTRY_PLATFORM },
  quandoo: { providerName: 'Quandoo', tier: EVIDENCE_TIERS.INDUSTRY_PLATFORM },
  thefork: { providerName: 'TheFork', tier: EVIDENCE_TIERS.INDUSTRY_PLATFORM },
  tripadvisor: { providerName: 'Tripadvisor', tier: EVIDENCE_TIERS.INDUSTRY_PLATFORM },
  yelp: { providerName: 'Yelp', tier: EVIDENCE_TIERS.INDUSTRY_PLATFORM },
  zomato: { providerName: 'Zomato', tier: EVIDENCE_TIERS.INDUSTRY_PLATFORM },
  hipages: { providerName: 'hipages', tier: EVIDENCE_TIERS.INDUSTRY_PLATFORM },
  oneflare: { providerName: 'Oneflare', tier: EVIDENCE_TIERS.INDUSTRY_PLATFORM },
  serviceseeking: { providerName: 'ServiceSeeking', tier: EVIDENCE_TIERS.INDUSTRY_PLATFORM },
  hotdoc: { providerName: 'HotDoc', tier: EVIDENCE_TIERS.INDUSTRY_PLATFORM },
  healthengine: { providerName: 'Healthengine', tier: EVIDENCE_TIERS.INDUSTRY_PLATFORM },
  domain: { providerName: 'Domain', tier: EVIDENCE_TIERS.INDUSTRY_PLATFORM },
  realestate_com_au: { providerName: 'realestate.com.au', tier: EVIDENCE_TIERS.INDUSTRY_PLATFORM },
  booking_com: { providerName: 'Booking.com', tier: EVIDENCE_TIERS.INDUSTRY_PLATFORM },
  expedia: { providerName: 'Expedia', tier: EVIDENCE_TIERS.INDUSTRY_PLATFORM },
  agoda: { providerName: 'Agoda', tier: EVIDENCE_TIERS.INDUSTRY_PLATFORM },
  hotels_com: { providerName: 'Hotels.com', tier: EVIDENCE_TIERS.INDUSTRY_PLATFORM },
  airbnb: { providerName: 'Airbnb', tier: EVIDENCE_TIERS.INDUSTRY_PLATFORM },
  yellow_pages: { providerName: 'Yellow Pages', tier: EVIDENCE_TIERS.PUBLIC_DIRECTORY },
  white_pages: { providerName: 'White Pages', tier: EVIDENCE_TIERS.PUBLIC_DIRECTORY },
  chamber_of_commerce: { providerName: 'Chamber of Commerce', tier: EVIDENCE_TIERS.PUBLIC_DIRECTORY },
  local_council_directory: { providerName: 'Local Council Directory', tier: EVIDENCE_TIERS.PUBLIC_DIRECTORY },
  government_business_register: { providerName: 'Government Business Register', tier: EVIDENCE_TIERS.PUBLIC_DIRECTORY },
  uploaded_business_card: { providerName: 'Uploaded Business Card', tier: EVIDENCE_TIERS.BUSINESS_DOCUMENT },
  uploaded_menu: { providerName: 'Uploaded Menu', tier: EVIDENCE_TIERS.BUSINESS_DOCUMENT },
  uploaded_brochure: { providerName: 'Uploaded Brochure', tier: EVIDENCE_TIERS.BUSINESS_DOCUMENT },
  uploaded_price_list: { providerName: 'Uploaded Price List', tier: EVIDENCE_TIERS.BUSINESS_DOCUMENT },
  uploaded_catalogue: { providerName: 'Uploaded Catalogue', tier: EVIDENCE_TIERS.BUSINESS_DOCUMENT },
  uploaded_pdf: { providerName: 'Uploaded PDF', tier: EVIDENCE_TIERS.BUSINESS_DOCUMENT },
  uploaded_image_ocr: { providerName: 'Uploaded Image OCR', tier: EVIDENCE_TIERS.BUSINESS_DOCUMENT },
  google_reviews: { providerName: 'Google Reviews', tier: EVIDENCE_TIERS.CUSTOMER_CONTENT },
  facebook_reviews: { providerName: 'Facebook Reviews', tier: EVIDENCE_TIERS.CUSTOMER_CONTENT },
  reddit: { providerName: 'Reddit', tier: EVIDENCE_TIERS.CUSTOMER_CONTENT },
  community_forums: { providerName: 'Community Forums', tier: EVIDENCE_TIERS.CUSTOMER_CONTENT },
  review_snippets: { providerName: 'Review Snippets', tier: EVIDENCE_TIERS.CUSTOMER_CONTENT },
  instagram_posts: { providerName: 'Instagram Posts', tier: EVIDENCE_TIERS.SOCIAL_CONTENT },
  facebook_posts: { providerName: 'Facebook Posts', tier: EVIDENCE_TIERS.SOCIAL_CONTENT },
  tiktok_posts: { providerName: 'TikTok Posts', tier: EVIDENCE_TIERS.SOCIAL_CONTENT },
  youtube_shorts: { providerName: 'YouTube Shorts', tier: EVIDENCE_TIERS.SOCIAL_CONTENT },
  ai_template: { providerName: 'AI Template', tier: EVIDENCE_TIERS.AI_FALLBACK },
  ai_generated_copy: { providerName: 'AI Generated Copy', tier: EVIDENCE_TIERS.AI_FALLBACK },
  ai_generated_catalog: { providerName: 'AI Generated Catalog', tier: EVIDENCE_TIERS.AI_FALLBACK },
};

export function getProviderTier(providerId) {
  return PROVIDER_CATALOG[providerId]?.tier ?? EVIDENCE_TIERS.AI_FALLBACK;
}

export function getProviderName(providerId) {
  return PROVIDER_CATALOG[providerId]?.providerName ?? providerId.replace(/_/g, ' ');
}

export function getTierLabel(tier) {
  const labels = {
    1: 'Tier 1',
    2: 'Tier 2',
    3: 'Tier 3',
    4: 'Tier 4',
    5: 'Tier 5',
    6: 'Tier 6',
    7: 'Tier 7',
  };
  return labels[tier] ?? `Tier ${tier ?? '?'}`;
}
