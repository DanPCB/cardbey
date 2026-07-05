import { describe, expect, it } from 'vitest';
import {
  getNodeDependencies,
  getRunnableNodeIds,
  initializeNodeStatus,
} from '../topologyNodeRunner.js';
import { buildCampaignNodeInput } from '../topologyCampaignInputs.js';

describe('topologyNodeRunner DAG helpers', () => {
  const nodes = [
    { id: 'brief_1', toolName: 'create_campaign_brief', dependsOn: [] },
    { id: 'graphics_1', toolName: 'generate_campaign_graphics', dependsOn: ['brief_1'] },
    { id: 'copy_1', toolName: 'generate_campaign_copy', dependsOn: ['brief_1'] },
    { id: 'package_1', toolName: 'package_campaign_artifact', dependsOn: ['graphics_1', 'copy_1'] },
  ];

  it('reads dependsOn from node root', () => {
    expect(getNodeDependencies(nodes[1])).toEqual(['brief_1']);
  });

  it('initializes all nodes as pending', () => {
    expect(initializeNodeStatus(nodes)).toEqual({
      brief_1: 'pending',
      graphics_1: 'pending',
      copy_1: 'pending',
      package_1: 'pending',
    });
  });

  it('returns root nodes first', () => {
    const status = initializeNodeStatus(nodes);
    expect(getRunnableNodeIds(nodes, status)).toEqual(['brief_1']);
  });

  it('unlocks parallel dependents after root completes', () => {
    const status = initializeNodeStatus(nodes);
    status.brief_1 = 'completed';
    const runnable = getRunnableNodeIds(nodes, status);
    expect(runnable).toContain('graphics_1');
    expect(runnable).toContain('copy_1');
    expect(runnable).not.toContain('package_1');
  });

  it('unlocks package after graphics and copy complete', () => {
    const status = initializeNodeStatus(nodes);
    status.brief_1 = 'completed';
    status.graphics_1 = 'completed';
    status.copy_1 = 'completed';
    expect(getRunnableNodeIds(nodes, status)).toEqual(['package_1']);
  });
});

describe('buildCampaignNodeInput', () => {
  it('wires brief objective from goal', () => {
    const input = buildCampaignNodeInput(
      { id: 'brief_1', toolName: 'create_campaign_brief' },
      { storeId: 'store-1', goal: 'Weekend brunch promo' },
    );
    expect(input).toMatchObject({ storeId: 'store-1', objective: 'Weekend brunch promo' });
  });

  it('wires package inputs from prior tool outputs', () => {
    const input = buildCampaignNodeInput(
      { id: 'package_1', toolName: 'package_campaign_artifact' },
      {
        storeId: 'store-1',
        toolOutputs: {
          create_campaign_brief: { brief: { objective: 'Brunch' } },
          generate_campaign_graphics: { graphics: [{ id: 'g1', url: 'https://example.com/a.jpg' }] },
          generate_campaign_copy: { copy: { headline: 'Brunch time', cta: 'Book now' } },
        },
      },
    );
    expect(input.brief).toEqual({ objective: 'Brunch' });
    expect(input.graphics).toHaveLength(1);
    expect(input.copy).toMatchObject({ headline: 'Brunch time' });
  });
});
