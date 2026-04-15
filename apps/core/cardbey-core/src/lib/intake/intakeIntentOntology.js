/**
 * Intent ontology for Performer Intake V2 — families, subtypes, registry-aligned candidates.
 * Used only for resolution + clarify shaping; does not execute tools.
 */

export const INTENT_FAMILIES = [
  'store_setup',
  'store_improvement',
  'content_edit',
  'promotion_campaign',
  'analytics_reporting',
  'website_edit',
  'devices_signage',
  'general_help',
];

/**
 * @typedef {object} IntentSubtypeDef
 * @property {string} family
 * @property {string} subtype
 * @property {string} description
 * @property {string[]} candidateTools
 * @property {string} defaultTool
 * @property {('store'|'draft')[]} requiredContext
 * @property {string} clarifyStrategy
 * @property {RegExp[]} matchPatterns — any match scores this subtype
 */

/** @type {IntentSubtypeDef[]} */
export const INTENT_SUBTYPES = [
  {
    family: 'store_setup',
    subtype: 'create_store_flow',
    description: 'User wants to create or open a new store or mini-site.',
    candidateTools: ['create_store'],
    defaultTool: 'create_store',
    requiredContext: [],
    clarifyStrategy: 'store_setup_entry',
    matchPatterns: [
      /\b(create|build|set\s+up|make|start)\s+(a\s+)?(store|shop)\b/i,
      /\bopen\s+a\s+(new\s+)?(store|shop)\b/i,
      /\bcreate\s+(a\s+)?(store|shop)\s+for\b/i,
      /\bbuild\s+(a\s+)?(store|shop)\s+for\b/i,
      /\bset\s+up\s+(a\s+)?(store|shop)\s+for\b/i,
      /\bmake\s+(a\s+)?(store|shop)\s+for\b/i,
      /\bstart\s+(a\s+)?(store|shop)\s+for\b/i,
      /\bnew\s+(store|shop)\s+for\b/i,
      /\bmini\s*(website|site)\b/i,
      /\bcreate\s+(a\s+)?(store|shop)\s+called\b/i,
      /\bbuild\s+(a\s+)?(store|shop)\s+called\b/i,
    ],
  },
  {
    family: 'store_improvement',
    subtype: 'improve_store_general',
    description: 'Broad request to improve, fix, or optimize the store experience.',
    candidateTools: ['analyze_store', 'generate_tags', 'rewrite_descriptions', 'improve_hero'],
    defaultTool: 'analyze_store',
    requiredContext: ['store'],
    clarifyStrategy: 'improvement_menu',
    matchPatterns: [
      /\bimprove\s+(my\s+)?store\b/i,
      /\bbetter\s+(my\s+)?store\b/i,
      /\boptimize\s+(my\s+)?store\b/i,
      /\bfix\s+(my\s+)?store\b/i,
    ],
  },
  {
    family: 'content_edit',
    subtype: 'change_headline',
    description: 'Text, headline, hero copy, or wording change (not image-only).',
    candidateTools: ['code_fix', 'improve_hero', 'rewrite_descriptions'],
    defaultTool: 'code_fix',
    requiredContext: [],
    clarifyStrategy: 'text_vs_hero',
    matchPatterns: [
      /\b(headline|hero\s*title|tagline|subtitle|wording|copy)\b/i,
      /\bfix\s+(the\s+)?(headline|title|text)\b/i,
      /\bchange\s+(the\s+)?(headline|title|text)\b/i,
      /\brewrite\s+(the\s+)?(headline|title)\b/i,
    ],
  },
  {
    family: 'promotion_campaign',
    subtype: 'set_discount',
    description: 'Discounts, offers, coupons, sale targets, or percent-off.',
    candidateTools: ['create_offer', 'create_promotion', 'launch_campaign'],
    defaultTool: 'create_offer',
    requiredContext: ['store'],
    clarifyStrategy: 'offer_vs_campaign_plan',
    matchPatterns: [
      /\b(sale|discount|offer|promo|coupon|markdown)\b/i,
      /%/,
      /\bpercent(age)?\b/i,
      /\btarget\b.*\d/,
    ],
  },
  {
    family: 'analytics_reporting',
    subtype: 'sales_orders_report',
    description: 'Sales, orders, revenue, KPIs, or reporting.',
    candidateTools: ['orders_report', 'analyze_store'],
    defaultTool: 'orders_report',
    requiredContext: ['store'],
    clarifyStrategy: 'report_vs_analyze',
    matchPatterns: [
      /\b(report|reports|sales|revenue|orders|analytics|kpi|metric)\b/i,
      /\bhow\s+(many|much)\b/i,
    ],
  },
  {
    family: 'website_edit',
    subtype: 'website_content',
    description: 'Website or microsite content (overlaps code_fix; prefer when “website” explicit).',
    candidateTools: ['code_fix', 'improve_hero'],
    defaultTool: 'code_fix',
    requiredContext: [],
    clarifyStrategy: 'website_text',
    matchPatterns: [/\b(website|microsite|site)\b.*\b(text|copy|headline|title)\b/i],
  },
  {
    family: 'website_edit',
    subtype: 'change_hero_image',
    description: 'User wants to update hero or banner image (not text-only).',
    candidateTools: ['improve_hero', 'smart_visual'],
    defaultTool: 'improve_hero',
    requiredContext: ['store'],
    clarifyStrategy: 'missing_param',
    matchPatterns: [
      /\b(hero|banner)\s+image\b/i,
      /\bhero\s+photo\b/i,
      /\bbanner\s+photo\b/i,
      /\bcover\s+image\b/i,
      /\bbackground\s+image\b/i,
      /\bchange\s+(the\s+)?(hero|banner)\s+image\b/i,
      /\bupdate\s+(the\s+)?hero\b/i,
      /\breplace\s+(the\s+)?banner\b/i,
      /\breplace\s+(the\s+)?(hero\s+)?(image|photo|picture)\b/i,
      /\bchange\s+(the\s+)?(hero|banner)\b/i,
      /\bchange\s+(the\s+)?(photo|picture)\b.*\b(hero|banner|homepage|home\s*page|store\s*front)\b/i,
      /\b(hero|banner|homepage)\b.*\bchange\s+(the\s+)?(photo|picture)\b/i,
      /\b(different|another|other)\s+photo\b.*\b(hero|banner)\b/i,
    ],
  },
  {
    family: 'devices_signage',
    subtype: 'screens_devices',
    description: 'In-store screens, playlists, device push.',
    candidateTools: ['signage.list-devices', 'signage.publish-to-devices'],
    defaultTool: 'signage.list-devices',
    requiredContext: ['store'],
    clarifyStrategy: 'list_vs_push',
    matchPatterns: [/\b(screen|screens|display|signage|tv|playlist|device)\b/i],
  },
  {
    family: 'general_help',
    subtype: 'capabilities',
    description: 'What can you do, help, unclear ask.',
    candidateTools: ['general_chat', 'analyze_store'],
    defaultTool: 'general_chat',
    requiredContext: [],
    clarifyStrategy: 'open_help',
    matchPatterns: [/\bwhat\s+can\s+you\s+do\b/i, /\bhelp\b/i, /\bhow\s+do\s+i\b/i],
  },
];

/** @param {string} toolName */
export function inferFamilyFromTool(toolName) {
  const t = String(toolName ?? '').trim();
  const map = {
    create_store: 'store_setup',
    analyze_store: 'store_improvement',
    generate_tags: 'store_improvement',
    rewrite_descriptions: 'store_improvement',
    improve_hero: 'store_improvement',
    code_fix: 'content_edit',
    create_offer: 'promotion_campaign',
    create_promotion: 'promotion_campaign',
    launch_campaign: 'promotion_campaign',
    market_research: 'promotion_campaign',
    orders_report: 'analytics_reporting',
    'signage.list-devices': 'devices_signage',
    'signage.publish-to-devices': 'devices_signage',
    smart_visual: 'content_edit',
    general_chat: 'general_help',
  };
  return map[t] ?? null;
}
