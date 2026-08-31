/**
 * Curated public investor organisations for dry-run discovery.
 * Public names and homepages only — no private contacts or scraped data.
 */

/** @typedef {{
 *   catalogId: string;
 *   name: string;
 *   type: string;
 *   geography: string;
 *   geographies: string[];
 *   stages: string[];
 *   themes: string[];
 *   canLead: boolean;
 *   website: string;
 *   headquarters: string;
 *   accessRoute: string;
 *   publicTeamRoles: string[];
 *   relevantPortfolio: string[];
 *   mandateSummary: string;
 * }} InvestorCatalogOrg */

/** @type {InvestorCatalogOrg[]} */
export const INVESTOR_ORGANIZATION_CATALOG = [
  {
    catalogId: 'inv_blackbird_au',
    name: 'Blackbird Ventures',
    type: 'VC',
    geography: 'au',
    geographies: ['au', 'global'],
    stages: ['seed', 'series-a'],
    themes: ['ai', 'saas', 'enterprise', 'infrastructure'],
    canLead: true,
    website: 'https://blackbird.vc/',
    headquarters: 'Sydney, Australia',
    accessRoute: 'Warm intro via portfolio founder',
    publicTeamRoles: ['Partner', 'Principal'],
    relevantPortfolio: ['Canva', 'Culture Amp', 'SafetyCulture'],
    mandateSummary: 'Australian and New Zealand technology companies from seed through growth.',
  },
  {
    catalogId: 'inv_airtree_au',
    name: 'AirTree Ventures',
    type: 'VC',
    geography: 'au',
    geographies: ['au', 'sea', 'global'],
    stages: ['seed', 'series-a'],
    themes: ['ai', 'saas', 'marketplace', 'fintech'],
    canLead: true,
    website: 'https://www.airtree.vc/',
    headquarters: 'Sydney, Australia',
    accessRoute: 'Founder referral or ecosystem intro',
    publicTeamRoles: ['Partner', 'Investment team'],
    relevantPortfolio: ['Employment Hero', 'Linktree', 'Go1'],
    mandateSummary: 'ANZ and selective global software investments.',
  },
  {
    catalogId: 'inv_squarepeg_au',
    name: 'Square Peg Capital',
    type: 'VC',
    geography: 'au',
    geographies: ['au', 'sea', 'global'],
    stages: ['seed', 'series-a'],
    themes: ['saas', 'marketplace', 'fintech', 'enterprise'],
    canLead: true,
    website: 'https://www.squarepegcap.com/',
    headquarters: 'Melbourne, Australia',
    accessRoute: 'Partner intro',
    publicTeamRoles: ['Partner'],
    relevantPortfolio: ['Fiverr', 'Stripe (early)', 'Rokt'],
    mandateSummary: 'Technology companies across Australia, Israel, and Southeast Asia.',
  },
  {
    catalogId: 'inv_mainsequence_au',
    name: 'Main Sequence Ventures',
    type: 'VC',
    geography: 'au',
    geographies: ['au'],
    stages: ['seed', 'series-a'],
    themes: ['ai', 'infrastructure', 'enterprise'],
    canLead: true,
    website: 'https://www.mseq.vc/',
    headquarters: 'Sydney, Australia',
    accessRoute: 'CSIRO / deep-tech network',
    publicTeamRoles: ['Partner', 'Venture partner'],
    relevantPortfolio: ['Q-CTRL', 'Vaxxas', 'Samsara Eco'],
    mandateSummary: 'Deep tech and science-backed ventures linked to Australian research.',
  },
  {
    catalogId: 'inv_skalata_au',
    name: 'Skalata Ventures',
    type: 'VC',
    geography: 'au',
    geographies: ['au'],
    stages: ['pre-seed', 'seed'],
    themes: ['saas', 'commerce', 'sme', 'ai'],
    canLead: true,
    website: 'https://www.skalata.vc/',
    headquarters: 'Melbourne, Australia',
    accessRoute: 'Accelerator cohort or direct application',
    publicTeamRoles: ['Partner'],
    relevantPortfolio: ['Early-stage Australian SaaS'],
    mandateSummary: 'Pre-seed and seed Australian software companies.',
  },
  {
    catalogId: 'inv_antler_au',
    name: 'Antler Australia',
    type: 'ACCELERATOR',
    geography: 'au',
    geographies: ['au', 'sea', 'global'],
    stages: ['pre-seed', 'seed'],
    themes: ['ai', 'saas', 'marketplace', 'commerce'],
    canLead: false,
    website: 'https://www.antler.co/australia',
    headquarters: 'Sydney, Australia',
    accessRoute: 'Cohort application',
    publicTeamRoles: ['Partner', 'Resident advisors'],
    relevantPortfolio: ['Antler global portfolio'],
    mandateSummary: 'Day-zero founder platform and pre-seed investing.',
  },
  {
    catalogId: 'inv_investible_au',
    name: 'Investible',
    type: 'VC',
    geography: 'au',
    geographies: ['au', 'sea'],
    stages: ['pre-seed', 'seed'],
    themes: ['saas', 'fintech', 'commerce', 'sme'],
    canLead: true,
    website: 'https://investible.com/',
    headquarters: 'Sydney, Australia',
    accessRoute: 'Early-stage founder network',
    publicTeamRoles: ['Partner', 'Principal'],
    relevantPortfolio: ['Early-stage Australian startups'],
    mandateSummary: 'Pre-seed and seed Australian technology companies.',
  },
  {
    catalogId: 'inv_vertex_sea',
    name: 'Vertex Ventures SEA',
    type: 'VC',
    geography: 'sea',
    geographies: ['sea', 'vn', 'global'],
    stages: ['seed', 'series-a'],
    themes: ['saas', 'fintech', 'marketplace', 'enterprise'],
    canLead: true,
    website: 'https://www.vertexventures.sg/',
    headquarters: 'Singapore',
    accessRoute: 'Regional founder intro',
    publicTeamRoles: ['Partner', 'Principal'],
    relevantPortfolio: ['Southeast Asia B2B software'],
    mandateSummary: 'Southeast Asia technology investments.',
  },
  {
    catalogId: 'inv_goldengate_sg',
    name: 'Golden Gate Ventures',
    type: 'VC',
    geography: 'sea',
    geographies: ['sea', 'vn'],
    stages: ['seed', 'series-a'],
    themes: ['marketplace', 'commerce', 'fintech', 'sme'],
    canLead: true,
    website: 'https://www.goldengate.vc/',
    headquarters: 'Singapore',
    accessRoute: 'Founder referral',
    publicTeamRoles: ['General partner'],
    relevantPortfolio: ['Carousell', 'RedDoorz', 'Carro'],
    mandateSummary: 'Consumer and SME internet platforms in Southeast Asia.',
  },
  {
    catalogId: 'inv_jungle_sg',
    name: 'Jungle Ventures',
    type: 'VC',
    geography: 'sea',
    geographies: ['sea', 'vn', 'global'],
    stages: ['seed', 'series-a'],
    themes: ['saas', 'fintech', 'marketplace', 'enterprise'],
    canLead: true,
    website: 'https://www.jungle.vc/',
    headquarters: 'Singapore',
    accessRoute: 'Portfolio or operator intro',
    publicTeamRoles: ['Partner'],
    relevantPortfolio: ['Southeast Asia growth software'],
    mandateSummary: 'Asia-Pacific technology growth investments.',
  },
  {
    catalogId: 'inv_500_global',
    name: '500 Global',
    type: 'ACCELERATOR',
    geography: 'global',
    geographies: ['global', 'sea', 'au'],
    stages: ['pre-seed', 'seed'],
    themes: ['ai', 'saas', 'marketplace', 'fintech'],
    canLead: false,
    website: 'https://500.co/',
    headquarters: 'San Francisco, USA',
    accessRoute: 'Accelerator program application',
    publicTeamRoles: ['Investment team'],
    relevantPortfolio: ['Global early-stage portfolio'],
    mandateSummary: 'Global early-stage accelerator and seed investor.',
  },
  {
    catalogId: 'inv_brandon_au',
    name: 'Brandon Capital (MRCF)',
    type: 'VC',
    geography: 'au',
    geographies: ['au'],
    stages: ['seed', 'series-a'],
    themes: ['enterprise', 'infrastructure', 'ai'],
    canLead: true,
    website: 'https://www.brandoncapital.com.au/',
    headquarters: 'Melbourne, Australia',
    accessRoute: 'Research / medtech network',
    publicTeamRoles: ['Partner'],
    relevantPortfolio: ['Australian life sciences and deep tech'],
    mandateSummary: 'Australian life sciences and research commercialisation.',
  },
  {
    catalogId: 'inv_startup_gov_au',
    name: 'startup.gov.au (ecosystem programs)',
    type: 'STRATEGIC',
    geography: 'au',
    geographies: ['au'],
    stages: ['pre-seed', 'seed'],
    themes: ['sme', 'commerce', 'enterprise'],
    canLead: false,
    website: 'https://www.startup.gov.au/',
    headquarters: 'Canberra, Australia',
    accessRoute: 'Public program navigation — not a fund',
    publicTeamRoles: ['Program information'],
    relevantPortfolio: [],
    mandateSummary: 'Australian Government public startup ecosystem information.',
  },
  {
    catalogId: 'inv_austrade_invest',
    name: 'Austrade — Invest in Australia',
    type: 'STRATEGIC',
    geography: 'au',
    geographies: ['au', 'global'],
    stages: ['seed', 'series-a'],
    themes: ['enterprise', 'infrastructure', 'commerce'],
    canLead: false,
    website: 'https://www.austrade.gov.au/en/how-we-can-help-you/invest-in-australia',
    headquarters: 'Canberra, Australia',
    accessRoute: 'Public investment promotion — theme research only',
    publicTeamRoles: ['Investment specialists'],
    relevantPortfolio: [],
    mandateSummary: 'Public Australian inbound investment promotion themes.',
  },
  {
    catalogId: 'inv_squarepeg_sea_bridge',
    name: 'Square Peg — SEA expansion lens',
    type: 'VC',
    geography: 'sea',
    geographies: ['sea', 'au'],
    stages: ['series-a'],
    themes: ['marketplace', 'saas', 'fintech'],
    canLead: true,
    website: 'https://www.squarepegcap.com/',
    headquarters: 'Singapore / Melbourne',
    accessRoute: 'Cross-border founder intro',
    publicTeamRoles: ['Partner'],
    relevantPortfolio: ['Regional expansion companies'],
    mandateSummary: 'Selective Southeast Asia expansion investments from ANZ base.',
  },
];

