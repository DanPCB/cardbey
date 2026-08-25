/**
 * Canonical Cardbey investor facts — presentation source, not live product metrics.
 * Status distinguishes VERIFIED / DRAFT / STALE / MISSING / RESTRICTED.
 * Working positioning is DRAFT, not a verified commercial claim.
 */

export const FACT_STATUS = Object.freeze({
  VERIFIED: 'VERIFIED',
  DRAFT: 'DRAFT',
  STALE: 'STALE',
  MISSING: 'MISSING',
  RESTRICTED: 'RESTRICTED',
});

/** @type {Array<{ key: string, category: string, status: string, title: string, body: string, provenance: string }>} */
export const CANONICAL_INVESTOR_FACTS = Object.freeze([
  {
    key: 'company_name',
    category: 'company',
    status: FACT_STATUS.VERIFIED,
    title: 'Cardbey',
    body: 'Cardbey is a software platform for creating and operating businesses, stores, and related digital surfaces.',
    provenance: 'product_identity',
  },
  {
    key: 'under_development',
    category: 'product',
    status: FACT_STATUS.VERIFIED,
    title: 'Under development',
    body: 'Cardbey is under development. Completeness, scale, and commercial outcomes are not claimed as finished facts.',
    provenance: 'product_truth',
  },
  {
    key: 'languages_en_vi',
    category: 'product',
    status: FACT_STATUS.VERIFIED,
    title: 'English and Vietnamese',
    body: 'Cardbey surfaces are built to operate in English and Vietnamese.',
    provenance: 'product_truth',
  },
  {
    key: 'wedge_au_vn',
    category: 'Australia',
    status: FACT_STATUS.DRAFT,
    title: 'Australia and Vietnam wedge',
    body: 'The intended initial economic wedge is SMEs and emerging businesses in Australia and Vietnam.',
    provenance: 'working_thesis',
  },
  {
    key: 'positioning_accelerator',
    category: 'insight',
    status: FACT_STATUS.DRAFT,
    title: 'Resource Aggregation Accelerator (working positioning)',
    body: 'Cardbey is developing an AI-powered Resource Aggregation Accelerator that helps discover fragmented resources and assemble them around real economic needs and market opportunities.',
    provenance: 'working_thesis',
  },
  {
    key: 'resources_scope',
    category: 'technology',
    status: FACT_STATUS.DRAFT,
    title: 'Resource types in scope',
    body: 'Intended resource types include businesses, products, services, people, capabilities, knowledge, content, audiences, infrastructure, and market opportunities.',
    provenance: 'working_thesis',
  },
  {
    key: 'no_live_meta',
    category: 'GTM',
    status: FACT_STATUS.VERIFIED,
    title: 'No live Meta publishing in this phase',
    body: 'Facebook/Meta live publishing is not an enabled Cardbey fundraising or GTM fact in this phase.',
    provenance: 'product_truth',
  },
  {
    key: 'traction_metrics',
    category: 'traction',
    status: FACT_STATUS.MISSING,
    title: 'Traction metrics',
    body: 'Live store counts, user counts, and revenue are not copied into investor facts.',
    provenance: 'intentionally_omitted',
  },
  {
    key: 'raise_terms',
    category: 'raise',
    status: FACT_STATUS.RESTRICTED,
    title: 'Raise / use of funds',
    body: 'Raise size, valuation, cap table, and use of funds are not disclosed in 1G.',
    provenance: 'restricted',
  },
  {
    key: 'financials',
    category: 'financial',
    status: FACT_STATUS.RESTRICTED,
    title: 'Financial model',
    body: 'Detailed financials are not part of the public investor presentation.',
    provenance: 'restricted',
  },
  {
    key: 'problem',
    category: 'problem',
    status: FACT_STATUS.MISSING,
    title: 'Problem statement',
    body: 'A verified, fundraising-grade problem statement is not yet a canonical fact.',
    provenance: 'intentionally_omitted',
  },
  {
    key: 'founder_team',
    category: 'founder',
    status: FACT_STATUS.MISSING,
    title: 'Founder / team',
    body: 'Founder and team biographies are not copied into the 1G fact catalog.',
    provenance: 'intentionally_omitted',
  },
  {
    key: 'market_size',
    category: 'market',
    status: FACT_STATUS.MISSING,
    title: 'Market size',
    body: 'TAM/SAM/SOM figures are not canonical facts in this phase.',
    provenance: 'intentionally_omitted',
  },
  {
    key: 'business_model',
    category: 'business model',
    status: FACT_STATUS.MISSING,
    title: 'Business model',
    body: 'Pricing and revenue-model claims are not canonical facts in this phase.',
    provenance: 'intentionally_omitted',
  },
  {
    key: 'competition_moat',
    category: 'competition',
    status: FACT_STATUS.MISSING,
    title: 'Competition / moat',
    body: 'Competitive and IP claims are not canonical facts in this phase.',
    provenance: 'intentionally_omitted',
  },
  {
    key: 'gtm_expansion',
    category: 'GTM',
    status: FACT_STATUS.MISSING,
    title: 'GTM / expansion',
    body: 'Go-to-market and expansion plans are working theses, not verified fundraising facts.',
    provenance: 'intentionally_omitted',
  },
]);

export function factsForProjection({ includeDraft = true } = {}) {
  return CANONICAL_INVESTOR_FACTS.filter((f) => {
    if (f.status === FACT_STATUS.RESTRICTED || f.status === FACT_STATUS.MISSING) return false;
    if (f.status === FACT_STATUS.STALE) return false;
    if (f.status === FACT_STATUS.DRAFT) return includeDraft;
    return f.status === FACT_STATUS.VERIFIED;
  });
}

export function factByKey(key) {
  return CANONICAL_INVESTOR_FACTS.find((f) => f.key === key) || null;
}
