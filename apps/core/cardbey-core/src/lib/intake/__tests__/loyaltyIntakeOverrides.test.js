/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { applyLoyaltyTextIntentOverride } from '../loyaltyIntakeOverrides.js';

const isLoyaltyCompilerTool = (classification) =>
  String(classification?.tool ?? '') === 'setup_loyalty_program';

const shouldPreferLoyaltyOverCampaign = (text) =>
  /\bloyalty\s*campaign\b/i.test(String(text ?? ''));

const isLoyaltyCardAttachment = () => false;

describe('applyLoyaltyTextIntentOverride', () => {
  it('overrides create_store misroute for loyalty campaign text', () => {
    const result = applyLoyaltyTextIntentOverride(
      { tool: 'create_store', confidence: 0.8, parameters: {} },
      {
        userMessage: 'Create a loyalty campaign',
        isLoyaltyCompilerTool,
        shouldPreferLoyaltyOverCampaign,
        isLoyaltyCardAttachment,
      },
    );

    expect(result).not.toBeNull();
    expect(result.classification.tool).toBe('setup_loyalty_program');
    expect(result.classification._compilerEligible).toBe(true);
    expect(result.telemetry.originalTool).toBe('create_store');
    expect(result.telemetry.reason).toBe('loyalty_intent_over_store');
  });

  it('overrides create_campaign misroute for loyalty campaign text', () => {
    const result = applyLoyaltyTextIntentOverride(
      { tool: 'create_campaign', confidence: 0.75, parameters: {} },
      {
        userMessage: 'Create a loyalty campaign',
        isLoyaltyCompilerTool,
        shouldPreferLoyaltyOverCampaign,
        isLoyaltyCardAttachment,
      },
    );

    expect(result?.classification.tool).toBe('setup_loyalty_program');
    expect(result?.telemetry.reason).toBe('loyalty_intent_over_campaign');
  });

  it('no-op when already on loyalty compiler tool', () => {
    const result = applyLoyaltyTextIntentOverride(
      { tool: 'setup_loyalty_program', parameters: { storeId: 's1' } },
      {
        userMessage: 'Create a loyalty campaign',
        isLoyaltyCompilerTool,
        shouldPreferLoyaltyOverCampaign,
        isLoyaltyCardAttachment,
      },
    );

    expect(result).toBeNull();
  });
});
