import { describe, expect, it } from 'vitest';
import { businessDiscoveryPipeline } from '../BusinessDiscoveryPipeline.js';
import {
  assertDiscoveryPipeline,
  PIPELINE_KIND_BUSINESS_STORE,
} from '../../../runtime/pipelineContract.js';
import * as BatchRunner from '../../../DiscoveryBatchRunner.js';

describe('BusinessDiscoveryPipeline', () => {
  it('satisfies DiscoveryPipeline contract for Shared Runtime', () => {
    expect(() => assertDiscoveryPipeline(businessDiscoveryPipeline)).not.toThrow();
    expect(businessDiscoveryPipeline.kind).toBe(PIPELINE_KIND_BUSINESS_STORE);
    expect(businessDiscoveryPipeline.runAllActive).toBe(BatchRunner.runAllActive);
    expect(businessDiscoveryPipeline.isLocked).toBe(BatchRunner.isDiscoveryLocked);
  });
});
