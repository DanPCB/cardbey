/**
 * Registry of permitted data acquisition sources.
 *
 * ETHICS: only official APIs and user-supplied inputs — no prohibited scraping.
 * Phase 1: advisory acquisition only; sources declare capabilities + attribution.
 */

export type SourceType =
  | 'internal_graph'
  | 'upload'
  | 'google_places'
  | 'website_metadata'
  | 'schema_org'
  | 'pexels'
  | 'pixabay'
  | 'coverr'
  | 'mixkit'
  | 'business_discovery'
  | 'mcp_connector';

export type AcquisitionCapability =
  | 'search_business'
  | 'fetch_website'
  | 'extract_metadata'
  | 'search_media'
  | 'extract_menu'
  | 'search_social'
  | 'discover_reviews'
  | 'find_brand_assets'
  | 'find_location_data'
  | 'find_supplier_candidates';

export interface AttributionRule {
  /** Display label, e.g. "Powered by Google Places API". */
  label: string;
  /** Whether UI must show attribution when data from this source is used. */
  required: boolean;
}

export interface AcquisitionSource {
  sourceId: string;
  sourceType: SourceType;
  capabilities: AcquisitionCapability[];
  /** Requests per minute (advisory; coordinator respects in Phase 1). */
  rateLimit: number;
  /** Base trust weight 0..1 when merging confidence. */
  confidenceWeight: number;
  attributionRules: AttributionRule;
  /** True when env credentials / config present. */
  configured: boolean;
}

function envPresent(key: string): boolean {
  const v = process.env[key];
  return Boolean(v && String(v).trim());
}

/** Built-in source catalog (Phase 1 foundation). */
export const BUILTIN_SOURCES: AcquisitionSource[] = [
  {
    sourceId: 'cardbey_internal',
    sourceType: 'internal_graph',
    capabilities: ['find_supplier_candidates', 'search_business'],
    rateLimit: 120,
    confidenceWeight: 0.85,
    attributionRules: { label: 'Cardbey graph', required: false },
    configured: true,
  },
  {
    sourceId: 'user_upload',
    sourceType: 'upload',
    capabilities: ['extract_menu', 'find_brand_assets', 'extract_metadata'],
    rateLimit: 60,
    confidenceWeight: 0.95,
    attributionRules: { label: 'User upload', required: false },
    configured: true,
  },
  {
    sourceId: 'google_places',
    sourceType: 'google_places',
    capabilities: ['search_business', 'find_location_data', 'discover_reviews'],
    rateLimit: 30,
    confidenceWeight: 0.9,
    attributionRules: { label: 'Data provided by Google. Powered by Google Places API.', required: true },
    configured: envPresent('GOOGLE_PLACES_API_KEY'),
  },
  {
    sourceId: 'website_metadata',
    sourceType: 'website_metadata',
    capabilities: ['fetch_website', 'extract_metadata'],
    rateLimit: 20,
    confidenceWeight: 0.55,
    attributionRules: { label: 'Business website', required: true },
    configured: true,
  },
  {
    sourceId: 'schema_org',
    sourceType: 'schema_org',
    capabilities: ['fetch_website', 'extract_metadata', 'search_social'],
    rateLimit: 20,
    confidenceWeight: 0.6,
    attributionRules: { label: 'Structured data (schema.org)', required: true },
    configured: true,
  },
  {
    sourceId: 'business_discovery',
    sourceType: 'business_discovery',
    capabilities: ['search_business', 'find_location_data'],
    rateLimit: 30,
    confidenceWeight: 0.75,
    attributionRules: { label: 'Cardbey business discovery', required: true },
    configured: true,
  },
  {
    sourceId: 'pexels',
    sourceType: 'pexels',
    capabilities: ['search_media', 'find_brand_assets'],
    rateLimit: 30,
    confidenceWeight: 0.5,
    attributionRules: { label: 'Pexels License', required: true },
    configured: envPresent('PEXELS_API_KEY'),
  },
  {
    sourceId: 'pixabay',
    sourceType: 'pixabay',
    capabilities: ['search_media'],
    rateLimit: 30,
    confidenceWeight: 0.45,
    attributionRules: { label: 'Pixabay License', required: true },
    configured: envPresent('PIXABAY_API_KEY'),
  },
  {
    sourceId: 'coverr',
    sourceType: 'coverr',
    capabilities: ['search_media'],
    rateLimit: 20,
    confidenceWeight: 0.45,
    attributionRules: { label: 'Coverr License', required: true },
    configured: envPresent('COVERR_API_KEY'),
  },
  {
    sourceId: 'mixkit',
    sourceType: 'mixkit',
    capabilities: ['search_media'],
    rateLimit: 20,
    confidenceWeight: 0.4,
    attributionRules: { label: 'Mixkit License', required: true },
    configured: true,
  },
];

const byId = new Map(BUILTIN_SOURCES.map((s) => [s.sourceId, s]));

export function getSource(sourceId: string): AcquisitionSource | null {
  return byId.get(sourceId) ?? null;
}

export function listSources(opts?: { configuredOnly?: boolean }): AcquisitionSource[] {
  if (opts?.configuredOnly) return BUILTIN_SOURCES.filter((s) => s.configured);
  return [...BUILTIN_SOURCES];
}

/** Sources that can run a given acquisition task type. */
export function getSourcesForCapability(cap: AcquisitionCapability): AcquisitionSource[] {
  return BUILTIN_SOURCES.filter((s) => s.configured && s.capabilities.includes(cap));
}

export function pickBestSourceForCapability(cap: AcquisitionCapability): AcquisitionSource | null {
  const candidates = getSourcesForCapability(cap);
  if (!candidates.length) return null;
  return candidates.sort((a, b) => b.confidenceWeight - a.confidenceWeight)[0];
}
