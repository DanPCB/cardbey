/**
 * Public, appropriately accessible source facts for marketing research V1.
 * Qualitative summaries only — no fabricated statistics or private contacts.
 */

export const PUBLIC_RESEARCH_CATALOG = [
  {
    id: 'wb_vietnam',
    tags: ['vietnam', 'sme', 'digital', 'economy', 'vietnamese'],
    targetTypes: ['USER_ACQUISITION'],
    opportunityType: 'MARKET_TREND',
    title: 'Vietnam digital-economy context for SME outreach',
    audience: 'Vietnamese SME owners',
    market: 'vn',
    suggestedAngle: 'Cardbey as an AI business-creation platform under development for SMEs getting online',
    suggestedChannel: 'facebook',
    priority: 'high',
    confidence: 0.72,
    source: {
      url: 'https://www.worldbank.org/en/country/vietnam',
      title: 'World Bank — Vietnam overview',
      type: 'public_institution',
      publishedAt: '2024-01-01',
      freshness: 'institutional_overview',
      summary:
        'The World Bank maintains a public country overview of Vietnam covering development and economic context relevant to SME digitalisation programmes.',
    },
  },
  {
    id: 'dfat_vietnam',
    tags: ['vietnam', 'australia', 'trade', 'market-entry', 'packaging', 'supplier'],
    targetTypes: ['USER_ACQUISITION'],
    opportunityType: 'MARKET_ENTRY',
    title: 'Australia–Vietnam trade relationship as a market-entry narrative',
    audience: 'Vietnamese exporters and Australian SME buyers',
    market: 'vn-au',
    suggestedAngle: 'Help packaging and product SMEs prepare a Cardbey presence before cross-border conversations',
    suggestedChannel: 'facebook',
    priority: 'high',
    confidence: 0.7,
    source: {
      url: 'https://www.dfat.gov.au/geo/vietnam',
      title: 'Australian DFAT — Vietnam country page',
      type: 'public_institution',
      publishedAt: '2024-01-01',
      freshness: 'institutional_overview',
      summary:
        'Australia’s Department of Foreign Affairs and Trade publishes a public Vietnam page covering the bilateral relationship and trade context.',
    },
  },
  {
    id: 'austrade',
    tags: ['australia', 'sme', 'export', 'supplier', 'packaging', 'market-entry'],
    targetTypes: ['USER_ACQUISITION'],
    opportunityType: 'BUSINESS_NEED',
    title: 'Australian trade information for supplier/buyer discovery',
    audience: 'Australia-based SMEs and importers',
    market: 'au',
    suggestedAngle: 'Invite Australian SMEs to preview suppliers via a Cardbey storefront rather than claiming guaranteed access',
    suggestedChannel: 'facebook',
    priority: 'medium',
    confidence: 0.64,
    source: {
      url: 'https://www.austrade.gov.au/',
      title: 'Austrade — Australian Trade and Investment Commission',
      type: 'public_institution',
      publishedAt: '2024-01-01',
      freshness: 'institutional_overview',
      summary:
        'Austrade is the Australian government’s public trade and investment commission, with guidance for exporters and international partners.',
    },
  },
  {
    id: 'asic_small_business',
    tags: ['australia', 'sme', 'one-person', 'digital', 'presence'],
    targetTypes: ['USER_ACQUISITION'],
    opportunityType: 'AUDIENCE',
    title: 'Australian small-business information audience',
    audience: 'Australia-based SMEs and one-person companies',
    market: 'au',
    suggestedAngle: 'Offer a simple Cardbey digital presence for small operators without claiming ASIC endorsement',
    suggestedChannel: 'facebook',
    priority: 'medium',
    confidence: 0.6,
    source: {
      url: 'https://asic.gov.au/for-business/small-business/',
      title: 'ASIC — small business',
      type: 'public_regulator',
      publishedAt: '2024-01-01',
      freshness: 'institutional_overview',
      summary:
        'The Australian Securities and Investments Commission publishes public small-business information pages for company operators.',
    },
  },
  {
    id: 'cardbey_capability',
    tags: ['cardbey', 'global live', 'pilot', 'sme', 'smart product', 'service'],
    targetTypes: ['USER_ACQUISITION'],
    opportunityType: 'GLOBAL_LIVE',
    title: 'Cardbey Global Live / SME pilot as an acquisition hook',
    audience: 'SMEs considering a Cardbey pilot',
    market: 'vn',
    suggestedAngle: 'Invite interest in the Cardbey SME / Global Live pilot without claiming it is always open',
    suggestedChannel: 'facebook',
    priority: 'high',
    confidence: 0.8,
    source: {
      url: null,
      title: 'Cardbey capability registry (internal product truth)',
      type: 'internal_registry',
      publishedAt: null,
      freshness: 'current_product_truth',
      summary:
        'Cardbey is an AI business-creation platform under development, with English/Vietnamese as initial languages and live social publishing off by default.',
    },
  },
  {
    id: 'wipo_sme',
    tags: ['sme', 'ip', 'smart product', 'packaging', 'brand'],
    targetTypes: ['USER_ACQUISITION'],
    opportunityType: 'CONTENT_TOPIC',
    title: 'Public SME intellectual-property education as a content topic',
    audience: 'Product and packaging SMEs',
    market: 'global',
    suggestedAngle: 'Educational Facebook content on preparing a brand presence — not legal advice',
    suggestedChannel: 'facebook',
    priority: 'low',
    confidence: 0.52,
    source: {
      url: 'https://www.wipo.int/sme/en/',
      title: 'WIPO — SMEs',
      type: 'public_institution',
      publishedAt: '2024-01-01',
      freshness: 'institutional_overview',
      summary:
        'The World Intellectual Property Organization publishes public SME resources on intellectual property awareness.',
    },
  },
  {
    id: 'startup_gov_au',
    tags: ['investor', 'accelerator', 'australia', 'startup', 'program'],
    targetTypes: ['INVESTOR_DISCOVERY'],
    opportunityType: 'FUNDING_PROGRAM',
    title: 'Australian public startup program landscape (research only)',
    audience: 'Program operators and ecosystem observers — not enrolled leads',
    market: 'au',
    suggestedAngle: 'Map public startup programs as themes; do not contact or CRM individuals',
    suggestedChannel: 'facebook',
    priority: 'medium',
    confidence: 0.58,
    source: {
      url: 'https://www.startup.gov.au/',
      title: 'startup.gov.au',
      type: 'public_institution',
      publishedAt: '2024-01-01',
      freshness: 'institutional_overview',
      summary:
        'The Australian Government publishes a public startup information site covering programs and ecosystem navigation.',
    },
  },
  {
    id: 'austrade_invest',
    tags: ['investor', 'australia', 'strategic', 'theme'],
    targetTypes: ['INVESTOR_DISCOVERY'],
    opportunityType: 'INVESTOR_THEME',
    title: 'Public Australian investment-promotion themes',
    audience: 'Research: investment themes, not named private investors',
    market: 'au',
    suggestedAngle: 'Treat Austrade investment pages as theme evidence only — no outreach',
    suggestedChannel: 'facebook',
    priority: 'medium',
    confidence: 0.55,
    source: {
      url: 'https://www.austrade.gov.au/en/how-we-can-help-you/invest-in-australia',
      title: 'Austrade — Invest in Australia',
      type: 'public_institution',
      publishedAt: '2024-01-01',
      freshness: 'institutional_overview',
      summary:
        'Austrade publishes public pages describing how Australia promotes inbound investment. This is a theme source, not a list of investors.',
    },
  },
  {
    id: 'oecd_sme',
    tags: ['sme', 'oecd', 'digital', 'trend'],
    targetTypes: ['USER_ACQUISITION', 'INVESTOR_DISCOVERY'],
    opportunityType: 'MARKET_TREND',
    title: 'OECD public SME and entrepreneurship materials',
    audience: 'Policy-aware SME and ecosystem readers',
    market: 'global',
    suggestedAngle: 'Use OECD public SME pages as trend context, not as invented market size claims',
    suggestedChannel: 'facebook',
    priority: 'low',
    confidence: 0.5,
    source: {
      url: 'https://www.oecd.org/en/topics/smes-and-entrepreneurship.html',
      title: 'OECD — SMEs and entrepreneurship',
      type: 'public_institution',
      publishedAt: '2024-01-01',
      freshness: 'institutional_overview',
      summary:
        'The OECD publishes public topic pages on SMEs and entrepreneurship used here as qualitative trend context.',
    },
  },
];

export function matchResearchCatalog({ question = '', targetType = 'USER_ACQUISITION', market = '', topic = '' } = {}) {
  const hay = `${question} ${market} ${topic}`.toLowerCase();
  const type = String(targetType || 'USER_ACQUISITION');
  return PUBLIC_RESEARCH_CATALOG.filter((item) => {
    if (!item.targetTypes.includes(type)) return false;
    return item.tags.some((tag) => hay.includes(String(tag).toLowerCase()));
  });
}
