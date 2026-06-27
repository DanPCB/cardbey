import { describe, it, expect } from 'vitest';
import {
  CAMPAIGN_CHECKPOINT_KERNEL_TOOLS,
  isCampaignCheckpointKernelTool,
  normalizeCampaignClassificationForKernel,
} from '../campaignKernelRouting.js';
import { getStructuredMissionSteps } from '../../missionPipelineStructured.js';

describe('campaignKernelRouting', () => {
  it('identifies campaign checkpoint kernel tools', () => {
    expect(CAMPAIGN_CHECKPOINT_KERNEL_TOOLS.has('launch_campaign')).toBe(true);
    expect(CAMPAIGN_CHECKPOINT_KERNEL_TOOLS.has('create_campaign')).toBe(true);
    expect(isCampaignCheckpointKernelTool('activate_campaigns')).toBe(true);
    expect(isCampaignCheckpointKernelTool('analyze_store')).toBe(false);
  });

  it('normalizes proactive_plan launch_campaign to kernel_dispatch create_campaign', () => {
    const normalized = normalizeCampaignClassificationForKernel({
      executionPath: 'proactive_plan',
      tool: 'launch_campaign',
      confidence: 0.9,
      parameters: { storeId: 'store-1', campaignContext: 'spring sale' },
    });
    expect(normalized.executionPath).toBe('kernel_dispatch');
    expect(normalized.tool).toBe('create_campaign');
    expect(normalized.parameters._sourceTool).toBe('launch_campaign');
    expect(normalized._kernelNormalizedFrom).toBe('proactive_plan');
  });

  it('structured launch_campaign steps include product and launch checkpoints', () => {
    const steps = getStructuredMissionSteps('launch_campaign', 'en');
    expect(steps.length).toBeGreaterThanOrEqual(4);
    const checkpoints = steps.filter((s) => s.stepKind === 'checkpoint');
    expect(checkpoints.length).toBe(2);
    expect(steps.some((s) => s.toolName === 'market_research')).toBe(true);
    expect(steps.some((s) => s.toolName === 'create_promotion')).toBe(true);
  });
});
