/**
 * Persistent market graph store — Prisma-backed with in-memory fallback for tests.
 * Match rows are historical snapshots; re-evaluated when either node materially changes.
 */
import { getPrismaClient } from '../../prisma.js';
import type { MarketGraphNode } from '../marketGraphNode.js';
import { evaluateReciprocalMatchPair } from '../evaluateReciprocalMatch.js';
import type { MarketMatch } from '../marketMatchTypes.js';
import { InMemoryMarketGraphRegistry, type StoredMarketGraphNode } from '../marketGraphRegistry.js';
import type { CapitalDomainQualification, CapitalResourceProfile } from './capitalTypes.js';
import { isEligibleMatchPair, filterNodesByExchangeRole } from '../marketMatchCandidateRetrieval.js';

export type PersistableNode = MarketGraphNode & {
  domain?: string | null;
  resourceType?: string | null;
  sourceType?: string | null;
  sourceRef?: string | null;
  provenance?: Record<string, unknown> | null;
  evidenceRefs?: unknown;
  capitalProfile?: CapitalResourceProfile | null;
};

export type ListedGraphNode = StoredMarketGraphNode & {
  domain?: string | null;
  resourceType?: string | null;
  sourceType?: string | null;
  sourceRef?: string | null;
  admissionState?: string;
  freshnessAt?: string;
  capitalProfile?: CapitalResourceProfile | null;
  provenance?: Record<string, unknown> | null;
  evidenceRefs?: unknown;
};

export type ListedMatch = {
  pairKey: string;
  nodeAId: string;
  nodeBId: string;
  reciprocalBand: string;
  matcherVersion: string;
  match: MarketMatch;
  capitalQualification?: CapitalDomainQualification | null;
  reviewState: string;
  isStale: boolean;
  computedAt: string;
};

export type ListNodesQuery = {
  role?: 'SUPPLY' | 'DEMAND' | 'DUAL' | 'UNKNOWN';
  /** Exchange-relative role (preferred over contextual role for Launchpad Supply/Demand) */
  exchange?: 'CAPITAL';
  exchangeRole?: 'SUPPLY' | 'DEMAND';
  domain?: string;
  resourceType?: string;
  geography?: string;
  admissionState?: string;
  limit?: number;
  offset?: number;
};

export type ListMatchesQuery = {
  band?: string;
  reviewState?: string;
  nodeId?: string;
  stale?: boolean;
  /** When true (default), hide pairs that fail candidate retrieval (e.g. investor↔investor) */
  eligibleOnly?: boolean;
  limit?: number;
  offset?: number;
};

function pairKey(a: string, b: string): string {
  return [a, b].sort().join('::');
}

function asStored(node: PersistableNode, admittedAt?: string): ListedGraphNode {
  const now = new Date().toISOString();
  return {
    ...node,
    admittedAt: admittedAt ?? now,
    updatedAt: now,
    freshnessAt: now,
    admissionState: 'admitted',
  };
}

function rowToNode(row: any): ListedGraphNode {
  const payload = (row.nodePayloadJson as MarketGraphNode) || null;
  const base: ListedGraphNode = payload
    ? {
        ...payload,
        admittedAt: row.admittedAt?.toISOString?.() ?? String(row.admittedAt),
        updatedAt: row.updatedAt?.toISOString?.() ?? String(row.updatedAt),
      }
    : {
        nodeId: row.nodeId,
        label: row.label,
        signalId: row.signalId ?? row.nodeId,
        classification: row.classification,
        primaryIntent: row.primaryIntent,
        actorRole: row.actorRole,
        marketSide: row.marketSide,
        contextualRole: row.contextualRole,
        has: row.hasJson,
        wants: row.wantsJson,
        geographyLabels: row.geographyLabelsJson,
        constraints: row.constraintsJson ?? [],
        preferences: row.preferencesJson ?? [],
        evidenceConfidence: row.evidenceConfidence,
        contextSummary: row.contextSummary ?? undefined,
        admittedAt: row.admittedAt?.toISOString?.() ?? String(row.admittedAt),
        updatedAt: row.updatedAt?.toISOString?.() ?? String(row.updatedAt),
      };
  return {
    ...base,
    domain: row.domain,
    resourceType: row.resourceType,
    sourceType: row.sourceType,
    sourceRef: row.sourceRef,
    admissionState: row.admissionState,
    freshnessAt: row.freshnessAt?.toISOString?.() ?? String(row.freshnessAt),
    capitalProfile: row.capitalProfileJson ?? null,
    provenance: row.provenanceJson ?? null,
    evidenceRefs: row.evidenceRefsJson ?? null,
  };
}

function prismaAvailable(): boolean {
  try {
    const prisma = getPrismaClient() as any;
    return Boolean(prisma?.marketGraphNodeRecord);
  } catch {
    return false;
  }
}