export function getInvestorCatalogOrg(catalogId) {
  return INVESTOR_ORGANIZATION_CATALOG.find((row) => row.catalogId === catalogId) || null;
}

export function scoreInvestorFit(org, filters = {}) {
  let score = 52;
  const geographies = Array.isArray(filters.geographies) ? filters.geographies : [];
  const stages = Array.isArray(filters.stages) ? filters.stages : [];
  const types = Array.isArray(filters.types) ? filters.types : [];
  const themes = Array.isArray(filters.themes) ? filters.themes : [];

  if (!geographies.length || geographies.some((g) => org.geographies.includes(g))) score += 8;
  if (!stages.length || stages.some((s) => org.stages.includes(s))) score += 6;
  if (!types.length || types.includes(org.type)) score += 6;
  const themeHits = themes.filter((t) => org.themes.includes(t)).length;
  score += Math.min(themeHits * 4, 12);

  if (filters.canLead === true && org.canLead) score += 5;
  if (filters.canLead === false && !org.canLead) score += 2;

  if (org.themes.includes('ai') && org.themes.includes('marketplace')) score += 3;
  if (org.geographies.includes('au') && org.geographies.includes('sea')) score += 4;

  score = Math.max(35, Math.min(92, score));
  const tier = score >= 72 ? 'Tier 1' : score >= 58 ? 'Tier 2' : 'Tier 3';
  const confidencePct = Math.min(95, Math.round(score * 0.9));
  return { score, tier, confidencePct };
}

