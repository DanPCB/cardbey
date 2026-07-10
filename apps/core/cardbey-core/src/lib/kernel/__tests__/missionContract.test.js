/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import {
  buildMissionContract,
  assertMissionContractConsistency,
  MissionContractAssertionError,
} from '../missionContract.js';

describe('missionContract', () => {
  it('builds a frozen contract with expected artifact types', () => {
    const contract = buildMissionContract({
      missionId: 'mission_1',
      tool: 'setup_loyalty_program',
      userGoalSnapshot: 'create a loyalty program',
      storeId: 'store_1',
      evidenceId: 'evidence_1',
    });

    expect(contract.missionFamily).toBe('loyalty');
    expect(contract.executionContext.storeId).toBe('store_1');
    expect(contract.expectedAssetTypes).toContain('generated_loyalty_program');
    expect(Object.isFrozen(contract)).toBe(true);
  });

  it('rejects mission family rewrites after freeze', () => {
    const contract = buildMissionContract({
      missionId: 'mission_2',
      tool: 'setup_loyalty_program',
      storeId: 'store_1',
      evidenceId: 'evidence_1',
    });

    expect(() =>
      assertMissionContractConsistency(contract, {
        tool: 'create_campaign',
        storeId: 'store_1',
        evidenceId: 'evidence_1',
      }),
    ).toThrow(MissionContractAssertionError);
  });

  it('rejects store rewrites after freeze', () => {
    const contract = buildMissionContract({
      missionId: 'mission_3',
      tool: 'create_campaign',
      storeId: 'store_a',
      evidenceId: 'evidence_1',
    });

    expect(() =>
      assertMissionContractConsistency(contract, {
        tool: 'create_campaign',
        storeId: 'store_b',
        evidenceId: 'evidence_1',
      }),
    ).toThrow(/store/i);
  });

  it('rejects evidence rewrites after freeze', () => {
    const contract = buildMissionContract({
      missionId: 'mission_4',
      tool: 'setup_loyalty_program',
      storeId: 'store_a',
      evidenceId: 'evidence_a',
    });

    expect(() =>
      assertMissionContractConsistency(contract, {
        tool: 'setup_loyalty_program',
        storeId: 'store_a',
        evidenceId: 'evidence_b',
      }),
    ).toThrow(/evidence/i);
  });

  it('allows idempotent re-freeze with same evidence id', () => {
    const contract = buildMissionContract({
      missionId: 'mission_5',
      tool: 'setup_loyalty_program',
      storeId: 'store_a',
      evidenceId: 'evidence_a',
    });

    expect(() =>
      assertMissionContractConsistency(contract, {
        tool: 'setup_loyalty_program',
        storeId: 'store_a',
        evidenceId: 'evidence_a',
      }),
    ).not.toThrow();
  });
});
