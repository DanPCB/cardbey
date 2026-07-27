import { describe, it, expect } from 'vitest';
import {
  getSkillContract,
  resolveSkillContractForActionType,
  validatePlanAgainstSkillContract,
} from './skillContracts.js';

describe('skillContracts', () => {
  it('resolves launch_first_offer contract from action type', () => {
    const contract = resolveSkillContractForActionType('launch_first_offer');
    expect(contract?.skillId).toBe('launch_first_offer');
    expect(contract?.status).toBe('active');
    expect(contract?.steps).toHaveLength(6);
  });

  it('returns null for capability-only action types', () => {
    expect(resolveSkillContractForActionType('update_product_catalog')).toBeNull();
  });

  it('validates plan steps against contract', () => {
    const contract = getSkillContract('launch_first_offer');
    const ok = validatePlanAgainstSkillContract(
      {
        steps: [
          { capabilityId: 'analyze_store' },
          { capabilityId: 'select_offer_products' },
          { capabilityId: 'generate_offer_copy' },
          { capabilityId: 'create_offer_draft' },
          { capabilityId: 'review_offer' },
          { capabilityId: 'publish_offer' },
        ],
      },
      contract,
    );
    expect(ok.ok).toBe(true);
  });

  it('rejects mismatched capability steps', () => {
    const contract = getSkillContract('launch_first_offer');
    const bad = validatePlanAgainstSkillContract(
      {
        steps: [{ capabilityId: 'replace_catalog' }],
      },
      contract,
    );
    expect(bad.ok).toBe(false);
  });
});
