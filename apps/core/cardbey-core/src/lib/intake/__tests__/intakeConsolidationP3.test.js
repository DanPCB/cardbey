import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  isSkillRuntimeDispatchAllowed,
} from '../intakeConsolidationFlags.js';
import { logSkillRuntimeDispatch } from '../skillRuntimeTelemetry.js';
import { tryStoreCreateFastPath } from '../../intent/storeCreateFastPath.js';

describe('P3 intake consolidation flags', () => {
  const env = { ...process.env };

  afterEach(() => {
    process.env = { ...env };
  });

  it('allows all skill_runtime domains when RUNTIME_SKILL_RUNTIME_DOMAINS unset', () => {
    delete process.env.RUNTIME_SKILL_RUNTIME_DOMAINS;
    expect(isSkillRuntimeDispatchAllowed('setup a loyalty program')).toBe(true);
    expect(isSkillRuntimeDispatchAllowed('create a promotion graphic')).toBe(true);
  });

  it('restricts skill_runtime to configured domains', () => {
    process.env.RUNTIME_SKILL_RUNTIME_DOMAINS = 'LOYALTY,STORE';
    expect(isSkillRuntimeDispatchAllowed('setup a loyalty program')).toBe(true);
    expect(isSkillRuntimeDispatchAllowed('create a store for my business')).toBe(true);
    expect(isSkillRuntimeDispatchAllowed('create a promotion graphic')).toBe(false);
  });
});

describe('P3 create_store classifier path', () => {
  it('tryStoreCreateFastPath handles plain create store phrasing', () => {
    const hit = tryStoreCreateFastPath('create a store for my bakery', {});
    expect(hit?.tool).toBe('create_store');
    expect(hit?._fastPath).toBe('store_create');
  });
});

describe('skillRuntimeTelemetry', () => {
  it('emits structured SKILL_RUNTIME_DISPATCH line', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logSkillRuntimeDispatch({
      result: 'matched',
      userMessage: 'setup loyalty',
      skillId: 'setup_loyalty_program',
      state: 'completed',
      storeId: 's1',
    });
    expect(spy).toHaveBeenCalled();
    const payload = JSON.parse(String(spy.mock.calls[0]?.[0]));
    expect(payload.tag).toBe('SKILL_RUNTIME_DISPATCH');
    expect(payload.result).toBe('matched');
    expect(payload.domain).toBe('LOYALTY');
    spy.mockRestore();
  });
});
