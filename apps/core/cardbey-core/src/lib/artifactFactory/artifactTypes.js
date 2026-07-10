/**
 * Canonical artifact type registry — seed types for Universal Artifact Factory.
 */

export const ARTIFACT_TYPES = [
  'promotion_graphic',
  'promotion_video',
  'store_hero',
  'website',
  'landing_page',
  'catalog',
  'menu',
  'flyer',
  'brochure',
  'slideshow',
  'qr_code',
  'promotion_offer',
  'coupon',
  'loyalty_program',
  'invoice',
  'quote',
  'business_card',
  'poster',
  'email_campaign',
  'social_post',
  'story',
  'reel',
  'presentation',
  'digital_signage_playlist',
  'store_profile',
];

/** Legacy tool name → UAF artifact type */
export const TOOL_TO_ARTIFACT_TYPE = {
  create_video: 'promotion_video',
  generate_video: 'promotion_video',
  video_plan: 'promotion_video',
  video_generate_multimodal: 'promotion_video',
  generate_poster: 'poster',
  create_promotion_graphic: 'promotion_graphic',
  generate_slideshow: 'slideshow',
  generate_social_posts: 'social_post',
  create_store: 'store_profile',
  structured_store_build: 'website',
  setup_loyalty_program: 'loyalty_program',
  write_loyalty_program_from_mission: 'loyalty_program',
  create_offer: 'promotion_offer',
  package_campaign_artifact: 'promotion_offer',
  manage_menu_sync: 'menu',
  replace_store_catalog: 'catalog',
};

/**
 * @param {string} toolOrType
 */
export function resolveArtifactType(toolOrType) {
  const key = String(toolOrType ?? '').trim();
  if (!key) return null;
  if (ARTIFACT_TYPES.includes(key)) return key;
  return TOOL_TO_ARTIFACT_TYPE[key] ?? null;
}
