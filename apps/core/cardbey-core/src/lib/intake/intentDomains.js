/**
 * Domain taxonomy — single source of truth for post-classifier validation.
 * Maps user phrasing domains to canonical intake tool names.
 */

/** @typedef {'DESIGN' | 'MARKETING' | 'STORE' | 'VIDEO' | 'LOYALTY' | 'CONTENT'} IntentDomainKey */

/** @type {Record<IntentDomainKey, { name: string, tools: string[], patterns: RegExp[] }>} */
export const DOMAINS = {
  DESIGN: {
    name: 'design',
    tools: [
      'create_promotion_graphic',
      'smart_visual',
      'generate_promo_image',
      'generate_promotion_asset',
      'edit_artifact',
      'generate_poster',
      'mutate_poster',
      'improve_hero',
      'update_store_hero',
    ],
    patterns: [
      /\bgraphic\b/i,
      /\bvisual\b/i,
      /\bdesign\b/i,
      /\bposter\b/i,
      /\bbanner\b/i,
      /\bflyer\b/i,
      /\bartwork\b/i,
      /\bpromotion\b[\s\S]{0,20}\b(graphic|image|visual)\b/i,
      /\bbrand\b[\s\S]{0,12}\b(graphic|visual)\b/i,
    ],
  },
  MARKETING: {
    name: 'marketing',
    tools: [
      'launch_campaign',
      'create_offer',
      'create_promotion',
      'activate_campaigns',
      'publish_to_social',
      'market_research',
      'connect_social_account',
    ],
    patterns: [
      /\bcampaign\b/i,
      /\bmarketing\b/i,
      /\boffer\b/i,
      /\blaunch\b[\s\S]{0,16}\bcampaign\b/i,
      /\bcreate\b[\s\S]{0,16}\boffer\b/i,
    ],
  },
  STORE: {
    name: 'store',
    tools: [
      'create_store',
      'create_mini_website',
      'publish_store',
      'analyze_store',
      'audit_store_completeness',
      'generate_health_report',
      'start_build_store',
    ],
    patterns: [
      /\bcreate\b[\s\S]{0,16}\b(store|shop|website)\b/i,
      /\bbuild\b[\s\S]{0,16}\b(store|shop|website)\b/i,
      /\bpublish\b[\s\S]{0,16}\bstore\b/i,
      /\baudit\b[\s\S]{0,16}\bstore\b/i,
    ],
  },
  VIDEO: {
    name: 'video',
    tools: ['create_video', 'generate_video', 'video_generate_multimodal'],
    patterns: [/\bvideo\b/i, /\bfilm\b/i, /\bpromotional\b[\s\S]{0,12}\bvideo\b/i],
  },
  LOYALTY: {
    name: 'loyalty',
    tools: ['setup_loyalty_program'],
    patterns: [
      /\bloyalty\b/i,
      /\brewards?\b/i,
      /\bpoints\s+program\b/i,
      /\bstamp\s+card\b/i,
      /\bcustomer\b[\s\S]{0,12}\bprogram\b/i,
    ],
  },
  CONTENT: {
    name: 'content',
    tools: [
      'generate_social_posts',
      'generate_tags',
      'rewrite_descriptions',
      'content_creator',
      'ingest_document',
      'scan_document',
    ],
    patterns: [
      /\bcontent\b/i,
      /\bsocial\b[\s\S]{0,12}\bpost\b/i,
      /\btag\b/i,
      /\bingest\b[\s\S]{0,16}\b(document|flyer)\b/i,
      /\bscan\b[\s\S]{0,16}\b(document|flyer)\b/i,
    ],
  },
};

/** @type {IntentDomainKey[]} */
const DOMAIN_ORDER = ['LOYALTY', 'DESIGN', 'VIDEO', 'MARKETING', 'STORE', 'CONTENT'];

/**
 * @param {string | null | undefined} text
 * @returns {IntentDomainKey}
 */
export function getDomainForIntent(text) {
  const msg = String(text ?? '').trim();
  if (!msg) return 'CONTENT';
  for (const key of DOMAIN_ORDER) {
    const domain = DOMAINS[key];
    if (domain.patterns.some((p) => p.test(msg))) return key;
  }
  return 'CONTENT';
}

/**
 * @param {IntentDomainKey | string} domain
 * @returns {string[]}
 */
export function getToolsForDomain(domain) {
  const entry = DOMAINS[/** @type {IntentDomainKey} */ (domain)];
  return entry?.tools ? [...entry.tools] : [];
}

/**
 * @param {string} tool
 * @param {IntentDomainKey} domain
 * @returns {boolean}
 */
export function isToolInDomain(tool, domain) {
  const tools = getToolsForDomain(domain);
  const normalized = String(tool ?? '').trim().toLowerCase();
  return tools.some((t) => t.toLowerCase() === normalized);
}
