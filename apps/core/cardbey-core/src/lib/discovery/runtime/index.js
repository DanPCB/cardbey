/**
 * Shared Discovery Runtime public surface (Phase 1).
 * No business scrape/store imports. No URI pipeline.
 */

export { executeWithConcurrency } from './executeWithConcurrency.js';
export {
  PIPELINE_KIND_BUSINESS_STORE,
  assertDiscoveryPipeline,
} from './pipelineContract.js';
export { runScheduledSession } from './SharedDiscoveryRuntime.js';
