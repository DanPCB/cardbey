import { getPrismaClient } from '../../lib/prisma.js';

export const SecurityEventSeverity = Object.freeze({
  INFO: 'info',
  WARNING: 'warning',
  HIGH: 'high',
  CRITICAL: 'critical',
});

export const SecurityEventType = Object.freeze({
  ADMIN_LOGIN_SUCCESS: 'admin.login.success',
  ADMIN_LOGIN_FAILED: 'admin.login.failed',
  ADMIN_DEV_CONSOLE_ACCESS_DENIED: 'admin.dev_console.access_denied',
  ADMIN_GUARD_INVALID_PAYLOAD: 'admin.guard.invalid_payload',
  ADMIN_GUARD_FORBIDDEN_PATH: 'admin.guard.forbidden_path',
  ADMIN_GUARD_NON_ADMIN_ATTEMPT: 'admin.guard.non_admin_attempt',
  ADMIN_GUARD_PROPOSAL_CREATED: 'admin.guard.proposal_created',
  ADMIN_PROPOSAL_APPROVED: 'admin.proposal.approved',
  ADMIN_PROPOSAL_REJECTED: 'admin.proposal.rejected',
  ADMIN_PROPOSAL_REVIEW_INVALID_STATE: 'admin.proposal.review_invalid_state',
  ADMIN_PRIVILEGED_VERIFICATION_SUCCEEDED: 'admin.privileged_verification.succeeded',
  ADMIN_PRIVILEGED_VERIFICATION_FAILED: 'admin.privileged_verification.failed',
  ADMIN_PRIVILEGED_VERIFICATION_REQUIRED: 'admin.privileged_verification.required',
  ADMIN_PRIVILEGED_VERIFICATION_EXPIRED: 'admin.privileged_verification.expired',
  ADMIN_EXECUTION_DRY_RUN_REQUESTED: 'admin.execution_dry_run.requested',
  ADMIN_EXECUTION_DRY_RUN_GENERATED: 'admin.execution_dry_run.generated',
  ADMIN_EXECUTION_DRY_RUN_INVALID_STATE: 'admin.execution_dry_run.invalid_state',
  ADMIN_EXECUTION_DRY_RUN_VERIFICATION_REQUIRED: 'admin.execution_dry_run.verification_required',
});

const SECURITY_EVENT_LIMIT = 100;
const MAX_STRING_LENGTH = 300;
const MAX_ARRAY_ITEMS = 10;
const MAX_OBJECT_KEYS = 20;
const MAX_DEPTH = 3;
const DEDUPE_WINDOW_MS = 30_000;
const DEDUPED_EVENT_TYPES = new Set([
  SecurityEventType.ADMIN_DEV_CONSOLE_ACCESS_DENIED,
  SecurityEventType.ADMIN_GUARD_INVALID_PAYLOAD,
  SecurityEventType.ADMIN_GUARD_FORBIDDEN_PATH,
  SecurityEventType.ADMIN_GUARD_NON_ADMIN_ATTEMPT,
  SecurityEventType.ADMIN_PRIVILEGED_VERIFICATION_REQUIRED,
  SecurityEventType.ADMIN_PRIVILEGED_VERIFICATION_EXPIRED,
  SecurityEventType.ADMIN_EXECUTION_DRY_RUN_INVALID_STATE,
  SecurityEventType.ADMIN_EXECUTION_DRY_RUN_VERIFICATION_REQUIRED,
]);
const SENSITIVE_KEY_PATTERN =
  /authorization|cookie|token|secret|password|passcode|otp|headers|requestbody|rawbody|body|payload|session/i;

function normalizeLimit(rawLimit) {
  const parsed = Number(rawLimit);
  if (!Number.isFinite(parsed) || parsed <= 0) return 20;
  return Math.min(Math.trunc(parsed), SECURITY_EVENT_LIMIT);
}

function sanitizeString(value) {
  if (value.length <= MAX_STRING_LENGTH) return value;
  return `${value.slice(0, MAX_STRING_LENGTH)}...[truncated]`;
}

function sanitizeSecurityEventValue(value, depth = 0) {
  if (value == null) return null;
  if (typeof value === 'string') return sanitizeString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();

  if (depth >= MAX_DEPTH) {
    return '[truncated_depth]';
  }

  if (Array.isArray(value)) {
    const sanitized = value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => sanitizeSecurityEventValue(item, depth + 1))
      .filter((item) => item != null);
    return sanitized.length > 0 ? sanitized : null;
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value).slice(0, MAX_OBJECT_KEYS);
    const sanitized = {};

    for (const [key, nestedValue] of entries) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        continue;
      }
      const cleaned = sanitizeSecurityEventValue(nestedValue, depth + 1);
      if (cleaned != null) {
        sanitized[key] = cleaned;
      }
    }

    return Object.keys(sanitized).length > 0 ? sanitized : null;
  }

  return null;
}

