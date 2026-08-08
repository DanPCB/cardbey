/**
 * Shared Discovery Runtime — pipeline interface contract (Phase 1).
 *
 * Runtime may call only methods on this shape. It must not import
 * business scrape/store modules or URI federation adapters.
 *
 * @typedef {'business_store' | 'uri_resource'} PipelineKind
 *
 * @typedef {object} DiscoveryPipeline
 * @property {PipelineKind} kind
 * @property {(triggeredBy?: string, triggeredById?: string | null) => Promise<unknown[]>} runAllActive
 * @property {(() => Promise<boolean>) | undefined} [isLocked]
 */

export const PIPELINE_KIND_BUSINESS_STORE = 'business_store';

/**
 * @param {unknown} pipeline
 * @returns {asserts pipeline is DiscoveryPipeline}
 */
export function assertDiscoveryPipeline(pipeline) {
  if (!pipeline || typeof pipeline !== 'object') {
    throw new Error('discovery_pipeline_invalid');
  }
  const kind = /** @type {{ kind?: unknown }} */ (pipeline).kind;
  const runAllActive = /** @type {{ runAllActive?: unknown }} */ (pipeline).runAllActive;
  if (typeof kind !== 'string' || !kind.trim()) {
    throw new Error('discovery_pipeline_missing_kind');
  }
  if (typeof runAllActive !== 'function') {
    throw new Error('discovery_pipeline_missing_runAllActive');
  }
}
