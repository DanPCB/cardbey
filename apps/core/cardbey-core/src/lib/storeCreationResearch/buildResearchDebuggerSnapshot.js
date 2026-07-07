/**
 * Serializable research debugger payload for owner / developer review UI.
 */

import {
  isGooglePlacesConfigured,
  getGooglePlacesApiMode,
  getGooglePlacesApiStatus,
} from '../businessDiscovery/businessDiscoverySources.js';

/** @type {Array<{ id: string; label: string; match: (ctx: ChannelMatchContext) => boolean }>} */
const RESEARCH_CHANNELS = [
  {
    id: 'google_places',
    label: 'Google Places',
    match: ({ source }) => source?.sourceType === 'google_business',
  },
  {
    id: 'website',
    label: 'Website',
    match: ({ source }) => source?.sourceType === 'official_website',
  },
  {
    id: 'bookwell',
    label: 'Bookwell',
    match: ({ source }) => {
      const url = String(source?.sourceUrl ?? '').toLowerCase();
      const via = String(source?.discoveryVia ?? source?.raw?.discoveryVia ?? '').toLowerCase();
      return (
        (source?.sourceType === 'booking_platform' && url.includes('bookwell.com')) ||
        via.includes('bookwell')
      );
    },
  },
  {
    id: 'instagram',
    label: 'Instagram',
    match: ({ source }) => source?.sourceType === 'instagram',
  },
];

/**
 * @typedef {object} ChannelMatchContext
 * @property {object|null|undefined} source
 * @property {import('./types.js').SourceMatchResult|undefined} match
 */

/**
 * @param {import('./types.js').SourceMatchResult[]} sourcesUsed
 * @param {import('./types.js').SourceMatchResult[]} sourcesPendingConfirmation
 * @param {import('./types.js').SourceMatchResult[]} [scoredSources]
 * @returns {ChannelMatchContext[]}
 */
function collectSourceContexts(sourcesUsed, sourcesPendingConfirmation, scoredSources = []) {
  /** @type {Map<string, ChannelMatchContext>} */
  const byUrl = new Map();
  const add = (match) => {
    if (!match?.source) return;
    const key = `${match.source.sourceType}|${match.source.sourceUrl ?? ''}`;
    if (!byUrl.has(key)) byUrl.set(key, { source: match.source, match });
  };
  for (const m of sourcesUsed ?? []) add(m);
  for (const m of sourcesPendingConfirmation ?? []) add(m);
  for (const m of scoredSources ?? []) add(m);
  return [...byUrl.values()];
}

/**
 * @param {typeof RESEARCH_CHANNELS[number]} channel
 * @param {ChannelMatchContext[]} contexts
 * @param {import('./types.js').SourceMatchResult[]} sourcesUsed
 * @param {import('./types.js').SourceMatchResult[]} sourcesPendingConfirmation
 */
function resolveChannelStatus(channel, contexts, sourcesUsed, sourcesPendingConfirmation) {
  const hit = contexts.find((ctx) => channel.match(ctx));
  if (!hit?.source) {
    if (channel.id === 'google_places' && !isGooglePlacesConfigured()) {
      return {
        id: channel.id,
        label: channel.label,
        status: 'skipped',
        matched: false,
        confidence: null,
        sourceUrl: null,
        reason: 'Google Places API key not configured',
      };
    }
    if (channel.id === 'google_places' && isGooglePlacesConfigured()) {
      const apiStatus = getGooglePlacesApiStatus();
      return {
        id: channel.id,
        label: channel.label,
        status: 'not_matched',
        matched: false,
        confidence: null,
        sourceUrl: null,
        reason:
          apiStatus && apiStatus !== 'OK'
            ? `No Google match (${getGooglePlacesApiMode()} · ${apiStatus})`
            : 'No Google Places match for this business',
      };
    }
    return {
      id: channel.id,
      label: channel.label,
      status: 'not_matched',
      matched: false,
      confidence: null,
      sourceUrl: null,
      reason: null,
    };
  }

  const inUsed = (sourcesUsed ?? []).some((m) => channel.match({ source: m.source, match: m }));
  const inPending = (sourcesPendingConfirmation ?? []).some((m) =>
    channel.match({ source: m.source, match: m }),
  );
  const confidence = hit.match?.confidence ?? null;
  const matched = inUsed || inPending || hit.match?.matched === true;

  let status = 'not_matched';
  if (inUsed) status = 'matched';
  else if (inPending) status = 'pending';
  else if (hit.match?.matched) status = 'matched';

  return {
    id: channel.id,
    label: channel.label,
    status,
    matched: status === 'matched' || status === 'pending',
    confidence,
    sourceUrl: hit.source.sourceUrl ?? null,
    reason: hit.match?.reasons?.[0] ?? null,
  };
}

/**
 * @param {import('./types.js').BusinessFacts|null|undefined} facts
 */
function serializeBusinessFacts(facts) {
  if (!facts || typeof facts !== 'object') return [];
  const fields = [
    'businessName',
    'category',
    'description',
    'address',
    'phone',
    'email',
    'website',
    'openingHours',
    'reviewsSummary',
  ];
  /** @type {Array<{ field: string; value: unknown; confidence: number|null; sourceType: string|null }>} */
  const rows = [];
  for (const field of fields) {
    const entry = facts[field];
    if (!entry || typeof entry !== 'object' || entry.value == null) continue;
    rows.push({
      field,
      value: entry.value,
      confidence: typeof entry.confidence === 'number' ? entry.confidence : null,
      sourceType: typeof entry.sourceType === 'string' ? entry.sourceType : null,
    });
  }
  if (facts.socialLinks && typeof facts.socialLinks === 'object') {
    for (const [network, entry] of Object.entries(facts.socialLinks)) {
      if (!entry || typeof entry !== 'object' || !entry.value) continue;
      rows.push({
        field: `social:${network}`,
        value: entry.value,
        confidence: typeof entry.confidence === 'number' ? entry.confidence : null,
        sourceType: typeof entry.sourceType === 'string' ? entry.sourceType : null,
      });
    }
  }
  return rows;
}

