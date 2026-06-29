import { describe, expect, it } from 'vitest';
import { applyGovernanceEnforcer } from '../governanceEnforcer.js';

/** @returns {import('./decideTurn.js').TurnResult} */
function baseTurn(overrides = {}) {
  return {
    nextStep: 'execute',
    tool: { name: 'create_campaign', parameters: {} },
    governance: {
      requiresConfirmation: false,
      confirmationState: 'not_required',
      proposedAction: null,
    },
    rationale: 'test',
    belief: {
      sessionId: 's',
      sessionKey: 's',
      identity: { guest: false, actorId: 'u:1', userId: '1' },
      anchors: { storeId: null, draftId: null, missionId: null },
    },
    ...overrides,
  };
}

describe('applyGovernanceEnforcer', () => {
  it('converts execute to checkpoint when confirmation required', () => {
    const out = applyGovernanceEnforcer(baseTurn(), { isGuest: false, confirmed: false });
    expect(out.nextStep).toBe('checkpoint');
    expect(out.governance.requiresConfirmation).toBe(true);
  });

  it('guides guest to auth for create_store', () => {
    const out = applyGovernanceEnforcer(
      baseTurn({ tool: { name: 'create_store', parameters: {} } }),
      { isGuest: true },
    );
    expect(out.nextStep).toBe('guide_auth');
    expect(out.governance.requiresAuth).toBe(true);
  });
});
