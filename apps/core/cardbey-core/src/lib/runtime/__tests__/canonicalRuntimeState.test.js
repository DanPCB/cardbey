/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { deriveCanonicalRuntimeState, withCanonicalRuntimeState } from '../canonicalRuntimeState.js';

describe('canonicalRuntimeState', () => {
  it('maps clarify_store to awaiting_context', () => {
    expect(deriveCanonicalRuntimeState({ action: 'clarify_store' })).toBe('awaiting_context');
  });

  it('maps pending approval to awaiting_approval', () => {
    expect(deriveCanonicalRuntimeState({ multiAgentStatus: 'pending_approval' })).toBe('awaiting_approval');
  });

  it('maps owner input pause to awaiting_owner_input', () => {
    expect(deriveCanonicalRuntimeState({ status: 'awaiting_owner_input' })).toBe('awaiting_owner_input');
  });

  it('keeps show_execution_plan in executing even when multiAgentStatus is pending_approval', () => {
    expect(
      deriveCanonicalRuntimeState({
        action: 'show_execution_plan',
        multiAgentStatus: 'pending_approval',
      }),
    ).toBe('executing');
  });

  it('adds runtimeState to payloads', () => {
    const payload = withCanonicalRuntimeState({ action: 'show_execution_plan', multiAgentStatus: 'pending_approval' });
    expect(payload.runtimeState).toBe('executing');
  });
});
