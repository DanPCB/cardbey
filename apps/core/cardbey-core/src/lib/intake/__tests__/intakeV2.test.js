import { describe, expect, it } from 'vitest';
import { validateToolParameters, getToolEntry, isRegisteredTool, RISK } from '../intakeToolRegistry.js';
import {
  validateIntakeClassification,
  normalizeCreateStoreToolParameters,
  mergeStoreCreateFormIntoParameters,
} from '../intakeContractValidate.js';
import { normalizePlan, mergePlanLevelParametersIntoSteps } from '../intakeNormalizePlan.js';
import { evaluateExecutionPolicy, CONFIDENCE_HIGH, CONFIDENCE_MEDIUM } from '../intakeExecutionPolicy.js';
import { blockCreateStoreOnCompletedMission, detectIntent, validateCreateStorePayload } from '../intakeSystemShortcuts.js';

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
      { executionPath: 'proactive_plan', tool: 'orders_report', parameters: {} },
      null,
    );
    expect(v.ok).toBe(false);
    expect(v.downgradedTo).toBe('chat');
  });

  it('allows replace_store_catalog with draftId but no storeId', () => {
    const v = validateIntakeClassification(
      { executionPath: 'proactive_plan', tool: 'replace_store_catalog', parameters: {} },
      null,
      { draftId: 'draft-1' },
    );
    expect(v.ok).toBe(true);
  });

  it('accepts create_store when classifier used alias "name" (maps to storeName)', () => {
    const v = validateIntakeClassification(
      {
        executionPath: 'proactive_plan',
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
        executionPath: 'proactive_plan',
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

  it('normalizeCreateStoreToolParameters strips reasoner metadata (source, intentLabel)', () => {
    const n = normalizeCreateStoreToolParameters({
      storeName: 'My Cafe',
      storeType: 'Food & drink',
      location: 'Melbourne',
      intentMode: 'store',
      _autoSubmit: true,
      source: 'store_create_form',
      intentLabel: 'Create store',
    });
    expect(n).toEqual({
      storeName: 'My Cafe',
      storeType: 'Food & drink',
      location: 'Melbourne',
      intentMode: 'store',
      _autoSubmit: true,
    });
    const v = validateIntakeClassification(
      { executionPath: 'proactive_plan', tool: 'create_store', parameters: n },
      null,
    );
    expect(v.ok).toBe(true);
  });

  it('normalizeCreateStoreToolParameters strips manual mode metadata', () => {
    const n = normalizeCreateStoreToolParameters({
      storeName: 'My Cafe',
      storeType: 'Food & drink',
      location: 'Melbourne',
      intentMode: 'store',
      _autoSubmit: true,
      _performerMode: 'manual',
      _performerSource: 'performer',
      _manualAction: 'create_store',
      intentText: 'Create store: My Cafe',
    });
    const v = validateIntakeClassification(
      { executionPath: 'proactive_plan', tool: 'create_store', parameters: n },
      null,
    );
    expect(v.ok).toBe(true);
  });

  it('mergeStoreCreateFormIntoParameters overlays form onto classifier params', () => {
    const m = mergeStoreCreateFormIntoParameters(
      { name: 'LLM', _autoSubmit: true },
      { storeName: 'Form Name', storeType: 'Retail', location: 'Sydney' },
    );
    const v = validateIntakeClassification(
      { executionPath: 'proactive_plan', tool: 'create_store', parameters: m },
      null,
    );
    expect(v.ok).toBe(true);
    expect(v.cleanedParameters?.storeName).toBe('Form Name');
  });

  it('skips planner plan step validation for create_store checkpoint runway', () => {
    const v = validateIntakeClassification(
      {
        executionPath: 'proactive_plan',
        tool: 'create_store',
        parameters: {
          storeName: 'my Cafe',
          storeType: 'Food & drink',
          location: 'Melbourne',
          intentMode: 'store',
          _autoSubmit: true,
        },
        plan: [{ step: 1, recommendedTool: 'validate_store_input' }],
      },
      null,
    );
    expect(v.ok).toBe(true);
  });

  it('accepts structured draft submit metadata spilled into parameters', () => {
    const v = validateIntakeClassification(
      {
        executionPath: 'proactive_plan',
        tool: 'create_store',
        parameters: {
          storeName: 'ABC Bakery',
          storeType: 'Food & drink',
          location: 'Melbourne',
          intentMode: 'store',
          _autoSubmit: true,
          source: 'store_creation_draft',
          storeCreationDraft: { name: 'ABC Bakery', category: 'Food & drink', location: 'Melbourne' },
          storeCreateForm: { storeName: 'ABC Bakery', storeType: 'Food & drink', location: 'Melbourne' },
          traceId: 'trace-1',
          workspaceId: 'ws-1',
        },
      },
      null,
    );
    expect(v.ok).toBe(true);
    expect(v.cleanedParameters?.source).toBeUndefined();
    expect(v.cleanedParameters?.storeCreationDraft).toBeUndefined();
    expect(v.cleanedParameters?.storeCreateForm).toBeUndefined();
    expect(v.cleanedParameters?._autoSubmit).toBe(true);
  });

  it('still rejects unknown business keys in create_store parameters after metadata strip', () => {
    const v = validateIntakeClassification(
      {
        executionPath: 'proactive_plan',
        tool: 'create_store',
        parameters: {
          storeName: 'ABC Bakery',
          storeType: 'Food & drink',
          location: 'Melbourne',
          _autoSubmit: true,
          source: 'store_creation_draft',
          unknownBusinessField: 'nope',
        },
      },
      null,
    );
    expect(v.ok).toBe(false);
    expect(v.errors?.some((e) => e.field === 'unknownBusinessField' && e.reason === 'unknown_field')).toBe(
      true,
    );
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

describe('mergePlanLevelParametersIntoSteps', () => {
  it('merges prompt and storeId into standalone destination step', () => {
    const { normalizedPlan } = normalizePlan('create_promotion_graphic', []);
    const merged = mergePlanLevelParametersIntoSteps(
      normalizedPlan,
      {
        storeId: 'store-1',
        prompt: 'Create a promotion graphic for spring dresses',
        description: 'Create a promotion graphic for spring dresses',
      },
      'create_promotion_graphic',
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].parameters?.storeId).toBe('store-1');
    expect(merged[0].parameters?.prompt).toContain('spring dresses');
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
  it('does not shortcut first-hop store creation from message alone', () => {
    expect(detectIntent({ userMessage: 'create a store' })).toBeNull();
    expect(detectIntent({ userMessage: 'create a mini website' })).toBeNull();
  });

  it('shortcuts create_store website runway when primaryMode is create and message asks for website', () => {
    expect(
      detectIntent({ userMessage: 'Create my website', primaryMode: 'create' }),
    ).toEqual({ type: 'create_store', intentMode: 'website', intentLabel: 'create_mini_website' });
  });

  it('shortcuts create_store store runway when primaryMode is create and message asks for store', () => {
    expect(
      detectIntent({ userMessage: 'Create my store', primaryMode: 'create' }),
    ).toEqual({ type: 'create_store', intentMode: 'store', intentLabel: 'create_store' });
  });

  it('clarifies when primaryMode is create but runway is ambiguous', () => {
    expect(
      detectIntent({
        userMessage: 'create a store and a mini website',
        primaryMode: 'create',
      }),
    ).toEqual({
      type: 'clarify_create_runway',
      message: expect.stringMatching(/online store|mini website/i),
    });
  });

  it('clarifies frontscreen create handoff without a concrete runway in the message', () => {
    expect(
      detectIntent({
        userMessage: 'Help me get started',
        intentSource: 'frontscreen',
        primaryMode: 'create',
      }),
    ).toEqual({
      type: 'clarify_create_runway',
      message: expect.stringMatching(/online store|mini website/i),
    });
  });

  it('shortcuts website mode when primaryMode is website', () => {
    expect(detectIntent({ userMessage: 'x', primaryMode: 'website' })).toEqual({
      type: 'create_store',
      intentMode: 'website',
      intentLabel: 'create_mini_website',
    });
  });

  it('does not shortcut casual greetings even with store_setup primaryMode', () => {
    expect(detectIntent({ userMessage: 'hi', primaryMode: 'store_setup' })).toBeNull();
    expect(detectIntent({ userMessage: 'hello', primaryModeHint: 'store_setup' })).toBeNull();
    expect(detectIntent({ userMessage: 'hi', primaryMode: 'website' })).toBeNull();
  });

  it('does not shortcut frontscreen campaign handoff', () => {
    expect(
      detectIntent({
        userMessage: 'Run a promotion',
        intentSource: 'frontscreen',
        primaryMode: 'campaign',
      }),
    ).toBeNull();
  });

  it('blocks create_store on completed missions', () => {
    expect(blockCreateStoreOnCompletedMission('completed', 'create_store')).toEqual({
      tool: 'general_chat',
      confidence: 0.5,
    });
    expect(blockCreateStoreOnCompletedMission('running', 'create_store')).toBeNull();
    expect(blockCreateStoreOnCompletedMission('completed', 'update_store_hero')).toBeNull();
  });

  it('shortcuts create_store when structured storeCreateForm has storeName', () => {
    expect(
      detectIntent({
        userMessage: 'Smoke Cafe · mini website · Food & drink',
        storeCreateForm: {
          storeName: 'Smoke Cafe',
          storeType: 'Food & drink',
          location: 'Melbourne',
          intentMode: 'website',
        },
      }),
    ).toEqual({ type: 'create_store', intentMode: 'website' });
  });
});

describe('validateCreateStorePayload', () => {
  it('flags location shorter than 2 chars', () => {
    const e = validateCreateStorePayload({
      storeCreateForm: {
        storeName: 'My Shop',
        location: 'm',
        storeType: 'Retail',
      },
    });
    expect(e.some((x) => x.field === 'location')).toBe(true);
  });

  it('accepts complete storeCreateForm envelope', () => {
    expect(
      validateCreateStorePayload({
        storeCreateForm: {
          storeName: 'My Shop',
          location: 'Melbourne',
          storeType: 'Food & drink',
        },
      }),
    ).toHaveLength(0);
  });
});
