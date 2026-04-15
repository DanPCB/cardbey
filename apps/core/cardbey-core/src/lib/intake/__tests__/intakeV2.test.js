import { describe, expect, it } from 'vitest';
import { validateToolParameters, getToolEntry, isRegisteredTool, RISK } from '../intakeToolRegistry.js';
import {
  validateIntakeClassification,
  normalizeCreateStoreToolParameters,
  mergeStoreCreateFormIntoParameters,
} from '../intakeContractValidate.js';
import { normalizePlan } from '../intakeNormalizePlan.js';
import { evaluateExecutionPolicy, CONFIDENCE_HIGH, CONFIDENCE_MEDIUM } from '../intakeExecutionPolicy.js';
import { detectIntent } from '../intakeSystemShortcuts.js';

describe('intakeToolRegistry', () => {
  it('rejects unknown tool', () => {
    expect(isRegisteredTool('not_a_real_tool')).toBe(false);
  });

  it('rejects wrong types for schema (enum)', () => {
    const r = validateToolParameters('orders_report', { groupBy: 'invalid' });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.field === 'groupBy')).toBe(true);
  });

  it('rejects unknown keys in strict mode', () => {
    const r = validateToolParameters('orders_report', { storeId: 's1', extraKey: 1 }, { strictUnknownKeys: true });
    expect(r.ok).toBe(false);
  });
});

describe('validateIntakeClassification', () => {
  it('rejects unknown execution path', () => {
    const v = validateIntakeClassification(
      { executionPath: 'nope', tool: 'orders_report', parameters: {} },
      'store-1',
    );
    expect(v.ok).toBe(false);
    expect(v.downgradedTo).toBe('clarify');
  });

  it('rejects tool / path mismatch', () => {
    const v = validateIntakeClassification(
      { executionPath: 'direct_action', tool: 'launch_campaign', parameters: {} },
      'store-1',
    );
    expect(v.ok).toBe(false);
  });

  it('rejects missing store when required', () => {
    const v = validateIntakeClassification(
      { executionPath: 'direct_action', tool: 'orders_report', parameters: {} },
      null,
    );
    expect(v.ok).toBe(false);
    expect(v.downgradedTo).toBe('chat');
  });

  it('accepts create_store when classifier used alias "name" (maps to storeName)', () => {
    const v = validateIntakeClassification(
      {
        executionPath: 'direct_action',
        tool: 'create_store',
        parameters: {
          name: 'ABC Fashion',
          storeType: 'Fashion',
          location: 'Melbourne',
          _autoSubmit: true,
        },
      },
      null,
    );
    expect(v.ok).toBe(true);
    expect(v.cleanedParameters?.storeName).toBe('ABC Fashion');
    expect(v.cleanedParameters?.name).toBeUndefined();
  });

  it('rejects create_store strict unknown keys after normalization', () => {
    const v = validateIntakeClassification(
      {
        executionPath: 'direct_action',
        tool: 'create_store',
        parameters: { storeName: 'X', extraClassifierKey: 'nope' },
      },
      null,
    );
    expect(v.ok).toBe(false);
    expect(v.errors?.some((e) => e.reason === 'unknown_field')).toBe(true);
  });
});

describe('create_store parameter normalization', () => {
  it('normalizeCreateStoreToolParameters maps name, category, city', () => {
    const n = normalizeCreateStoreToolParameters({
      name: 'N',
      category: 'C',
      city: 'Melbourne',
      _autoSubmit: true,
    });
    expect(n).toEqual({ storeName: 'N', storeType: 'C', location: 'Melbourne', _autoSubmit: true });
  });

  it('mergeStoreCreateFormIntoParameters overlays form onto classifier params', () => {
    const m = mergeStoreCreateFormIntoParameters(
      { name: 'LLM', _autoSubmit: true },
      { storeName: 'Form Name', storeType: 'Retail', location: 'Sydney' },
    );
    const v = validateIntakeClassification(
      { executionPath: 'direct_action', tool: 'create_store', parameters: m },
      null,
    );
    expect(v.ok).toBe(true);
    expect(v.cleanedParameters?.storeName).toBe('Form Name');
  });
});

describe('normalizePlan', () => {
  it('injects missing prerequisites and drops unrelated tools', () => {
    const llmPlan = [
      {
        step: 1,
        title: 'X',
        description: 'd',
        recommendedTool: 'generate_tags',
        parameters: {},
      },
      {
        step: 2,
        title: 'Launch',
        description: 'd',
        recommendedTool: 'launch_campaign',
        parameters: {},
      },
    ];
    const { normalizedPlan, injectedTools, droppedTools } = normalizePlan('launch_campaign', llmPlan);
    expect(droppedTools).toContain('generate_tags');
    expect(injectedTools.length).toBeGreaterThan(0);
    const tools = normalizedPlan.map((s) => s.recommendedTool);
    expect(tools).toContain('market_research');
    expect(tools).toContain('create_promotion');
    expect(tools).toContain('launch_campaign');
  });

  it('orders by plan role relative to destination chain', () => {
    const { normalizedPlan } = normalizePlan('launch_campaign', []);
    const tools = normalizedPlan.map((s) => s.recommendedTool);
    expect(tools.indexOf('market_research')).toBeLessThan(tools.indexOf('launch_campaign'));
  });

  it('improve_hero default injects analyze_store prerequisite', () => {
    const { normalizedPlan, injectedTools } = normalizePlan('improve_hero', []);
    expect(injectedTools).toContain('analyze_store');
    expect(normalizedPlan.map((s) => s.recommendedTool)).toContain('analyze_store');
  });

  it('improve_hero with skipAnalyzeStorePrerequisite omits analyze_store for hero-image direct flow', () => {
    const { normalizedPlan, injectedTools } = normalizePlan('improve_hero', [], {
      skipAnalyzeStorePrerequisite: true,
    });
    expect(injectedTools).not.toContain('analyze_store');
    expect(normalizedPlan.map((s) => s.recommendedTool)).toEqual(['improve_hero']);
  });
});

describe('evaluateExecutionPolicy', () => {
  it('allows safe_read with high confidence', () => {
    const d = evaluateExecutionPolicy({
      executionPath: 'direct_action',
      riskLevel: RISK.SAFE_READ,
      confidence: 0.9,
    });
    expect(d.decision).toBe('execute');
  });

  it('clarifies state_change direct_action below high confidence', () => {
    const d = evaluateExecutionPolicy({
      executionPath: 'direct_action',
      riskLevel: RISK.STATE_CHANGE,
      confidence: CONFIDENCE_HIGH - 0.01,
    });
    expect(d.decision).toBe('clarify');
  });

  it('requires approval for destructive', () => {
    const d = evaluateExecutionPolicy({
      executionPath: 'direct_action',
      riskLevel: RISK.DESTRUCTIVE,
      confidence: 1,
    });
    expect(d.decision).toBe('approval_required');
  });

  it('clarifies low-confidence proactive_plan', () => {
    const d = evaluateExecutionPolicy({
      executionPath: 'proactive_plan',
      riskLevel: RISK.SAFE_READ,
      confidence: CONFIDENCE_MEDIUM - 0.01,
    });
    expect(d.decision).toBe('clarify');
  });
});

describe('intakeSystemShortcuts', () => {
  it('does not shortcut first-hop store creation', () => {
    expect(detectIntent({ userMessage: 'create a store' })).toBeNull();
    expect(detectIntent({ userMessage: 'create a mini website' })).toBeNull();
  });
});
