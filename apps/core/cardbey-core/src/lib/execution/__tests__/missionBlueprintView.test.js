import { describe, expect, it } from 'vitest';
import { buildMissionBlueprintView } from '../missionBlueprintView.js';

describe('missionBlueprintView', () => {
  it('merges structured DB steps into blueprint view', () => {
    const view = buildMissionBlueprintView({
      id: 'mission-1',
      type: 'store',
      title: 'Create store: Test',
      executionMode: 'AUTO_RUN',
      metadataJson: { businessName: 'Test' },
      steps: [
        {
          id: 'step-logo',
          toolName: 'mission.checkpoint',
          label: 'Logo',
          stepKind: 'checkpoint',
          orderIndex: 0,
          configJson: {
            prompt: 'Upload logo?',
            options: ['Upload now', 'Skip'],
            outputKey: 'logoChoice',
          },
        },
        {
          id: 'step-build',
          toolName: 'structured_store_build',
          label: 'Build',
          stepKind: 'action',
          orderIndex: 2,
        },
      ],
    });

    expect(view.id).toBe('mission-1');
    expect(view.name).toBe('Store creation workflow');
    expect(view.version).toBe('1.0.0');
    expect(view.steps).toHaveLength(2);
    expect(view.steps[0].kind).toBe('checkpoint');
    expect(view.checkpoints).toHaveLength(1);
    expect(view.checkpoints[0].step_id).toBe('step-logo');
    expect(view.dependencies).toHaveLength(1);
  });

  it('falls back to proactive plan steps for GUIDED_RUN missions', () => {
    const view = buildMissionBlueprintView({
      id: 'mission-2',
      type: 'launch_campaign',
      title: 'Campaign',
      executionMode: 'GUIDED_RUN',
      metadataJson: {
        proactivePlan: {
          version: 1,
          plan: [
            { step: 1, title: 'Research', recommendedTool: 'market_research' },
            { step: 2, title: 'Create', recommendedTool: 'create_promotion' },
          ],
        },
      },
      steps: [],
    });

    expect(view.steps).toHaveLength(2);
    expect(view.steps[0].source).toBe('proactive');
    expect(view.steps[1].toolName).toBe('create_promotion');
  });
});
