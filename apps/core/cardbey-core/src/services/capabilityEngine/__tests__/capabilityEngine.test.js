import { describe, it, expect } from 'vitest';
import {
  isAllowedAdapter,
  isPilotCapabilityType,
  ALLOWED_ADAPTERS,
  CAPABILITY_TYPE,
} from '../capabilityTypes.js';
import { describeAdapterPlan } from '../adapters.js';

describe('Capability Engine Phase 4A', () => {
  it('accepts only pilot capability types', () => {
    expect(isPilotCapabilityType(CAPABILITY_TYPE.STORE_SETUP)).toBe(true);
    expect(isPilotCapabilityType('ARBITRARY_ZIP')).toBe(false);
  });

  it('rejects unknown adapters', () => {
    expect(isAllowedAdapter(ALLOWED_ADAPTERS.APPLY_STOREFRONT_TEMPLATE_DRAFT)).toBe(true);
    expect(isAllowedAdapter('eval_user_code')).toBe(false);
    expect(isAllowedAdapter('shell_exec')).toBe(false);
  });

  it('plan descriptions mark draft-only storefront apply', () => {
    const plan = describeAdapterPlan(
      ALLOWED_ADAPTERS.APPLY_STOREFRONT_TEMPLATE_DRAFT,
      { id: 't', name: 'template', description: 'd' },
      {},
    );
    expect(plan.rollbackAvailable).toBe(true);
    expect(plan.irreversible).toBe(false);
    expect(String(plan.note || '')).toMatch(/not publish/i);
  });
});
