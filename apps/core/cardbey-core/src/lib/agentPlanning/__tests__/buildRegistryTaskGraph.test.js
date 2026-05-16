/**
 * Registry-backed task graphs: all pipeline step tools resolve; unknown intents use default pipeline.
 */

import { describe, it, expect } from 'vitest';
import { getToolDefinition } from '../../toolRegistry.js';
import { INTENT_PIPELINES } from '../../missionPlan/intentPipelineRegistry.js';
import { buildRegistryTaskGraph } from '../buildRegistryTaskGraph.js';
import { validateTaskGraph } from '../llmTaskPlanner.js';

describe('buildRegistryTaskGraph', () => {
  it('each INTENT_PIPELINES entry with stepToolNames yields only valid registry tools', () => {
    for (const [intentKey, pipeline] of Object.entries(INTENT_PIPELINES)) {
      const names = pipeline.stepToolNames;
      if (!Array.isArray(names) || names.length === 0) continue;

      const graph = buildRegistryTaskGraph(intentKey);
      expect(graph.version).toBe('registry_v1');
      for (const task of graph.tasks) {
        expect(getToolDefinition(task.tool)).toBeDefined();
      }
      if (graph.tasks.length > 0) {
        expect(validateTaskGraph(graph)).toBe(true);
      }
    }
  });

  it('falls back to default pipeline for unknown intents (same graph as explicit default)', () => {
    const unknown = buildRegistryTaskGraph('__intent_that_does_not_exist__');
    const explicit = buildRegistryTaskGraph('default');
    expect(unknown).toEqual(explicit);
  });
});