/** Prefer memory when tables are not migrated yet (common in test DBs). */
async function usePrismaGraph(): Promise<boolean> {
  if (!prismaAvailable()) return false;
  if (process.env.FORCE_MARKET_GRAPH_MEMORY === '1' || process.env.NODE_ENV === 'test') {
    return false;
  }
  try {
    const prisma = getPrismaClient() as any;
    await prisma.marketGraphNodeRecord.findMany({ take: 1 });
    return true;
  } catch {
    return false;
  }
}

export class PersistentMarketGraphStore {
  private readonly memory = new InMemoryMarketGraphRegistry();
  private readonly memoryExtras = new Map<string, PersistableNode>();
  /** Pilot review pointer only — never mutates matchJson */
  private readonly memoryReviewStates = new Map<string, string>();

  async admit(
    node: PersistableNode,
    options?: {
      replace?: boolean;
      capitalQualificationFor?: Map<string, CapitalDomainQualification>;
    },
  ): Promise<{ node: ListedGraphNode; matches: ListedMatch[] }> {
    if (!(await usePrismaGraph())) {
      return this.admitMemory(node, options);
    }
    const prisma = getPrismaClient() as any;
    const existing = await prisma.marketGraphNodeRecord.findUnique({ where: { nodeId: node.nodeId } });
    if (existing && !options?.replace) {
      throw new Error(`Market graph node already admitted: ${node.nodeId}`);
    }

    const now = new Date();
    const others: ListedGraphNode[] = (
      await prisma.marketGraphNodeRecord.findMany({
        where: { admissionState: 'admitted', NOT: { nodeId: node.nodeId } },
      })
    ).map(rowToNode);

    await prisma.marketGraphNodeRecord.upsert({
      where: { nodeId: node.nodeId },
      create: this.toCreateRow(node, now),
      update: this.toUpdateRow(node, now),
    });

    if (existing && options?.replace) {
      await prisma.marketMatchRecord.updateMany({
        where: { OR: [{ nodeAId: node.nodeId }, { nodeBId: node.nodeId }] },
        data: { isStale: true, invalidatedAt: now },
      });
    }

    const recomputed: ListedMatch[] = [];
    for (const prior of others) {
      const eligibility = isEligibleMatchPair(node, prior);
      if (!eligibility.eligible) continue;

      const match = evaluateReciprocalMatchPair(node, prior);
      const pk = pairKey(node.nodeId, prior.nodeId);
      const qual = options?.capitalQualificationFor?.get(prior.nodeId) ?? null;
      const sortedA = node.nodeId < prior.nodeId ? node.nodeId : prior.nodeId;
      const sortedB = node.nodeId < prior.nodeId ? prior.nodeId : node.nodeId;
      await prisma.marketMatchRecord.upsert({
        where: { pairKey: pk },
        create: {
          pairKey: pk,
          nodeAId: sortedA,
          nodeBId: sortedB,
          reciprocalBand: match.reciprocalBand,
          matcherVersion: match.matcherVersion,
          matchJson: match,
          capitalQualificationJson: qual,
          reviewState: 'pending',
          isStale: false,
          computedAt: now,
        },
        update: {
          reciprocalBand: match.reciprocalBand,
          matcherVersion: match.matcherVersion,
          matchJson: match,
          capitalQualificationJson: qual,
          isStale: false,
          computedAt: now,
          invalidatedAt: null,
        },
      });
      recomputed.push({
        pairKey: pk,
        nodeAId: node.nodeId,
        nodeBId: prior.nodeId,
        reciprocalBand: match.reciprocalBand,
        matcherVersion: match.matcherVersion,
        match,
        capitalQualification: qual,
        reviewState: 'pending',
        isStale: false,
        computedAt: now.toISOString(),
      });
    }

    const stored = asStored(node, existing?.admittedAt?.toISOString?.());
    return { node: stored, matches: recomputed };
  }

  private toCreateRow(node: PersistableNode, now: Date) {
    return {
      nodeId: node.nodeId,
      label: node.label,
      signalId: node.signalId,
      classification: node.classification ?? null,
      primaryIntent: node.primaryIntent ?? null,
      actorRole: node.actorRole,
      marketSide: node.marketSide,
      contextualRole: node.contextualRole,
      domain: node.domain ?? null,
      resourceType: node.resourceType ?? null,
      hasJson: node.has,
      wantsJson: node.wants,
      constraintsJson: node.constraints,
      preferencesJson: node.preferences,
      geographyLabelsJson: node.geographyLabels,
      evidenceConfidence: node.evidenceConfidence,
      contextSummary: node.contextSummary ?? null,
      sourceType: node.sourceType ?? null,
      sourceRef: node.sourceRef ?? null,
      provenanceJson: node.provenance ?? null,
      evidenceRefsJson: node.evidenceRefs ?? node.capitalProfile?.evidenceRefs ?? null,
      admissionState: 'admitted',
      freshnessAt: now,
      admittedAt: now,
      updatedAt: now,
      nodePayloadJson: node,
      capitalProfileJson: node.capitalProfile ?? null,
    };
  }

