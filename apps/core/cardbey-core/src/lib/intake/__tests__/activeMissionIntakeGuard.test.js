import { describe, expect, it } from 'vitest';
import {
  guardClassificationForActiveMission,
  isActiveMissionStatus,
  isProactiveStepCommand,
  isMissionContinuationCommand,
  shouldSkipAgentLoopForActiveMission,
} from '../activeMissionIntakeGuard.js';

describe('activeMissionIntakeGuard', () => {
  const baseChat = {
    executionPath: 'chat',
    tool: 'general_chat',
    confidence: 0.2,
    parameters: {},
  };

  it('isActiveMissionStatus recognizes running missions', () => {
    expect(isActiveMissionStatus('running')).toBe(true);
    expect(isActiveMissionStatus('awaiting_confirmation')).toBe(true);
    expect(isActiveMissionStatus('completed')).toBe(false);
  });

  it('A — proactive step command routes to resume_active_mission, not general_chat', () => {
    const out = guardClassificationForActiveMission(baseChat, {
      missionStatus: 'running',
      missionId: 'm-video-1',
      userMessage: 'Run proactive step 1 (Generate promo video).',
    });
    expect(out.tool).toBe('resume_active_mission');
    expect(out.executionPath).toBe('resume_active_mission');
    expect(out.parameters.missionId).toBe('m-video-1');
    expect(out.parameters.stepId).toBe(1);
  });

  it('B — campaign mission step preserves missionId in guard output', () => {
    const out = guardClassificationForActiveMission(baseChat, {
      missionStatus: 'executing',
      missionId: 'm-campaign-9',
      userMessage: 'Run proactive step 1 (Market research).',
      body: {
        missionStepAction: {
          actionType: 'mission_step_action',
          missionId: 'm-campaign-9',
          stepId: 1,
          command: 'run_step',
        },
      },
    });
    expect(out.tool).toBe('resume_active_mission');
    expect(out.parameters.missionId).toBe('m-campaign-9');
  });

  it('C — continue during active mission routes to resume_active_mission', () => {
    const out = guardClassificationForActiveMission(baseChat, {
      missionStatus: 'running',
      missionId: 'm-1',
      userMessage: 'continue',
    });
    expect(out.executionPath).toBe('resume_active_mission');
    expect(out.parameters.command).toBe('continue');
  });

  it('D — unrelated text during active mission clarifies instead of general_chat', () => {
    const out = guardClassificationForActiveMission(baseChat, {
      missionStatus: 'running',
      missionId: 'm-1',
      userMessage: 'What is the weather today?',
    });
    expect(out.executionPath).toBe('clarify');
    expect(out.tool).toBe('resume_active_mission');
    expect(out.message).toMatch(/current mission or start a new mission/i);
    expect(out.clarifyOptions?.length).toBeGreaterThan(0);
  });

  it('does not guard when mission is completed', () => {
    const out = guardClassificationForActiveMission(baseChat, {
      missionStatus: 'completed',
      missionId: 'm-1',
      userMessage: 'hello',
    });
    expect(out).toBe(baseChat);
  });

  it('detects proactive step commands', () => {
    expect(isProactiveStepCommand('Run next step')).toBe(true);
    expect(isProactiveStepCommand('Run proactive step 2 (Title)')).toBe(true);
    expect(isProactiveStepCommand('hello')).toBe(false);
  });

  it('detects continuation commands', () => {
    expect(isMissionContinuationCommand('continue')).toBe(true);
    expect(isMissionContinuationCommand('resume')).toBe(true);
  });

  it('skips agent loop for proactive step on active mission', () => {
    expect(
      shouldSkipAgentLoopForActiveMission('running', 'Run proactive step 1 (Video).', {}),
    ).toBe(true);
    expect(shouldSkipAgentLoopForActiveMission('completed', 'Run proactive step 1', {})).toBe(false);
  });
});