/**
 * @param {unknown[]} items
 */
function serializeServices(items) {
  return (items ?? []).slice(0, 48).map((item, index) => {
    if (!item || typeof item !== 'object') return null;
    const row = /** @type {Record<string, unknown>} */ (item);
    const name =
      (typeof row.name === 'string' && row.name.trim()) ||
      (typeof row.title === 'string' && row.title.trim()) ||
      '';
    if (!name) return null;
    return {
      id: typeof row.id === 'string' ? row.id : `svc_${index}`,
      name,
      price: typeof row.price === 'number' ? row.price : null,
      durationMinutes: typeof row.durationMinutes === 'number' ? row.durationMinutes : null,
      category: typeof row.category === 'string' ? row.category : null,
      sourceType: typeof row.sourceType === 'string' ? row.sourceType : null,
      confidence: typeof row.confidence === 'number' ? row.confidence : null,
    };
  }).filter(Boolean);
}

/**
 * @param {import('../businessSemantic/types.js').BusinessProfile|null|undefined} profile
 */
function serializeBusinessProfile(profile) {
  if (!profile || typeof profile !== 'object') return null;
  return {
    businessType: profile.businessType ?? null,
    commerceType: profile.commerceType ?? null,
    executionModel: profile.executionModel ?? null,
    catalogMode: profile.catalogMode ?? null,
    pricingModel: profile.pricingModel ?? null,
    fulfillmentModel: profile.fulfillmentModel ?? null,
    customerJourney: profile.customerJourney ?? null,
    primaryCTA: profile.primaryCTA ?? null,
    catalogLabel: profile.catalogLabel ?? null,
  };
}

/**
 * @param {import('../businessSemantic/types.js').BusinessProfile|null|undefined} profile
 */
function serializeCapabilities(profile) {
  if (!profile?.capabilities || typeof profile.capabilities !== 'object') return [];
  return Object.entries(profile.capabilities)
    .filter(([, enabled]) => enabled === true)
    .map(([key]) => key)
    .sort();
}

/**
 * @param {object|null|undefined} catalog
 * @param {boolean} fallbackToGenerated
 */
function serializeGeneratedCatalog(catalog, fallbackToGenerated) {
  const products = Array.isArray(catalog?.products) ? catalog.products : [];
  const meta = catalog?.meta && typeof catalog.meta === 'object' ? catalog.meta : {};
  return {
    catalogSource:
      (typeof meta.catalogSource === 'string' && meta.catalogSource) ||
      (fallbackToGenerated ? 'ai_generated_fallback' : 'unknown'),
    itemCount: products.length,
    aiGenerated: Boolean(meta.aiGenerated ?? fallbackToGenerated),
    researchConfidence:
      typeof meta.researchConfidence === 'number' ? meta.researchConfidence : null,
    items: products.slice(0, 32).map((p, index) => {
      if (!p || typeof p !== 'object') return null;
      const row = /** @type {Record<string, unknown>} */ (p);
      const name =
        (typeof row.name === 'string' && row.name.trim()) ||
        (typeof row.title === 'string' && row.title.trim()) ||
        '';
      if (!name) return null;
      return {
        id: typeof row.id === 'string' ? row.id : `cat_${index}`,
        name,
        price: typeof row.price === 'number' ? row.price : null,
        category: typeof row.category === 'string' ? row.category : null,
      };
    }).filter(Boolean),
  };
}

/**
 * @param {import('./types.js').StoreCreationResearchInput} input
 * @param {import('./types.js').BusinessResearchResult} result
 * @param {{ scoredSources?: import('./types.js').SourceMatchResult[] }} [options]
 */
export function buildResearchDebuggerSnapshot(input, result, options = {}) {
  const sourcesUsed = result.sourcesUsed ?? [];
  const sourcesPendingConfirmation = result.sourcesPendingConfirmation ?? [];
  const contexts = collectSourceContexts(
    sourcesUsed,
    sourcesPendingConfirmation,
    options.scoredSources ?? [],
  );

  const channels = RESEARCH_CHANNELS.map((channel) =>
    resolveChannelStatus(channel, contexts, sourcesUsed, sourcesPendingConfirmation),
  );

  const serviceItems =
    result.extractedItems ??
    result.catalog?.products ??
    [];

  return {
    businessName: input.businessName ?? result.facts?.businessName?.value ?? null,
    location: input.location ?? result.facts?.address?.value ?? null,
    googlePlacesConfigured: isGooglePlacesConfigured(),
    googlePlacesApiMode: isGooglePlacesConfigured() ? getGooglePlacesApiMode() : 'disabled',
    googlePlacesApiStatus: isGooglePlacesConfigured() ? getGooglePlacesApiStatus() : null,
    overallConfidence: typeof result.confidence === 'number' ? result.confidence : null,
    fallbackToGenerated: Boolean(result.fallbackToGenerated),
    channels,
    businessFacts: serializeBusinessFacts(result.facts),
    services: serializeServices(serviceItems),
    businessProfile: serializeBusinessProfile(result.businessProfile),
    capabilities: serializeCapabilities(result.businessProfile),
    generatedCatalog: serializeGeneratedCatalog(result.catalog, Boolean(result.fallbackToGenerated)),
    savedAt: new Date().toISOString(),
  };
}
