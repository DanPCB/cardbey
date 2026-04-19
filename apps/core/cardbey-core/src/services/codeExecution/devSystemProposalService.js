import { getPrismaClient } from '../../lib/prisma.js';
import { guardCodeTaskExecution } from './guardCodeTaskExecution.js';
import { PrivilegedAction, evaluatePrivilegedAction } from '../../lib/privilegedActionPolicy.js';
import {
  recordSecurityEvent,
  SecurityEventSeverity,
  SecurityEventType,
} from '../security/securityEventService.js';

function normalizeLimit(rawLimit) {
  const parsed = Number(rawLimit);
  if (!Number.isFinite(parsed) || parsed <= 0) return 20;
  return Math.min(Math.trunc(parsed), 100);
}

function toProposalDto(record) {
  return {
    id: record.id,
    tenantKey: record.tenantKey,
    createdByUserId: record.createdByUserId,
    createdByEmail: record.createdByEmail,
    type: record.type,
    title: record.title,
    objective: record.objective,
    engine: record.engine,
    mode: record.mode,
    status: record.status,
    reviewedByUserId: record.reviewedByUserId,
    reviewedByEmail: record.reviewedByEmail,
    reviewedAt: record.reviewedAt,
    reviewDecisionReason: record.reviewDecisionReason,
    normalizedTask: record.normalizedTaskJson,
    guard: record.guardJson,
    notes: record.notesJson,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export class DevSystemProposalReviewError extends Error {
  constructor(message, { code = 'invalid_review_state', status = 400, details } = {}) {
    super(message);
    this.name = 'DevSystemProposalReviewError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export async function createGuardedCodeTaskProposal({ actor, payload, requestContext } = {}) {
  const guarded = guardCodeTaskExecution({ actor, payload });
  const prisma = getPrismaClient();
  const privilegedAction = evaluatePrivilegedAction({
    action: PrivilegedAction.DEV_SYSTEM_PROPOSAL_SUBMIT,
    actor,
    verificationContext: requestContext?.verificationContext,
  });

  const record = await prisma.devSystemProposal.create({
    data: {
      tenantKey: actor?.business?.id ? String(actor.business.id) : null,
      createdByUserId: String(actor.id),
      createdByEmail: actor?.email ? String(actor.email) : null,
      type: 'code_task_proposal',
      title: guarded.normalizedTask.title,
      objective: guarded.normalizedTask.objective,
      engine: guarded.normalizedTask.engine ?? null,
      mode: guarded.mode,
      status: 'guarded',
      normalizedTaskJson: guarded.normalizedTask,
      guardJson: {
        mode: guarded.mode,
        guard: guarded.guard,
        execution: guarded.execution,
        privilegedAction,
      },
      notesJson: null,
    },
  });

  await recordSecurityEvent({
    actor,
    type: SecurityEventType.ADMIN_GUARD_PROPOSAL_CREATED,
    severity: SecurityEventSeverity.INFO,
    source: 'system_mission',
    route: requestContext?.route ?? null,
    ip: requestContext?.ip ?? null,
    userAgent: requestContext?.userAgent ?? null,
    details: {
      proposalId: record.id,
      title: record.title,
      engine: record.engine,
      action: privilegedAction.action,
      verification: privilegedAction.verification,
    },
  });

  return {
    ok: true,
    proposal: toProposalDto(record),
    execution: guarded.execution,
    privilegedAction,
  };
}

export async function listDevSystemProposals({ limit } = {}) {
  const prisma = getPrismaClient();
  const records = await prisma.devSystemProposal.findMany({
    orderBy: { createdAt: 'desc' },
    take: normalizeLimit(limit),
  });

  return {
    ok: true,
    items: records.map(toProposalDto),
  };
}

export async function getDevSystemProposalById(id) {
  const prisma = getPrismaClient();
  const record = await prisma.devSystemProposal.findUnique({
    where: { id },
  });

  if (!record) {
    return null;
  }

  return toProposalDto(record);
}

async function transitionProposalReview({ proposalId, actor, decision, reason = null, requestContext } = {}) {
  const prisma = getPrismaClient();
  const record = await prisma.devSystemProposal.findUnique({
    where: { id: proposalId },
  });

  if (!record) {
    throw new DevSystemProposalReviewError('Proposal not found', {
      code: 'not_found',
      status: 404,
    });
  }

  if (record.status !== 'guarded') {
    await recordSecurityEvent({
      actor,
      type: SecurityEventType.ADMIN_PROPOSAL_REVIEW_INVALID_STATE,
      severity: SecurityEventSeverity.WARNING,
      source: 'system_mission',
      route: requestContext?.route ?? null,
      ip: requestContext?.ip ?? null,
      userAgent: requestContext?.userAgent ?? null,
      details: {
        proposalId,
        currentStatus: record.status,
        attemptedDecision: decision,
      },
    });

    throw new DevSystemProposalReviewError('Only guarded proposals can be reviewed', {
      code: 'invalid_review_state',
      status: 409,
      details: { proposalId, currentStatus: record.status, attemptedDecision: decision },
    });
  }

  const updated = await prisma.devSystemProposal.update({
    where: { id: proposalId },
    data: {
      status: decision,
      reviewedByUserId: actor?.id ? String(actor.id) : null,
      reviewedByEmail: actor?.email ? String(actor.email) : null,
      reviewedAt: new Date(),
      reviewDecisionReason: typeof reason === 'string' && reason.trim() ? reason.trim() : null,
    },
  });

  await recordSecurityEvent({
    actor,
    type:
      decision === 'approved'
        ? SecurityEventType.ADMIN_PROPOSAL_APPROVED
        : SecurityEventType.ADMIN_PROPOSAL_REJECTED,
    severity: SecurityEventSeverity.INFO,
    source: 'system_mission',
    route: requestContext?.route ?? null,
    ip: requestContext?.ip ?? null,
    userAgent: requestContext?.userAgent ?? null,
    details: {
      proposalId,
      decision,
      reason: typeof reason === 'string' && reason.trim() ? reason.trim() : null,
    },
  });

  return {
    ok: true,
    proposal: toProposalDto(updated),
  };
}

export async function approveDevSystemProposal(args = {}) {
  return transitionProposalReview({ ...args, decision: 'approved' });
}

export async function rejectDevSystemProposal(args = {}) {
  return transitionProposalReview({ ...args, decision: 'rejected' });
}
