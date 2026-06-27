import { describe, it, expect } from 'vitest';
import {
  detectPromotionGraphicIntent,
  isPromotionGraphicIntent,
} from '../intakeSystemShortcuts.js';
import { detectCapabilityGap } from '../intakeCapabilityGap.js';
import { validateIntakeClassification } from '../intakeContractValidate.js';
import { normalizeClassificationForKernel } from '../../runtime/kernelMandatory.js';

describe('detectPromotionGraphicIntent', () => {
  it('matches "Create a promotion graphic for my new spring collection dresses"', () => {
    const msg = 'Create a promotion graphic for my new spring collection dresses';
    expect(isPromotionGraphicIntent(msg)).toBe(true);
    const hit = detectPromotionGraphicIntent(msg, 'store-1');
    expect(hit?.tool).toBe('create_promotion_graphic');
    expect(hit?.executionPath).toBe('proactive_plan');
    expect(hit?.params.prompt).toBe(msg);
    expect(hit?.params.storeId).toBe('store-1');
  });

  it('passes intake validation after kernel mandatory normalizes direct_action', () => {
    const msg = 'Create a promotion graphic for my new spring collection dresses';
    const normalized = normalizeClassificationForKernel({
      executionPath: 'direct_action',
      tool: 'create_promotion_graphic',
      parameters: { storeId: 'store-1', prompt: msg, description: msg },
    });
    expect(normalized.executionPath).toBe('proactive_plan');
    const validation = validateIntakeClassification(normalized, 'store-1');
    expect(validation.ok).toBe(true);
  });

  it('returns null without active store', () => {
    expect(
      detectPromotionGraphicIntent('Create a promotion graphic for spring dresses', null),
    ).toBeNull();
  });

  it('does not match launch campaign phrasing', () => {
    expect(isPromotionGraphicIntent('Launch a campaign for spring dresses')).toBe(false);
  });
});

describe('detectCapabilityGap promotion graphic suppression', () => {
  it('does not flag promotion graphic as capability gap on general_chat', async () => {
    const msg = 'Create a promotion graphic for my new spring collection dresses';
    const gap = await detectCapabilityGap({
      userMessage: msg,
      classification: { tool: 'general_chat', executionPath: 'chat' },
      validationErrors: [],
      intentResolution: { confidence: 0.4 },
    });
    expect(gap.isGap).toBe(false);
    expect(gap.reason).toBe('promotion_graphic_registered_tool');
  });
});
