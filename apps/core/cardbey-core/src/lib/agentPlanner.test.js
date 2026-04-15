import { describe, it, expect } from 'vitest';
import { planMissionFromIntent } from './agentPlanner.js';

describe('planMissionFromIntent', () => {
  it('maps personal profile phrases to missionType create_personal_profile (not store)', () => {
    const samples = [
      'create my personal profile',
      'personal presence',
      'set up my personal profile',
      'my digital card',
    ];
    for (const intent of samples) {
      const r = planMissionFromIntent({ intent });
      expect(r.ok, intent).toBe(true);
      expect(r.missionPlan?.missionType, intent).toBe('create_personal_profile');
      expect(r.missionPlan?.metadata?.orchestraGoal, intent).toBe('create_personal_profile');
    }
  });

  it('does not keyword-match store creation phrases (routed by intakeClassifier)', () => {
    const r = planMissionFromIntent({ intent: 'create a store' });
    expect(r.ok).toBe(true);
    expect(r.missionPlan?.missionType).toBe('assistant_chat');
  });
});