  private toUpdateRow(node: PersistableNode, now: Date) {
    const { admittedAt: _a, ...create } = this.toCreateRow(node, now) as any;
    return { ...create, freshnessAt: now, updatedAt: now };
  }

  private admitMemory(
    node: PersistableNode,
    options?: {
      replace?: boolean;
      capitalQualificationFor?: Map<string, CapitalDomainQualification>;
    },
  ): Promise<{ node: ListedGraphNode; matches: ListedMatch[] }> {
    this.memoryExtras.set(node.nodeId, node);
    const result = this.memory.admit(node, { replace: options?.replace });
    const matches: ListedMatch[] = result.matches.map((match) => {
      const otherId =
        match.nodeA.nodeId === node.nodeId ? match.nodeB.nodeId : match.nodeA.nodeId;
      return {
        pairKey: pairKey(node.nodeId, otherId),
        nodeAId: node.nodeId,
        nodeBId: otherId,
        reciprocalBand: match.reciprocalBand,
        matcherVersion: match.matcherVersion,
        match,
        capitalQualification: options?.capitalQualificationFor?.get(otherId) ?? null,
        reviewState: 'pending',
        isStale: false,
        computedAt: new Date().toISOString(),
      };
    });
    return Promise.resolve({
      node: {
        ...result.node,
        domain: node.domain,
        resourceType: node.resourceType,
        sourceType: node.sourceType,
        sourceRef: node.sourceRef,
        capitalProfile: node.capitalProfile,
        provenance: node.provenance,
        evidenceRefs: node.evidenceRefs,
        admissionState: 'admitted',
        freshnessAt: result.node.updatedAt,
      },
      matches,
    });
  }

  async getNode(nodeId: string): Promise<ListedGraphNode | null> {
    if (!(await usePrismaGraph())) {
      const n = this.memory.getNode(nodeId);
      if (!n) return null;
      const extra = this.memoryExtras.get(nodeId);
      return { ...n, ...extra, admissionState: 'admitted', freshnessAt: n.updatedAt };
    }
    const prisma = getPrismaClient() as any;
    const row = await prisma.marketGraphNodeRecord.findUnique({ where: { nodeId } });
    return row ? rowToNode(row) : null;
  }

  async listNodes(query: ListNodesQuery = {}): Promise<{ items: ListedGraphNode[]; total: number }> {
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);
    const offset = Math.max(query.offset ?? 0, 0);

    if (!(await usePrismaGraph())) {
      let items = this.memory.listNodes().map((n) => {
        const extra = this.memoryExtras.get(n.nodeId);
        return {
          ...n,
          ...extra,
          admissionState: 'admitted',
          freshnessAt: n.updatedAt,
        } as ListedGraphNode;
      });
      if (query.role) items = items.filter((n) => n.contextualRole === query.role);
      if (query.domain) items = items.filter((n) => n.domain === query.domain);
      if (query.resourceType) items = items.filter((n) => n.resourceType === query.resourceType);
      if (query.geography) {
        const g = query.geography.toLowerCase();
        items = items.filter((n) => n.geographyLabels.some((x) => x.toLowerCase().includes(g)));
      }
      if (query.exchangeRole || query.exchange) {
        items = filterNodesByExchangeRole(items, {
          exchange: query.exchange ?? 'CAPITAL',
          exchangeRole: query.exchangeRole,
        });
      }
      const total = items.length;
      return { items: items.slice(offset, offset + limit), total };
    }