export function sanitizeSecurityEventDetails(details) {
  try {
    return sanitizeSecurityEventValue(details, 0);
  } catch {
    return { summary: 'details_not_serializable' };
  }
}

function stableStringify(value) {
  if (value == null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  const sortedEntries = Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
  return `{${sortedEntries
    .map(([key, nested]) => `${JSON.stringify(key)}:${stableStringify(nested)}`)
    .join(',')}}`;
}

function buildDedupeSignature({ actorUserId, actorEmail, type, severity, source, route, details }) {
  return stableStringify({
    actorEmail: actorEmail || null,
    actorUserId: actorUserId || null,
    details: details || null,
    route: route || null,
    severity,
    source,
    type,
  });
}

function shouldDedupeEvent(type) {
  return DEDUPED_EVENT_TYPES.has(type);
}

async function maybeReuseRecentEvent(prisma, input) {
  if (!shouldDedupeEvent(input.type)) {
    return null;
  }

  const latest = await prisma.securityEvent.findFirst({
    where: {
      type: input.type,
      severity: input.severity,
      source: input.source,
      route: input.route,
      actorUserId: input.actorUserId,
      actorEmail: input.actorEmail,
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!latest) {
    return null;
  }

  const latestTimestamp = latest.updatedAt ?? latest.createdAt;
  const withinWindow = Date.now() - new Date(latestTimestamp).getTime() <= DEDUPE_WINDOW_MS;
  if (!withinWindow) {
    return null;
  }

  const latestSignature = buildDedupeSignature({
    ...latest,
    details: latest.detailsJson ?? null,
  });
  const incomingSignature = buildDedupeSignature({
    ...input,
    details: input.detailsJson ?? null,
  });

  if (latestSignature !== incomingSignature) {
    return null;
  }

  const updated = await prisma.securityEvent.update({
    where: { id: latest.id },
    data: { updatedAt: new Date() },
  });

  return toDto(updated);
}

function toDto(record) {
  return {
    id: record.id,
    tenantKey: record.tenantKey,
    actorUserId: record.actorUserId,
    actorEmail: record.actorEmail,
    type: record.type,
    severity: record.severity,
    source: record.source,
    route: record.route,
    ip: record.ip,
    userAgent: record.userAgent,
    details: record.detailsJson,
    isRead: record.isRead,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export async function recordSecurityEvent({
  actor,
  type,
  severity = SecurityEventSeverity.INFO,
  source,
  route = null,
  ip = null,
  userAgent = null,
  details = null,
  tenantKey = null,
}) {
  if (!type || !source) {
    throw new Error('type and source are required for security events');
  }

  try {
    const prisma = getPrismaClient();
    const data = {
      tenantKey: tenantKey ?? (actor?.business?.id ? String(actor.business.id) : null),
      actorUserId: actor?.id ? String(actor.id) : null,
      actorEmail: actor?.email ? String(actor.email) : null,
      type,
      severity,
      source,
      route,
      ip,
      userAgent,
      detailsJson: sanitizeSecurityEventDetails(details),
    };

    const deduped = await maybeReuseRecentEvent(prisma, {
      actorEmail: data.actorEmail,
      actorUserId: data.actorUserId,
      detailsJson: data.detailsJson,
      route: data.route,
      severity: data.severity,
      source: data.source,
      type: data.type,
    });
    if (deduped) {
      return deduped;
    }

    const record = await prisma.securityEvent.create({
      data: {
        ...data,
      },
    });
    return toDto(record);
  } catch (error) {
    console.error('[SecurityEvent] Failed to record event:', error?.message || error);
    return null;
  }
}

export async function listSecurityEvents({ limit } = {}) {
  const prisma = getPrismaClient();
  const records = await prisma.securityEvent.findMany({
    orderBy: { createdAt: 'desc' },
    take: normalizeLimit(limit),
  });
  return {
    ok: true,
    items: records.map(toDto),
  };
}

export async function markSecurityEventRead(id) {
  const prisma = getPrismaClient();
  const record = await prisma.securityEvent.update({
    where: { id },
    data: { isRead: true },
  });
  return toDto(record);
}
