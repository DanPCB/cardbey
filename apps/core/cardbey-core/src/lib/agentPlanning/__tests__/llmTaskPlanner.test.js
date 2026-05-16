import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../llm/llmGateway.ts', () => ({
  llmGateway: { generate: vi.fn() },
}));

import { llmGateway } from '../../llm/llmGateway.ts';
import {
  validateTaskGraph,
  isLlmPlannerEnabledForIntent,
  planTaskGraphForIntent,
} from '../llmTaskPlanner.js';
import { buildRegistryTaskGraph } from '../buildRegistryTaskGraph.js';

describe('validateTaskGraph', () => {
  it('accepts a minimal valid graph', () => {
    expect(
      validateTaskGraph({
        tasks: [
          {
            id: 's1',
            tool: 'analyze_store',
            label: 'Analyze',
            dependsOn: [],
            agentHint: 'dispatchTool',
          },
        ],
      }),
    ).toBe(true);
  });

  it('rejects empty tasks', () => {
    expect(validateTaskGraph({ tasks: [] })).toBe(false);
  });

  it('rejects duplicate task ids', () => {
    expect(
      validateTaskGraph({
        tasks: [
          { id: 'x', tool: 'analyze_store', label: 'a', dependsOn: [], agentHint: 'dispatchTool' },
          { id: 'x', tool: 'generate_tags', label: 'b', dependsOn: [], agentHint: 'dispatchTool' },
        ],
      }),
    ).toBe(false);
  });

  it('rejects unknown tools', () => {
    expect(
      validateTaskGraph({
        tasks: [
          {
            id: 's1',
            tool: 'not_a_registered_tool_xyz',
            label: 'x',
            dependsOn: [],
            agentHint: 'dispatchTool',
          },
        ],
      }),
    ).toBe(false);
  });

  it('rejects circular dependencies', () => {
    expect(
      validateTaskGraph({
        tasks: [
          { id: 'a', tool: 'analyze_store', label: 'a', dependsOn: ['b'], agentHint: 'dispatchTool' },
          { id: 'b', tool: 'generate_tags', label: 'b', dependsOn: ['a'], agentHint: 'dispatchTool' },
        ],
      }),
    ).toBe(false);
  });

  it('rejects missing dependency id', () => {
    expect(
      validateTaskGraph({
        tasks: [
          { id: 'a', tool: 'analyze_store', label: 'a', dependsOn: ['missing'], agentHint: 'dispatchTool' },
        ],
      }),
    ).toBe(false);
  });
});

describe('buildRegistryTaskGraph', () => {
  it.each(['launch_campaign', 'store_improvement', 'generate_social_posts'])(
    'produces a valid graph for %s',
    (intentType) => {
      const graph = buildRegistryTaskGraph(intentType);
      expect(graph.version).toBe('registry_v1');
      expect(graph.tasks.length).toBeGreaterThan(0);
      expect(validateTaskGraph(graph)).toBe(true);
    },
  );
});

describe('isLlmPlannerEnabledForIntent', () => {
  const prev = process.env.USE_LLM_TASK_PLANNER;

  afterEach(() => {
    if (prev === undefined) delete process.env.USE_LLM_TASK_PLANNER;
    else process.env.USE_LLM_TASK_PLANNER = prev;
  });

  it('returns true when USE_LLM_TASK_PLANNER=true', () => {
    process.env.USE_LLM_TASK_PLANNER = 'true';
    expect(isLlmPlannerEnabledForIntent('launch_campaign')).toBe(true);
  });

  it('returns false when USE_LLM_TASK_PLANNER is unset or not true', () => {
    delete process.env.USE_LLM_TASK_PLANNER;
    expect(isLlmPlannerEnabledForIntent('launch_campaign')).toBe(false);
    process.env.USE_LLM_TASK_PLANNER = 'false';
    expect(isLlmPlannerEnabledForIntent('launch_campaign')).toBe(false);
  });
});

describe('planTaskGraphForIntent', () => {
  const prevPlanner = process.env.USE_LLM_TASK_PLANNER;
  const prevLlm = process.env.LLM_ENABLED;

  beforeEach(() => {
    vi.mocked(llmGateway.generate).mockReset();
  });

  afterEach(() => {
    if (prevPlanner === undefined) delete process.env.USE_LLM_TASK_PLANNER;
    else process.env.USE_LLM_TASK_PLANNER = prevPlanner;
    if (prevLlm === undefined) delete process.env.LLM_ENABLED;
    else process.env.LLM_ENABLED = prevLlm;
  });

  it('uses registry fallback when planner env is off', async () => {
    delete process.env.USE_LLM_TASK_PLANNER;
    const out = await planTaskGraphForIntent({
      intentType: 'launch_campaign',
      tenantKey: 't1',
      context: {},
    });
    expect(out.ok).toBe(true);
    expect(out.source).toBe('registry_fallback');
    expect(out.taskGraph?.tasks?.length).toBeGreaterThan(0);
  });

  it('uses LLM graph when enabled and gateway returns valid JSON', async () => {
    process.env.USE_LLM_TASK_PLANNER = 'true';
    process.env.LLM_ENABLED = 'true';
    vi.mocked(llmGateway.generate).mockResolvedValue({
      text: JSON.stringify({
        tasks: [
          {
            id: 't1',
            tool: 'market_research',
            label: 'Research',
            dependsOn: [],
            agentHint: 'dispatchTool',
          },
        ],
      }),
    });
    const out = await planTaskGraphForIntent({
      intentType: 'launch_campaign',
      tenantKey: 't1',
      context: { storeId: 's1' },
    });
    expect(out.ok).toBe(true);
    expect(out.source).toBe('llm');
    expect(out.taskGraph?.tasks?.[0]?.tool).toBe('market_research');
  });
});