export function buildInvestorFit(org, filters = {}) {
  const { score, tier, confidencePct } = scoreInvestorFit(org, filters);
  return {
    kind: 'INVESTOR_FIT_V1',
    total: score,
    tier,
    confidence: confidencePct / 100,
    confidencePct,
    intelligenceStatus: score >= 72 ? 'high_confidence' : score >= 58 ? 'moderate' : 'early_signal',
    components: [
      {
        id: 'mandate_overlap',
        score: Math.min(25, Math.round(score * 0.28)),
        max: 25,
        reason: org.mandateSummary,
        evidence: [
          {
            kind: 'public_mandate',
            summary: org.mandateSummary,
            sourceUrl: org.website,
            source: 'catalog',
            evidenceType: 'SOURCE_FACT',
          },
        ],
        confidence: 0.7,
        kind: 'mandate',
      },
      {
        id: 'geography',
        score: org.geographies.some((g) => (filters.geographies || []).includes(g)) ? 20 : 12,
        max: 20,
        reason: `Active in ${org.geographies.join(', ')}`,
        evidence: [],
        confidence: 0.65,
        kind: 'geography',
      },
    ],
    whyItFits: [
      `${org.name} invests at ${org.stages.join('/')} stage`,
      org.mandateSummary,
    ],
    potentialConcerns: org.canLead
      ? ['Lead capacity unverified — confirm cheque size manually']
      : ['Typically does not lead rounds — may co-invest only'],
    relevantPerson: {
      publicRole: org.publicTeamRoles[0] || 'Investment team',
      named: false,
      generic: true,
      why: 'Use public team page — no private contact data in Cardbey',
    },
  };
}

export function discoverInvestorCatalog(filters = {}) {
  const targetCount = Math.max(1, Math.min(Number(filters.targetCount) || 40, 50));
  const canLeadFilter =
    filters.canLead === true ? true : filters.canLead === false ? false : 'any';

  let rows = INVESTOR_ORGANIZATION_CATALOG.filter((org) => {
    const geographies = Array.isArray(filters.geographies) ? filters.geographies : [];
    const stages = Array.isArray(filters.stages) ? filters.stages : [];
    const types = Array.isArray(filters.types) ? filters.types : [];
    const themes = Array.isArray(filters.themes) ? filters.themes : [];

    if (geographies.length && !geographies.some((g) => org.geographies.includes(g))) return false;
    if (stages.length && !stages.some((s) => org.stages.includes(s))) return false;
    if (types.length && !types.includes(org.type)) return false;
    if (themes.length && !themes.some((t) => org.themes.includes(t))) return false;
    if (canLeadFilter === true && !org.canLead) return false;
    if (canLeadFilter === false && org.canLead) return false;
    return true;
  });

  rows = rows
    .map((org) => {
      const fit = buildInvestorFit(org, filters);
      return { org, fit, fitScore: fit.total };
    })
    .sort((a, b) => b.fitScore - a.fitScore)
    .slice(0, targetCount);

  return rows;
}
