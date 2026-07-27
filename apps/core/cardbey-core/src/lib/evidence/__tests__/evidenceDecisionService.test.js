/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import {
  ExplicitFallbackRequiredError,
  resolveRendererModeWithDecision,
} from '../evidenceDecisionService.js';
import { createMissionEvidenceGraph } from '../../mission/missionEvidenceGraph.js';
import { computeTopologyHash } from '../../mission/topologyHash.js';
import { validateGraphContractConsistency, ContractGraphMismatchError } from '../../mission/missionValidator.js';

describe('evidenceDecisionService', () => {
  it('selects TOPOLOGY_DRIVEN for authoritative topology', () => {
    const graph = createMissionEvidenceGraph({ domain: 'loyalty' });
    const result = resolveRendererModeWithDecision({
      graph,
      creationMode: 'SOURCE_DRIVEN',
      cardTopology: {
        source: 'VISION_EXTRACTED',
        rows: 2,
        columns: 5,
        cells: [{ row: 0, column: 0, role: 'PURCHASE' }],
        confidence: 0.9,
        reviewRequired: false,
      },
    });
    expect(result.mode).toBe('TOPOLOGY_DRIVEN');
    expect(result.decision.fallback).toBe(false);
  });

  it('throws ExplicitFallbackRequiredError for SOURCE_DRIVEN without topology', () => {
    expect(() =>
      resolveRendererModeWithDecision({
        creationMode: 'SOURCE_DRIVEN',
        cardTopology: null,
      }),
    ).toThrow(ExplicitFallbackRequiredError);
  });

  it('allows DEFAULT_TEMPLATE for INTENT_DRIVEN without owner ack', () => {
    const result = resolveRendererModeWithDecision({
      creationMode: 'INTENT_DRIVEN',
      cardTopology: null,
    });
    expect(result.mode).toBe('DEFAULT_TEMPLATE');
    expect(result.decision.fallback).toBe(true);
  });

  it('throws when LOYALTY_DISABLE_DEFAULT_TEMPLATE=true', () => {
    const prev = process.env.LOYALTY_DISABLE_DEFAULT_TEMPLATE;
    process.env.LOYALTY_DISABLE_DEFAULT_TEMPLATE = 'true';
    try {
      expect(() =>
        resolveRendererModeWithDecision({
          creationMode: 'INTENT_DRIVEN',
          cardTopology: null,
        }),
      ).toThrow(expect.objectContaining({ code: 'DEFAULT_TEMPLATE_DISABLED' }));
    } finally {
      if (prev === undefined) delete process.env.LOYALTY_DISABLE_DEFAULT_TEMPLATE;
      else process.env.LOYALTY_DISABLE_DEFAULT_TEMPLATE = prev;
    }
  });
});

describe('validateGraphContractConsistency', () => {
  it('allows graph version to advance beyond frozen contract baseline', () => {
    const graph = createMissionEvidenceGraph({ domain: 'loyalty', version: 4 });
    expect(() =>
      validateGraphContractConsistency(graph, {
        evidenceGraphVersion: 1,
        evidenceGraphId: graph.graphId,
      }),
    ).not.toThrow();
  });

  it('throws when graph version regresses below frozen contract baseline', () => {
    const graph = createMissionEvidenceGraph({ domain: 'loyalty', version: 1 });
    expect(() =>
      validateGraphContractConsistency(graph, {
        evidenceGraphVersion: 4,
        evidenceGraphId: graph.graphId,
      }),
    ).toThrow(ContractGraphMismatchError);
  });

  it('throws when topology hash drifts', () => {
    const topology = {
      source: 'VISION_EXTRACTED',
      rows: 2,
      columns: 5,
      cells: [{ row: 0, column: 0, role: 'PURCHASE' }],
      cycles: [],
    };
    const graph = createMissionEvidenceGraph({ domain: 'loyalty', version: 2 });
    graph.topology = topology;
    expect(() =>
      validateGraphContractConsistency(graph, {
        evidenceGraphVersion: 2,
        topologyHash: 'deadbeef',
        evidenceGraphId: graph.graphId,
      }),
    ).toThrow(ContractGraphMismatchError);
    expect(computeTopologyHash(topology)).not.toBe('deadbeef');
  });

  it('allows lifecycle source change when structure matches frozen hash', () => {
    const structural = {
      rows: 3,
      columns: 8,
      cells: [{ row: 0, column: 0, role: 'PURCHASE' }],
      cycles: [],
    };
    const graph = createMissionEvidenceGraph({ domain: 'loyalty', version: 2 });
    graph.topology = { ...structural, source: 'APPROVED' };
    const hash = computeTopologyHash({ ...structural, source: 'VISION_EXTRACTED' });
    expect(() =>
      validateGraphContractConsistency(graph, {
        evidenceGraphVersion: 2,
        topologyHash: hash,
        evidenceGraphId: graph.graphId,
      }),
    ).not.toThrow();
  });
});
