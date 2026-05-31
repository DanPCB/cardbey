import { describe, it, expect } from 'vitest';
import {
  assertExecutableTool,
  isProactiveRunwayTool,
  isRuntimeTool,
  normalizeToolName,
} from '../runtimeToolRegistry.js';
import { hydrateCompletedStepNumbers, mergeProactiveStepStatus } from '../runtimeStepState.js';

describe('runtimeToolRegistry', () => {
  it('analyze_store is accepted by runtime registry', () => {
    expect(isProactiveRunwayTool('analyze_store')).toBe(true);
    expect(isRuntimeTool('analyze_store')).toBe(true);
    expect(normalizeToolName('analyze')).toBe('analyze_store');
    const result = assertExecutableTool('analyze_store');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.canonicalTool).toBe('analyze_store');
      expect(result.dispatchTool).toBe('analyze_store');
    }
  });

  it('unknown tool is rejected, not downgraded', () => {
    const result = assertExecutableTool('totally_fake_tool_xyz');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('TOOL_UNKNOWN');
    }
  });

  it('general_chat is rejected for proactive step execution', () => {
    const result = assertExecutableTool('general_chat');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('TOOL_CHAT_ONLY');
    }
  });

  it('general_chat is never executable as a proactive runway step', () => {
    const result = assertExecutableTool('general_chat', { allowChatOnly: true });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('TOOL_CHAT_ONLY');
    }
  });
});

describe('runtimeStepState', () => {
  it('hydrates completed step numbers from metadata', () => {
    const meta = mergeProactiveStepStatus({}, 1, { status: 'completed', tool: 'analyze_store' });
    const meta2 = mergeProactiveStepStatus(meta, 2, { status: 'running', tool: 'create_promotion' });
    expect(hydrateCompletedStepNumbers(meta2)).toEqual([1]);
  });
});
