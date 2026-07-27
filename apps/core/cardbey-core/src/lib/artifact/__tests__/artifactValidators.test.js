/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { validateTopologyArtifact } from '../validateTopologyArtifact.js';
import { validatePolicyArtifact } from '../validatePolicyArtifact.js';
import { validateArtifactBundle } from '../validateToolContracts.js';

const validTopology = {
  id: 'topo-1',
  version: '1.0.0',
  missionType: 'launch_campaign',
  nodes: [
    { id: 'brief_1', toolName: 'create_campaign_brief', orderIndex: 0, dependsOn: [] },
    {
      id: 'copy_1',
      toolName: 'generate_campaign_copy',
      orderIndex: 1,
      dependsOn: ['brief_1'],
    },
  ],
  edges: [{ from: 'brief_1', to: 'copy_1', type: 'depends_on' }],
};

describe('validateTopologyArtifact', () => {
  it('accepts valid topology', () => {
    const result = validateTopologyArtifact(validTopology);
    expect(result.ok).toBe(true);
  });

  it('rejects unknown tool names', () => {
    const result = validateTopologyArtifact({
      ...validTopology,
      nodes: [{ id: 'x', toolName: 'not_a_real_tool', orderIndex: 0 }],
    });
    expect(result.ok).toBe(false);
    expect(result.errors?.some((e) => e.includes('not in intake tool registry'))).toBe(true);
  });

  it('detects dependency cycles', () => {
    const result = validateTopologyArtifact({
      ...validTopology,
      nodes: [
        { id: 'a', toolName: 'create_campaign_brief', orderIndex: 0, dependsOn: ['b'] },
        { id: 'b', toolName: 'generate_campaign_copy', orderIndex: 1, dependsOn: ['a'] },
      ],
      edges: [
        { from: 'b', to: 'a' },
        { from: 'a', to: 'b' },
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.errors?.some((e) => e.includes('cycle'))).toBe(true);
  });
});

describe('validatePolicyArtifact', () => {
  it('accepts valid policy', () => {
    const result = validatePolicyArtifact({
      id: 'pol-1',
      version: '1.0.0',
      gates: [{ type: 'manual_approval', nodeId: 'brief_1' }],
      risks: [],
    });
    expect(result.ok).toBe(true);
  });

  it('requires gate nodeId or tool', () => {
    const result = validatePolicyArtifact({
      id: 'pol-1',
      version: '1.0.0',
      gates: [{ type: 'manual_approval' }],
      risks: [],
    });
    expect(result.ok).toBe(false);
  });
});

describe('validateArtifactBundle', () => {
  it('accepts complete bundle', () => {
    const result = validateArtifactBundle({
      topology: validTopology,
      policy: {
        id: 'pol-1',
        version: '1.0.0',
        gates: [{ type: 'manual_approval', nodeId: 'brief_1' }],
        risks: [],
      },
      reasoning: {
        id: 'rea-1',
        version: '1.0.0',
        summary: 'Test plan',
        chain: [],
        phases: [],
        keyDecisions: [],
        tradeoffs: [],
      },
      toolContracts: [
        { toolName: 'create_campaign_brief', nodeId: 'brief_1' },
        { toolName: 'generate_campaign_copy', nodeId: 'copy_1' },
      ],
    });
    expect(result.ok).toBe(true);
  });
});
