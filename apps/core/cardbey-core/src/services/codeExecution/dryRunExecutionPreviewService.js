import { getPrismaClient } from '../../lib/prisma.js';
import { recordSecurityEvent, SecurityEventSeverity, SecurityEventType } from '../security/securityEventService.js';

export class DevSystemDryRunError extends Error {
  constructor(message, { code = 'dry_run_failed', status = 400, details } = {}) {
    super(message);
    this.name = 'DevSystemDryRunError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function normalizeEngine(input, fallbackEngine) {
  const value = typeof input === 'string' ? input.trim() : '';
  if (!value) return fallbackEngine || 'cursor';
  if (value === 'cursor' || value === 'codex' || value === 'claude') return value;
  return fallbackEngine || 'cursor';
}

function toPreviewDto(record) {
  return {
    id: record.id,
    proposalId: record.proposalId,
    tenantKey: record.tenantKey,
    createdByUserId: record.createdByUserId,
    createdByEmail: record.createdByEmail,
    status: record.status,
    engine: record.engine,
    mode: record.mode,
    executionIntent: record.executionIntentJson,
    normalizedTask: record.normalizedTaskJson,
    authorization: record.authorizationJson,
    resultPreview: record.resultPreviewJson,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function buildDryRunPreviewPayload({ proposalId, engine, normalizedTask }) {
  return {
    proposalId,
    engine,
    mode: 'dry_run_only',
    authorization: {
      allowed: true,
      reason: 'approved proposal with recent privileged verification',
    },
    taskContract: {
      missionType: 'system',
      taskType: 'code_task',
      title: normalizedTask?.title ?? null,
      objective: normalizedTask?.objective ?? null,
      allowedPaths: normalizedTask?.allowedPaths ?? [],
      forbiddenPaths: normalizedTask?.forbiddenPaths ?? [],
      constraints: normalizedTask?.constraints ?? [],
      validationPlan: normalizedTask?.validationPlan ?? {},
    },
    futureExecutionNotes: [
      'No engine call performed in dry-run mode',
      'No code was modified',
      'No orchestrator task was created',
    ],
  };
}

export async function createDryRunExecutionPreview({
  proposalId,
  actor,
  engineOverride,
  requestContext,
} = {}) {
  const prisma = getPrismaClient();
  const record = await prisma.devSystemProposal.findUnique({
    where: { id: proposalId },
  });

  if (!record) {
    throw new DevSystemDryRunError('Proposal not found', { code: 'not_found', status: 404 });
  }

  if (record.status !== 'approved') {
    await recordSecurityEvent({
      actor,
      type: SecurityEventType.ADMIN_EXECUTION_DRY_RUN_INVALID_STATE,
      severity: SecurityEventSeverity.WARNING,
      source: 'dry_run',
      route: requestContext?.route ?? null,
      ip: requestContext?.ip ?? null,
      userAgent: requestContext?.userAgent ?? null,
      details: {
        proposalId,
        currentStatus: record.status,
      },
    });

    throw new DevSystemDryRunError('Proposal must be approved for dry-run preview', {
      code: 'proposal_not_approved',
      status: 409,
      details: { proposalId, currentStatus: record.status },
    });
  }

  const engine = normalizeEngine(engineOverride, record.engine);
  const normalizedTask = record.normalizedTaskJson;

  await recordSecurityEvent({
    actor,
    type: SecurityEventType.ADMIN_EXECUTION_DRY_RUN_REQUESTED,
    severity: SecurityEventSeverity.INFO,
    source: 'dry_run',
    route: requestContext?.route ?? null,
    ip: requestContext?.ip ?? null,
    userAgent: requestContext?.userAgent ?? null,
    details: {
      proposalId,
      engine,
    },
  });

  const previewPayload = buildDryRunPreviewPayload({
    proposalId,
    engine,
    normalizedTask,
  });

  const previewRecord = await prisma.devSystemExecutionPreview.create({
    data: {
      tenantKey: actor?.business?.id ? String(actor.business.id) : null,
      proposalId: record.id,
      createdByUserId: String(actor.id),
      createdByEmail: actor?.email ? String(actor.email) : null,
      status: 'dry_run_generated',
      engine,
      mode: 'dry_run_only',
      executionIntentJson: {
        intent: 'dry_run_preview',
        requestedEngine: engine,
      },
      normalizedTaskJson: normalizedTask,
      authorizationJson: previewPayload.authorization,
      resultPreviewJson: previewPayload,
    },
  });

  await recordSecurityEvent({
    actor,
    type: SecurityEventType.ADMIN_EXECUTION_DRY_RUN_GENERATED,
    severity: SecurityEventSeverity.INFO,
    source: 'dry_run',
    route: requestContext?.route ?? null,
    ip: requestContext?.ip ?? null,
    userAgent: requestContext?.userAgent ?? null,
    details: {
      proposalId,
      previewId: previewRecord.id,
      engine,
    },
  });

  return {
    ok: true,
    preview: toPreviewDto(previewRecord),
  };
}

