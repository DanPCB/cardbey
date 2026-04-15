import { describe, it, expect } from 'vitest';
import { TOOLS, getToolDefinition } from '../../lib/toolRegistry.js';
import {
  PROACTIVE_RUNWAY_TOOL_NAMES,
  PROACTIVE_RUNWAY_TOOL_SET,
  SYNONYM_TOOL_NAMES,
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
