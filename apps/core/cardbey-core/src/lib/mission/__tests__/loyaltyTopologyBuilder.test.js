/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import {
  buildLoyaltyProgramTopology,
  loyaltyBuilderToArtifactBundle,
} from '../loyaltyTopologyBuilder.js';
import { compileWithMultiAgent } from '../../agents/compileWithMultiAgent.js';
import { normalizeTopologyError, buildTopologyFailureSummary } from '../topologyExecutionTelemetry.js';
import { listMissingOwnerFields } from '../../toolExecutors/loyalty/loyaltyStageHandlers.js';

describe('loyaltyTopologyBuilder', () => {
  it('emits typed loyalty stage tools, not setup_loyalty_program on every node', () => {
    const built = buildLoyaltyProgramTopology({
      text: 'create a loyalty program from this card',
      storeId: 'store_1',
    });
    const tools = built.nodes.map((n) => n.toolName);
    expect(tools).toEqual([
      'loyalty.load_store_context',
      'loyalty.analyze_attachment',
      'loyalty.infer_requirements',
      'loyalty.generate_draft',
      'loyalty.validate_draft',
      'loyalty.persist_draft',
      'loyalty.present_review',
    ]);
    expect(tools.every((t) => t === 'setup_loyalty_program')).toBe(false);
    expect(built.nodes.every((n) => n.stage && n.title && typeof n.retryable === 'boolean')).toBe(true);
  });

  it('compileWithMultiAgent uses loyaltyTopologyBuilder for loyalty intents', async () => {
    const result = await compileWithMultiAgent(
      {
        text: 'create a loyalty program from this card',
        tool: 'setup_loyalty_program',
        missionType: 'setup_loyalty_program',
        storeId: 'store_1',
        parameters: {},
      },
      { missionId: 'mission_loyalty_typed', storeId: 'store_1' },
    );
    expect(result.builder).toBe('loyaltyTopologyBuilder');
    const tools = result.artifactBundle.topology.nodes.map((n) => n.toolName);
    expect(tools).toContain('loyalty.load_store_context');
    expect(tools.every((t) => t === 'setup_loyalty_program')).toBe(false);
    expect(result.validation.ok).toBe(true);
  });

  it('loyaltyBuilderToArtifactBundle validates', () => {
    const built = buildLoyaltyProgramTopology({ text: 'loyalty', storeId: 's1' });
    const bundle = loyaltyBuilderToArtifactBundle(built);
    expect(bundle.topology.nodes).toHaveLength(7);
    expect(bundle.metadata.builder).toBe('loyaltyTopologyBuilder');
  });
});

describe('loyalty missing owner fields', () => {
  it('lists reward and stampThreshold when absent', () => {
    expect(listMissingOwnerFields({})).toEqual(['reward', 'stampThreshold']);
    expect(listMissingOwnerFields({ reward: 'Free coffee', requiredStamps: 9 })).toEqual([]);
  });
});

describe('failure reason mapping', () => {
  it('does not echo node title as reason', () => {
    const longTitle =
      'Analyze the store context and gather requirements for setting up a loyalty program';
    const err = normalizeTopologyError(
      { message: `${longTitle} failed` },
      { labels: { en: longTitle }, toolName: 'loyalty.load_store_context' },
    );
    expect(err.message).not.toBe(`${longTitle} failed`);
    expect(err.message.toLowerCase()).not.toBe(longTitle.toLowerCase());

    const summary = buildTopologyFailureSummary(
      {
        failedNodeIds: ['n1'],
        nodeOutputs: {
          n1: { error: { message: 'Store category is missing.' } },
        },
      },
      [{ id: 'n1', labels: { en: longTitle }, toolName: 'loyalty.load_store_context' }],
    );
    expect(summary.reason).toBe('Store category is missing.');
    expect(summary.detail).toBe('Store category is missing.');
    expect(summary.reason).not.toBe(longTitle);
  });
});
