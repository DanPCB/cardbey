/**
 * Marketing research opportunity review. Approve does not create campaigns.
 * Prepare Campaign creates an evidence-linked proposal DRAFT (Phase 1F). No publish.
 */

import { appendMarketingAudit } from '../marketingOperator/audit.js';
import { marketingRepo } from '../marketingOperator/repository.js';
import { OPPORTUNITY_STATES } from './researchContract.js';
import { prepareCampaignProposalFromOpportunity } from './campaignProposalService.js';

export async function listResearchOpportunities(query = {}) {
  const where = {};
  if (query.status) where.status = query.status;
  if (query.targetType) where.targetType = query.targetType;
  if (query.objectiveId) where.objectiveId = query.objectiveId;
  return marketingRepo.researchOpportunity.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: Math.min(Number(query.take) || 50, 200),
    include: {
      objective: { select: { id: true, name: true, targetType: true, market: true, status: true } },
      task: { select: { id: true, question: true, status: true, evidence: true } },
    },
  }).catch(() =>
    marketingRepo.researchOpportunity.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(Number(query.take) || 50, 200),
    }),
  );
}

export async function getResearchOpportunity(id) {
  const row = await marketingRepo.researchOpportunity.findUnique({
    where: { id },
    include: {
      objective: true,
      task: { include: { evidence: true } },
    },
  }).catch(() => marketingRepo.researchOpportunity.findUnique({ where: { id } }));
  if (!row) return null;
  let evidence = row.task?.evidence || [];
  if (!evidence.length && Array.isArray(row.evidenceIds) && row.evidenceIds.length) {
    evidence = [];
    for (const eid of row.evidenceIds) {
      const ev = await marketingRepo.researchEvidence.findUnique({ where: { id: eid } }).catch(() => null);
      if (ev) evidence.push(ev);
    }
  }
  return { ...row, evidence };
}

async function setStatus(id, status, ctx = {}) {
  const row = await marketingRepo.researchOpportunity.findUnique({ where: { id } });
  if (!row) return { ok: false, error: 'not_found' };
  const updated = await marketingRepo.researchOpportunity.update({
    where: { id },
    data: {
      status,
      reviewedBy: ctx.actorId || null,
      reviewedAt: new Date(),
    },
  });
  await appendMarketingAudit({
    entityType: 'MarketingResearchOpportunity',
    entityId: id,
    action: `opportunity_${status.toLowerCase()}`,
    actorId: ctx.actorId,
    metadata: { publishes: false, outreach: false },
  }).catch(() => {});
  return { ok: true, opportunity: updated, publishes: false };
}

export function reviewOpportunity(id, ctx = {}) {
  return setStatus(id, OPPORTUNITY_STATES.REVIEWING, ctx);
}

export function approveOpportunity(id, ctx = {}) {
  return setStatus(id, OPPORTUNITY_STATES.APPROVED, ctx);
}

export function rejectOpportunity(id, ctx = {}) {
  return setStatus(id, OPPORTUNITY_STATES.REJECTED, ctx);
}

export function archiveOpportunity(id, ctx = {}) {
  return setStatus(id, OPPORTUNITY_STATES.ARCHIVED, ctx);
}

/**
 * Local evidence-linked campaign proposal. Never publishes or schedules.
 */
export function prepareCampaignFromOpportunity(id, ctx = {}) {
  return prepareCampaignProposalFromOpportunity(id, ctx);
}

export { OPPORTUNITY_STATES };
