import { describe, it, expect } from 'vitest';
import { TOOLS, getToolDefinition } from '../../lib/toolRegistry.js';
import {
  PROACTIVE_RUNWAY_TOOL_NAMES,
  PROACTIVE_RUNWAY_TOOL_SET,
  SYNONYM_TOOL_NAMES,
  resolveRunwayDispatchToolName,
} from '../../lib/missionPlan/proactiveRunwayToolAllowlist.js';

describe('proactiveRunwayToolAllowlist vs toolRegistry', () => {
  it('every registered tool is on the proactive runway allowlist', () => {
    for (const t of TOOLS) {
      expect(PROACTIVE_RUNWAY_TOOL_SET.has(t.toolName)).toBe(true);
    }
  });

  it('every allowlist name is either a registry tool or a declared synonym', () => {
    const synonyms = new Set(SYNONYM_TOOL_NAMES);
    for (const name of PROACTIVE_RUNWAY_TOOL_NAMES) {
      const inRegistry = Boolean(getToolDefinition(name));
      expect(inRegistry || synonyms.has(name)).toBe(true);
    }
  });
});

describe('resolveRunwayDispatchToolName', () => {
  it('routes smart_visual to smart_visual (registered executor)', () => {
    expect(resolveRunwayDispatchToolName('smart_visual')).toBe('smart_visual');
    expect(resolveRunwayDispatchToolName('Smart_Visual')).toBe('smart_visual');
  });

  it('routes generate_mini_website and mini_website aliases to create_promotion', () => {
    expect(resolveRunwayDispatchToolName('generate_mini_website')).toBe('create_promotion');
    expect(resolveRunwayDispatchToolName('mini_website')).toBe('create_promotion');
  });
});