    const prisma = getPrismaClient() as any;
    const where: any = { admissionState: query.admissionState ?? 'admitted' };
    if (query.role && !query.exchangeRole) where.contextualRole = query.role;
    if (query.domain) where.domain = query.domain;
    if (query.resourceType) where.resourceType = query.resourceType;
    const useExchangeFilter = Boolean(query.exchangeRole || query.exchange);
    const [rows, totalBeforeFilter] = await Promise.all([
      prisma.marketGraphNodeRecord.findMany({
        where,
        orderBy: { freshnessAt: 'desc' },
        take: useExchangeFilter ? 500 : limit,
        skip: useExchangeFilter ? 0 : offset,
      }),
      prisma.marketGraphNodeRecord.count({ where }),
    ]);
    let items = rows.map(rowToNode);
    if (query.geography) {
      const g = query.geography.toLowerCase();
      items = items.filter((n: ListedGraphNode) =>
        n.geographyLabels.some((x) => x.toLowerCase().includes(g)),
      );
    }
    if (useExchangeFilter) {
      items = filterNodesByExchangeRole(items, {
        exchange: query.exchange ?? 'CAPITAL',
        exchangeRole: query.exchangeRole,
      });
      const total = items.length;
      return { items: items.slice(offset, offset + limit), total };
    }
    return { items, total: totalBeforeFilter };
  }

  async listMatches(query: ListMatchesQuery = {}): Promise<{ items: ListedMatch[]; total: number }> {
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);
    const offset = Math.max(query.offset ?? 0, 0);
    const eligibleOnly = query.eligibleOnly !== false;

    if (!(await usePrismaGraph())) {
      // Rebuild from memory by re-evaluating pairs (fresh, not stale)
      const nodes = this.memory.listNodes();
      const items: ListedMatch[] = [];
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i]!;
          const b = nodes[j]!;
          const aFull = { ...a, ...this.memoryExtras.get(a.nodeId) } as ListedGraphNode;
          const bFull = { ...b, ...this.memoryExtras.get(b.nodeId) } as ListedGraphNode;
          if (eligibleOnly && !isEligibleMatchPair(aFull, bFull).eligible) continue;
          if (query.nodeId && a.nodeId !== query.nodeId && b.nodeId !== query.nodeId) continue;
          const match = evaluateReciprocalMatchPair(a, b);
          if (query.band && match.reciprocalBand !== query.band) continue;
          const pk = pairKey(a.nodeId, b.nodeId);
          const reviewState = this.memoryReviewStates.get(pk) ?? 'pending';
          if (query.reviewState && reviewState !== query.reviewState) continue;
          items.push({
            pairKey: pk,
            nodeAId: a.nodeId,
            nodeBId: b.nodeId,
            reciprocalBand: match.reciprocalBand,
            matcherVersion: match.matcherVersion,
            match,
            reviewState: this.memoryReviewStates.get(pk) ?? 'pending',
            isStale: false,
            computedAt: new Date().toISOString(),
          });
        }
      }
      const total = items.length;
      return { items: items.slice(offset, offset + limit), total };
    }

    const prisma = getPrismaClient() as any;
    const where: any = {};
    if (query.band) where.reciprocalBand = query.band;
    if (query.reviewState) where.reviewState = query.reviewState;
    if (typeof query.stale === 'boolean') where.isStale = query.stale;
    if (query.nodeId) {
      where.OR = [{ nodeAId: query.nodeId }, { nodeBId: query.nodeId }];
    }
    const [rows, totalBeforeFilter] = await Promise.all([
      prisma.marketMatchRecord.findMany({
        where,
        orderBy: { computedAt: 'desc' },
        take: eligibleOnly ? 500 : limit,
        skip: eligibleOnly ? 0 : offset,
      }),
      prisma.marketMatchRecord.count({ where }),
    ]);
    let items: ListedMatch[] = rows.map((row: any) => ({
      pairKey: row.pairKey,
      nodeAId: row.nodeAId,
      nodeBId: row.nodeBId,
      reciprocalBand: row.reciprocalBand,
      matcherVersion: row.matcherVersion,
      match: row.matchJson,
      capitalQualification: row.capitalQualificationJson,
      reviewState: row.reviewState,
      isStale: row.isStale,
      computedAt: row.computedAt?.toISOString?.() ?? String(row.computedAt),
    }));

    if (eligibleOnly && items.length > 0) {
      const nodeIds = new Set<string>();
      for (const m of items) {
        nodeIds.add(m.nodeAId);
        nodeIds.add(m.nodeBId);
      }
      const nodeRows = await prisma.marketGraphNodeRecord.findMany({
        where: { nodeId: { in: [...nodeIds] } },
      });
      const nodeMap = new Map(nodeRows.map((r: any) => [r.nodeId, rowToNode(r)]));
      items = items.filter((m) => {
        const na = nodeMap.get(m.nodeAId);
        const nb = nodeMap.get(m.nodeBId);
        if (!na || !nb) return false;
        return isEligibleMatchPair(na, nb).eligible;
      });
      const total = items.length;
      return { items: items.slice(offset, offset + limit), total };
    }

    return { items, total: totalBeforeFilter };
  }

  async updateMatchReviewPointer(pairKeyValue: string, reviewState: string): Promise<boolean> {
    this.memoryReviewStates.set(pairKeyValue, reviewState);
    if (!(await usePrismaGraph())) return true;
    try {
      const prisma = getPrismaClient() as any;
      const updated = await prisma.marketMatchRecord.updateMany({
        where: { pairKey: pairKeyValue },
        data: { reviewState, updatedAt: new Date() },
      });
      return updated.count > 0;
    } catch {
      return false;
    }
  }

  async clearMemory(): Promise<void> {
    this.memory.clear();
    this.memoryExtras.clear();
    this.memoryReviewStates.clear();
  }
}

export const launchpadPersistentMarketGraph = new PersistentMarketGraphStore();
