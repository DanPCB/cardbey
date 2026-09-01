/**
 * Minimal Prisma dual-write / hydrate for Fundraising Campaign V1.
 * Soft-fails when Prisma model unavailable (tests / memory-only).
 * Does not replace in-memory primary for unit tests.
 */
import { getPrismaClient } from '../prisma.js';

export function fundraisingPrismaReady(): boolean {
  if (process.env.NODE_ENV === 'test') return false;
  try {
    const p = getPrismaClient() as any;
    return Boolean(p?.fundraisingCampaign);
  } catch {
    return false;
  }
}

function prisma(): any | null {
  if (!fundraisingPrismaReady()) return null;
  try {
    return getPrismaClient() as any;
  } catch {
    return null;
  }
}

export async function persistCampaignRow(campaign: Record<string, unknown>): Promise<{ ok: boolean; id?: string }> {
  const p = prisma();
  if (!p) return { ok: false };
  try {
    const byKey = await p.fundraisingCampaign.findUnique({
      where: { campaignKey: campaign.campaignKey as string },
    });
    if (byKey) {
      await p.fundraisingCampaign.update({
        where: { id: byKey.id },
        data: {
          name: campaign.name,
          state: campaign.state,
          ownerUserId: campaign.ownerUserId,
          proposedTermsJson: campaign.proposedTermsJson ?? {},
          companyLabel: campaign.companyLabel,
          companyNodeId: campaign.companyNodeId,
          proposedTargetAmountAud: campaign.proposedTargetAmountAud,
          stage: campaign.stage,
          proposedInstrument: campaign.proposedInstrument,
          targetMarketsJson: campaign.targetMarketsJson ?? [],
          targetInvestorRegionsJson: campaign.targetInvestorRegionsJson ?? [],
          updatedAt: new Date(),
        },
      });
      return { ok: true, id: byKey.id };
    }
    await p.fundraisingCampaign.create({
      data: {
        id: campaign.id,
        campaignKey: campaign.campaignKey,
        name: campaign.name,
        companyLabel: campaign.companyLabel,
        companyNodeId: campaign.companyNodeId,
        fundraisingObjectiveId: campaign.fundraisingObjectiveId,
        proposedTargetAmountAud: campaign.proposedTargetAmountAud,
        stage: campaign.stage,
        proposedInstrument: campaign.proposedInstrument,
        proposedTermsJson: campaign.proposedTermsJson ?? {},
        targetMarketsJson: campaign.targetMarketsJson ?? [],
        targetInvestorRegionsJson: campaign.targetInvestorRegionsJson ?? [],
        ownerUserId: campaign.ownerUserId,
        state: campaign.state,
      },
    });
    return { ok: true, id: campaign.id as string };
  } catch {
    return { ok: false };
  }
}

export async function persistTargetBundle(params: {
  target: Record<string, unknown>;
  gaps?: Array<Record<string, unknown>>;
}): Promise<boolean> {
  const p = prisma();
  if (!p) return false;
  try {
    const t = params.target;
    await p.fundraisingCampaignTarget.upsert({
      where: { id: t.id as string },
      create: {
        id: t.id,
        campaignId: t.campaignId,
        catalogId: t.catalogId,
        investorName: t.investorName,
        investorNodeId: t.investorNodeId,
        companyNodeId: t.companyNodeId,
        marketMatchPairKey: t.marketMatchPairKey,
        lifecycle: t.lifecycle,
        lifecycleHistoryJson: t.lifecycleHistoryJson ?? [],
        assessmentsJson: t.assessmentsJson ?? {},
        dossierJson: t.dossierJson ?? {},
        handoffJson: t.handoffJson ?? {},
        unresolvedGapsJson: t.unresolvedGapsJson ?? [],
        admittingOperatorId: t.admittingOperatorId,
        admittedAt: t.admittedAt ? new Date(String(t.admittedAt)) : new Date(),
      },
      update: {
        lifecycle: t.lifecycle,
        lifecycleHistoryJson: t.lifecycleHistoryJson ?? [],
        assessmentsJson: t.assessmentsJson ?? {},
        dossierJson: t.dossierJson ?? {},
        unresolvedGapsJson: t.unresolvedGapsJson ?? [],
        updatedAt: new Date(),
      },
    });
    for (const g of params.gaps || []) {
      await p.investorResearchGap.upsert({
        where: { id: g.id as string },
        create: {
          id: g.id,
          targetId: g.targetId,
          field: g.field,
          whyItMatters: g.whyItMatters,
          currentEvidenceState: g.currentEvidenceState,
          requestedResearch: g.requestedResearch,
          status: g.status,
          provenanceJson: g.provenanceJson ?? {},
          resolutionJson: g.resolutionJson ?? null,
          resolvedAt: g.resolvedAt ? new Date(String(g.resolvedAt)) : null,
        },
        update: {
          status: g.status,
          currentEvidenceState: g.currentEvidenceState,
          resolutionJson: g.resolutionJson ?? null,
          resolvedAt: g.resolvedAt ? new Date(String(g.resolvedAt)) : null,
          updatedAt: new Date(),
        },
      });
    }
    return true;
  } catch {
    return false;
  }
}

