/**
 * Business Discovery Pipeline — store crawl → UnclaimedStore → PreBuilt.
 *
 * Registered with Shared Discovery Runtime as the only Phase 1 pipeline.
 * All provider/scrape/store logic stays in DiscoveryBatchRunner + services.
 */

import {
  runAllActive,
  isDiscoveryLocked,
} from '../../DiscoveryBatchRunner.js';
import { PIPELINE_KIND_BUSINESS_STORE } from '../../runtime/pipelineContract.js';

/** @type {import('../../runtime/pipelineContract.js').DiscoveryPipeline} */
export const businessDiscoveryPipeline = {
  kind: PIPELINE_KIND_BUSINESS_STORE,
  runAllActive,
  isLocked: isDiscoveryLocked,
};

export default businessDiscoveryPipeline;
