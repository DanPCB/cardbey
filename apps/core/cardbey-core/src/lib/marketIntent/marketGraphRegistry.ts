/**
 * In-memory market graph registry — admits nodes and triggers bidirectional reciprocal search.
 * Production persistence is a later phase; matching uses canonical evaluateReciprocalMatch only.
 */
import type { MarketGraphNode } from './marketGraphNode.js';
import { evaluateReciprocalMatchPair } from './evaluateReciprocalMatch.js';
import { isEligibleMatchPair } from './marketMatchCandidateRetrieval.js';
import type { MarketMatch, ReciprocalBand } from './marketMatchTypes.js';

export type StoredMarketGraphNode = MarketGraphNode & {
  admittedAt: string;
  updatedAt: string;
};

export type MarketGraphAdmissionResult = {
  node: StoredMarketGraphNode;
  /** Matches against all pre-existing nodes (NEW vs EXISTING). */
  matches: MarketMatch[];
};

const BAND_RANK: Record<ReciprocalBand, number> = {
  STRONG_RECIPROCAL: 5,
  ONE_WAY_STRONG: 4,
  POSSIBLE: 3,
  INSUFFICIENT_EVIDENCE: 2,
  CONTRADICTED: 1,
};

function sortMatches(matches: MarketMatch[]): MarketMatch[] {
  return [...matches].sort((a, b) => BAND_RANK[b.reciprocalBand] - BAND_RANK[a.reciprocalBand]);
}

export class InMemoryMarketGraphRegistry {
  private readonly nodes = new Map<string, StoredMarketGraphNode>();

  listNodes(): StoredMarketGraphNode[] {
    return [...this.nodes.values()];
  }

  getNode(nodeId: string): StoredMarketGraphNode | null {
    return this.nodes.get(nodeId) ?? null;
  }

  /**
   * Admit or replace a node. On admission, search NEW.HAS↔EXISTING.WANTS and NEW.WANTS↔EXISTING.HAS
   * via evaluateReciprocalMatchPair (canonical reciprocal primitive).
   */
  admit(node: MarketGraphNode, options?: { replace?: boolean }): MarketGraphAdmissionResult {
    const now = new Date().toISOString();
    const existing = this.nodes.get(node.nodeId);
    if (existing && !options?.replace) {
      throw new Error(`Market graph node already admitted: ${node.nodeId}`);
    }

    const matches: MarketMatch[] = [];
    for (const prior of this.nodes.values()) {
      if (prior.nodeId === node.nodeId) continue;
      if (!isEligibleMatchPair(node, prior).eligible) continue;
      matches.push(evaluateReciprocalMatchPair(node, prior));
    }

    const stored: StoredMarketGraphNode = {
      ...node,
      admittedAt: existing?.admittedAt ?? now,
      updatedAt: now,
    };
    this.nodes.set(node.nodeId, stored);

    return { node: stored, matches: sortMatches(matches) };
  }

  findReciprocalMatchesFor(node: MarketGraphNode): MarketMatch[] {
    const matches: MarketMatch[] = [];
    for (const existing of this.nodes.values()) {
      if (existing.nodeId === node.nodeId) continue;
      if (!isEligibleMatchPair(node, existing).eligible) continue;
      matches.push(evaluateReciprocalMatchPair(node, existing));
    }
    return sortMatches(matches);
  }

  clear(): void {
    this.nodes.clear();
  }
}

/** Process-local singleton for Launchpad orchestration (non-persistent). */
export const launchpadMarketGraphRegistry = new InMemoryMarketGraphRegistry();
