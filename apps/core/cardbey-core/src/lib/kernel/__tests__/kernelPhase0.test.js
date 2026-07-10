/**
 * @vitest-environment node
 */
import { describe, expect, it, beforeEach } from 'vitest';
import {
  KERNEL_VERSION,
  assertContractNotMutated,
  assertRealityEventImmutable,
  KernelLawViolation,
  registerMissionPlugin,
  getMissionPlugin,
  __clearKernelRegistriesForTests,
  appendRealityStreamEvent,
  selectStreamWindow,
  __clearRealityStreamStoreForTests,
} from '../index.ts';

describe('Cardbey AI Operating Kernel — Phase 0', () => {
  beforeEach(() => {
    __clearKernelRegistriesForTests();
    __clearRealityStreamStoreForTests();
  });

  it('exports kernel version', () => {
    expect(KERNEL_VERSION).toBe('0.1.0');
  });

  it('Law 1 — reality events require identity fields', () => {
    expect(() => assertRealityEventImmutable({})).toThrow(KernelLawViolation);
    expect(() =>
      assertRealityEventImmutable({
        eventId: 'e1',
        streamId: 's1',
        recordedAt: new Date().toISOString(),
        kind: 'user_upload',
        observations: [],
      }),
    ).not.toThrow();
  });

  it('Law 2 — frozen contract cannot change mission family', () => {
    const contract = {
      contractId: 'c1',
      missionId: 'm1',
      frozenAt: '2026-07-09T00:00:00.000Z',
      missionFamily: 'loyalty',
      selectedAlternativeId: 'alt1',
      userGoalSnapshot: 'Create loyalty program',
      evidenceId: 'ev1',
      reasoningFrameId: 'r1',
      decisionId: 'd1',
      executionContext: { storeLocked: true },
      builderId: 'loyalty.v1',
      allowedCapabilities: ['Infer'],
      expectedAssetTypes: ['generated_loyalty_program'],
      uiCardFamily: 'loyalty_program_card',
      publishPipelineId: 'loyalty.publish',
      kernelVersion: KERNEL_VERSION,
    };

    expect(() =>
      assertContractNotMutated(contract, { missionFamily: 'campaign' }),
    ).toThrow(/cannot mutate missionFamily/);

    expect(() =>
      assertContractNotMutated(contract, { executionContext: { storeLocked: false } }),
    ).not.toThrow();
  });

  it('mission plugin registry', () => {
    registerMissionPlugin({
      family: 'loyalty',
      builderId: 'loyaltyTopologyBuilder.v1',
      expectedAssetTypes: ['generated_loyalty_program'],
      uiCardFamily: 'loyalty_program_card',
      publishPipelineId: 'loyalty.publish',
      allowedCapabilities: ['LoadContext', 'Infer', 'Ask', 'Generate', 'Validate', 'Persist', 'Publish'],
      buildLivingGraph: async () => ({ graphId: 'g1', nodes: [] }),
      capabilities: {},
    });

    const plugin = getMissionPlugin('loyalty');
    expect(plugin?.builderId).toBe('loyaltyTopologyBuilder.v1');
  });

  it('reality stream append and window selection', () => {
    const base = {
      streamId: 'store-1',
      kind: 'user_upload',
      observations: [],
    };
    appendRealityStreamEvent({
      ...base,
      eventId: 'e1',
      recordedAt: '2026-07-09T09:00:00.000Z',
    });
    appendRealityStreamEvent({
      ...base,
      eventId: 'e2',
      recordedAt: '2026-07-09T09:05:00.000Z',
    });
    appendRealityStreamEvent({
      ...base,
      eventId: 'e3',
      recordedAt: '2026-07-09T09:20:00.000Z',
    });

    const window = selectStreamWindow({
      streamId: 'store-1',
      fromEventId: 'e2',
      toEventId: 'e3',
    });
    expect(window.map((e) => e.eventId)).toEqual(['e2', 'e3']);
  });
});
