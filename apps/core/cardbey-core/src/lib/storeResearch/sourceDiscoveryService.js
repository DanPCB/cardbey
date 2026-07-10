/**
 * Phase 2 — Source discovery with authority classification.
 * Delegates network discovery to storeCreationResearch; adds authority metadata.
 */

import { randomUUID } from 'node:crypto';
import { discoverSources as legacyDiscoverSources } from '../storeCreationResearch/sourceDiscoveryService.js';
import { resolveStoreResearchInputFields } from '../storeCreationResearch/researchInputFields.js';

/** @typedef {import('./types.js').DiscoveredSource} DiscoveredSource */
/** @typedef {import('./types.js').SourceAuthority} SourceAuthority */

/** @typedef {import('../storeCreationResearch/types.js').DiscoveredSource} LegacyDiscoveredSource */

const AUTHORITY_BY_SOURCE_TYPE = {
  official_website: 'owner_controlled',
  google_business: 'authoritative_structured',
  facebook: 'supporting_public',
  instagram: 'supporting_public',
  booking_platform: 'authoritative_structured',
  directory: 'supporting_public',
  review_site: 'unverified',
  uploaded_document: 'owner_controlled',
  manual: 'owner_controlled',
};

/**
 * @param {LegacyDiscoveredSource} source
 * @returns {SourceAuthority}
 */
function classifySourceAuthority(source) {
  const type = String(source?.sourceType ?? 'manual');
  if (AUTHORITY_BY_SOURCE_TYPE[type]) return AUTHORITY_BY_SOURCE_TYPE[type];
  if (/schema|json-ld/i.test(type)) return 'authoritative_structured';
  return 'unverified';
}

/**
 * @param {LegacyDiscoveredSource} source
 * @param {number} index
 * @returns {DiscoveredSource}
 */
function mapLegacySource(source, index) {
  return {
    id: randomUUID(),
    type: String(source.sourceType ?? 'manual'),
    url: source.sourceUrl ?? null,
    authority: classifySourceAuthority(source),
    priority: typeof source.priority === 'number' ? source.priority : index,
    raw: source.raw && typeof source.raw === 'object' ? source.raw : {},
  };
}

/**
 * Discover sources for an existing business research run.
 * @param {object} input
 * @param {(msg: string, meta?: object) => void} [log]
 * @returns {Promise<DiscoveredSource[]>}
 */
export async function discoverBusinessSources(input, log) {
  const fields = resolveStoreResearchInputFields({}, input);
  const legacy = await legacyDiscoverSources(fields, log ?? (() => {}));
  return legacy.map(mapLegacySource);
}

export { classifySourceAuthority, AUTHORITY_BY_SOURCE_TYPE };
