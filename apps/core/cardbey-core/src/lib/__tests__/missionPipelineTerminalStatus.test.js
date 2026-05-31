import { describe, expect, it } from 'vitest';
import {
  isSuccessfulTerminalMissionPipelineStatus,
  isTerminalMissionPipelineStatus,
} from '../missionPipelineTerminalStatus.js';

describe('missionPipelineTerminalStatus', () => {
  it('treats completed, done, succeeded as successful terminal', () => {
    expect(isSuccessfulTerminalMissionPipelineStatus('completed')).toBe(true);
    expect(isSuccessfulTerminalMissionPipelineStatus('DONE')).toBe(true);
    expect(isSuccessfulTerminalMissionPipelineStatus('succeeded')).toBe(true);
    expect(isSuccessfulTerminalMissionPipelineStatus('success')).toBe(true);
    expect(isSuccessfulTerminalMissionPipelineStatus('done', { runState: 'idle' })).toBe(true);
    expect(isSuccessfulTerminalMissionPipelineStatus('executing', { runState: 'done' })).toBe(true);
  });

  it('does not treat failed/cancelled as successful terminal', () => {
    expect(isSuccessfulTerminalMissionPipelineStatus('failed')).toBe(false);
    expect(isSuccessfulTerminalMissionPipelineStatus('cancelled')).toBe(false);
    expect(isSuccessfulTerminalMissionPipelineStatus('running')).toBe(false);
  });

  it('isTerminalMissionPipelineStatus includes failed and runState done', () => {
    expect(isTerminalMissionPipelineStatus('failed')).toBe(true);
    expect(isTerminalMissionPipelineStatus('executing', { runState: 'done' })).toBe(true);
    expect(isTerminalMissionPipelineStatus('executing', { runState: 'running' })).toBe(false);
  });
});
