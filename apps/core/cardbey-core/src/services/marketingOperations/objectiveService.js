/**
 * Marketing Objective CRUD — generic layer above channel operators.
 */

import { appendMarketingAudit } from '../marketingOperator/audit.js';
import { marketingRepo } from '../marketingOperator/repository.js';
import {
  DEFAULT_USER_ACQUISITION_OBJECTIVE_NAME,
  OBJECTIVE_STATES,
  resolveTargetType,
  TARGET_TYPES,
} from './constants.js';

export async function createObjective(input = {}, ctx = {}) {
  const targetType = resolveTargetType(input.targetType);
  const row = await marketingRepo.objective.create({
    name: String(input.name || '').trim() || 'Untitled objective',
    targetType,
    market: input.market ?? null,
    language: input.language ?? null,
    goal: input.goal ?? null,
    status: input.status && OBJECTIVE_STATES[input.status] ? input.status : OBJECTIVE_STATES.DRAFT,
    createdBy: ctx.actorId ?? null,
  });
  await appendMarketingAudit({
    entityType: 'MarketingObjective',
    entityId: row.id,
    action: 'create',
    toStatus: row.status,
    actorId: ctx.actorId,
    reason: 'OBJECTIVE_CREATE',
    metadata: { targetType },
  });
  return row;
}

export async function listObjectives(query = {}) {
  const where = {};
  if (query.status) where.status = query.status;
  if (query.targetType) where.targetType = resolveTargetType(query.targetType);
  return marketingRepo.objective.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: Math.min(Number(query.take) || 50, 200),
  });
}

export async function getObjective(id) {
  return marketingRepo.objective.findUnique({
    where: { id },
    include: { campaigns: { take: 20, orderBy: { createdAt: 'desc' } } },
  });
}

export async function ensureDefaultUserAcquisitionObjective(ctx = {}) {
  const existing = await marketingRepo.objective.findFirst({
    where: {
      name: DEFAULT_USER_ACQUISITION_OBJECTIVE_NAME,
      targetType: TARGET_TYPES.USER_ACQUISITION,
    },
  });
  if (existing) return existing;
  return createObjective(
    {
      name: DEFAULT_USER_ACQUISITION_OBJECTIVE_NAME,
      targetType: TARGET_TYPES.USER_ACQUISITION,
      market: 'vn',
      language: 'vi',
      goal: 'Acquire Vietnamese SMEs onto Cardbey',
      status: OBJECTIVE_STATES.ACTIVE,
    },
    ctx,
  );
}