export async function persistGapRow(gap: Record<string, unknown>): Promise<boolean> {
  const p = prisma();
  if (!p) return false;
  try {
    await p.investorResearchGap.upsert({
      where: { id: gap.id as string },
      create: {
        id: gap.id,
        targetId: gap.targetId,
        field: gap.field,
        whyItMatters: gap.whyItMatters,
        currentEvidenceState: gap.currentEvidenceState,
        requestedResearch: gap.requestedResearch,
        status: gap.status,
        provenanceJson: gap.provenanceJson ?? {},
        resolutionJson: gap.resolutionJson ?? null,
        resolvedAt: gap.resolvedAt ? new Date(String(gap.resolvedAt)) : null,
      },
      update: {
        status: gap.status,
        currentEvidenceState: gap.currentEvidenceState,
        resolutionJson: gap.resolutionJson ?? null,
        resolvedAt: gap.resolvedAt ? new Date(String(gap.resolvedAt)) : null,
        updatedAt: new Date(),
      },
    });
    return true;
  } catch {
    return false;
  }
}

export async function persistDocumentRow(doc: Record<string, unknown>): Promise<boolean> {
  const p = prisma();
  if (!p) return false;
  try {
    await p.fundraisingDocument.upsert({
      where: { id: doc.id as string },
      create: {
        id: doc.id,
        campaignId: doc.campaignId,
        category: doc.category,
        title: doc.title,
        version: doc.version,
        status: doc.status,
        visibility: doc.visibility,
        evidenceStatus: doc.evidenceStatus,
        contentRef: doc.contentRef,
        metadataJson: doc.metadataJson ?? {},
      },
      update: {
        version: doc.version,
        status: doc.status,
        evidenceStatus: doc.evidenceStatus,
        contentRef: doc.contentRef,
        metadataJson: doc.metadataJson ?? {},
        updatedAt: new Date(),
      },
    });
    return true;
  } catch {
    return false;
  }
}

export async function persistDraftRow(draft: Record<string, unknown>): Promise<boolean> {
  const p = prisma();
  if (!p) return false;
  try {
    await p.fundraisingOutreachDraft.upsert({
      where: { id: draft.id as string },
      create: {
        id: draft.id,
        targetId: draft.targetId,
        draftType: draft.draftType,
        status: draft.status,
        bodyText: draft.bodyText,
        markedAsAi: draft.markedAsAi ?? true,
        approvedAt: draft.approvedAt ? new Date(String(draft.approvedAt)) : null,
        approvedBy: draft.approvedBy,
        metadataJson: draft.metadataJson ?? {},
      },
      update: {
        status: draft.status,
        bodyText: draft.bodyText,
        approvedAt: draft.approvedAt ? new Date(String(draft.approvedAt)) : null,
        approvedBy: draft.approvedBy,
        metadataJson: draft.metadataJson ?? {},
        updatedAt: new Date(),
      },
    });
    return true;
  } catch {
    return false;
  }
}

export async function persistEventRow(ev: Record<string, unknown>): Promise<boolean> {
  const p = prisma();
  if (!p) return false;
  try {
    await p.fundraisingCampaignEvent.create({
      data: {
        id: ev.id,
        campaignId: ev.campaignId,
        targetId: ev.targetId ?? null,
        eventType: ev.eventType,
        actorId: ev.actorId ?? null,
        payloadJson: ev.payloadJson ?? {},
        occurredAt: ev.occurredAt ? new Date(String(ev.occurredAt)) : new Date(),
      },
    });
    return true;
  } catch {
    return false;
  }
}

export type HydratedCampaignBundle = {
  campaign: any;
  targets: any[];
  gaps: any[];
  docs: any[];
  drafts: any[];
  events: any[];
} | null;

/** Load CARDBEY_SEED_2026 from Prisma when memory is empty. */
export async function hydrateCardbeySeedFromPrisma(campaignKey: string): Promise<HydratedCampaignBundle> {
  const p = prisma();
  if (!p) return null;
  try {
    const campaign = await p.fundraisingCampaign.findUnique({
      where: { campaignKey },
      include: {
        targets: { include: { researchGaps: true, outreachDrafts: true } },
        documents: true,
        events: { orderBy: { occurredAt: 'asc' }, take: 500 },
      },
    });
    if (!campaign) return null;
    const gaps: any[] = [];
    const drafts: any[] = [];
    for (const t of campaign.targets || []) {
      for (const g of t.researchGaps || []) gaps.push(g);
      for (const d of t.outreachDrafts || []) drafts.push(d);
    }
    return {
      campaign,
      targets: campaign.targets || [],
      gaps,
      docs: campaign.documents || [],
      drafts,
      events: campaign.events || [],
    };
  } catch {
    return null;
  }
}
