import { describe, it, expect } from 'vitest';
import { TOOLS, getToolDefinition } from '../../lib/toolRegistry.js';
import {
  PROACTIVE_RUNWAY_ALIAS_NAMES,
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

  it('every allowlist name is a registry tool, derived alias string, or SYNONYM_TOOL_NAMES', () => {
    const synonymSet = new Set(SYNONYM_TOOL_NAMES);
    const aliasSet = new Set(PROACTIVE_RUNWAY_ALIAS_NAMES);
    for (const name of PROACTIVE_RUNWAY_TOOL_NAMES) {
      expect(Boolean(getToolDefinition(name)) || aliasSet.has(name) || synonymSet.has(name)).toBe(true);
    }
  });

  it('PROACTIVE_RUNWAY_TOOL_SET size is stable (Phase 3-1 contract)', () => {
    expect(PROACTIVE_RUNWAY_TOOL_SET.size).toBe(59);
  });
});

describe('resolveRunwayDispatchToolName (data-driven from toolRegistry aliases)', () => {
  it('maps registry aliases to canonical tool names', () => {
    expect(resolveRunwayDispatchToolName('analyze')).toBe('analyze_store');
    expect(resolveRunwayDispatchToolName('tags')).toBe('generate_tags');
    expect(resolveRunwayDispatchToolName('rewrite')).toBe('rewrite_descriptions');
    expect(resolveRunwayDispatchToolName('hero')).toBe('improve_hero');
    expect(resolveRunwayDispatchToolName('campaign_research')).toBe('market_research');
    expect(resolveRunwayDispatchToolName('generate_mini_website')).toBe('create_promotion');
    expect(resolveRunwayDispatchToolName('mini_website')).toBe('create_promotion');
    expect(resolveRunwayDispatchToolName('show_promotion')).toBe('activate_promotion');
    expect(resolveRunwayDispatchToolName('display_promotion')).toBe('activate_promotion');
    expect(resolveRunwayDispatchToolName('publish_promotion')).toBe('activate_promotion');
    expect(resolveRunwayDispatchToolName('show_promo')).toBe('activate_promotion');
    expect(resolveRunwayDispatchToolName('content')).toBe('content_creator');
    expect(resolveRunwayDispatchToolName('social_posts')).toBe('generate_social_posts');
  });

  it('passthrough for canonical names and unknowns', () => {
    expect(resolveRunwayDispatchToolName('smart_visual')).toBe('smart_visual');
    expect(resolveRunwayDispatchToolName('Smart_Visual')).toBe('smart_visual');
    expect(resolveRunwayDispatchToolName('start_build_store')).toBe('start_build_store');
    expect(resolveRunwayDispatchToolName('publish_store')).toBe('publish_store');
    expect(resolveRunwayDispatchToolName('unknown_tool')).toBe('unknown_tool');
  });
});

describe('operator tools on proactive runway', () => {
  const OPERATOR_TOOL_NAMES = [
    'start_build_store',
    'get_draft_by_run',
    'get_draft_summary',
    'poll_orchestra_job',
    'publish_store',
    'log_event',
    'run_pipeline',
  ];

  it('each operator tool is in PROACTIVE_RUNWAY_TOOL_SET', () => {
    for (const name of OPERATOR_TOOL_NAMES) {
      expect(PROACTIVE_RUNWAY_TOOL_SET.has(name)).toBe(true);
    }
  });
});

describe('SYNONYM_TOOL_NAMES', () => {
  it('contains only special-case and operator strings (aliases live on TOOLS)', () => {
    expect(SYNONYM_TOOL_NAMES).toEqual([
      'general_chat',
      'code_fix',
      'generate_slideshow',
      'start_build_store',
      'get_draft_by_run',
      'get_draft_summary',
      'poll_orchestra_job',
      'publish_store',
      'log_event',
      'run_pipeline',
    ]);
  });

  it('mini_website is not on allowlist but still resolves', () => {
    expect(PROACTIVE_RUNWAY_TOOL_SET.has('mini_website')).toBe(false);
    expect(resolveRunwayDispatchToolName('mini_website')).toBe('create_promotion');
  });
});
