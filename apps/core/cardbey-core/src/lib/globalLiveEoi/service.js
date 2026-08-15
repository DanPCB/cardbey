/**
 * Global Live Pilot EOI — persistence + business rules.
 */

import { getPrismaClient } from '../prisma.js';
import { Features } from '../../config/features.js';
import {
  DEFAULT_GLOBAL_LIVE_EOI_PILOT_ID,
  EOI_DEDUPE_WINDOW_MS,
  GLOBAL_LIVE_EOI_ERROR_CODES,
  GLOBAL_LIVE_EOI_STATUS,
  GLOBAL_LIVE_EOI_STATUSES,
  normalizeBusinessUrl,
  normalizeEmail,
  normalizePhone,
  resolvePilot,
  sanitizeText,
  toAdminEoiDto,
  toPublicPilotDto,
} from './domain.js';

function makeError(code, message, status = 400) {
  const err = new Error(message || code);
  err.code = code;
  err.status = status;
  return err;
}

export function getPublicConfig(pilotIdInput) {
  const { id, pilot } = resolvePilot(pilotIdInput);
  if (!pilot) {
    throw makeError(GLOBAL_LIVE_EOI_ERROR_CODES.UNKNOWN_PILOT, 'Unknown pilot', 404);
  }
  const enabled = Features.globalLiveEoi.v1 === true;
  const open = enabled && Features.globalLiveEoi.open === true;
  return {
    enabled,
    open,
    pilot: toPublicPilotDto(pilot),
    defaultPilotId: DEFAULT_GLOBAL_LIVE_EOI_PILOT_ID,
    consentRequired: true,
  };
}

/**
 * Create EOI or soft-dedupe recent duplicate for same pilot + email.
 * Never reveals whether email belongs to a Cardbey account.
 */
export async function submitEoiRegistration(input, ctx = {}) {
  if (!Features.globalLiveEoi.v1) {
    throw makeError(GLOBAL_LIVE_EOI_ERROR_CODES.DISABLED, 'Global Live EOI is disabled', 403);
  }
  if (!Features.globalLiveEoi.open) {
    throw makeError(GLOBAL_LIVE_EOI_ERROR_CODES.CLOSED, 'Registrations for this pilot are now closed', 403);
  }

  const { id: pilotId, pilot } = resolvePilot(input.pilotId);
  if (!pilot) {
    throw makeError(GLOBAL_LIVE_EOI_ERROR_CODES.UNKNOWN_PILOT, 'Unknown pilot', 400);
  }

  const emailNormalized = normalizeEmail(input.email);
  const phone = normalizePhone(input.phone);
  const prisma = getPrismaClient();

  const since = new Date(Date.now() - EOI_DEDUPE_WINDOW_MS);
  const existing = await prisma.globalLiveEoiRegistration.findFirst({
    where: {
      pilotId,
      emailNormalized,
      createdAt: { gte: since },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (existing) {
    // Idempotent success — do not leak duplicate/account signals to client.
    return { created: false, registration: existing };
  }

  const now = new Date();
  const sessionUserId =
    ctx.userId && typeof ctx.userId === 'string' && ctx.userId.trim()
      ? ctx.userId.trim()
      : null;
  // Only accept client storeId when authenticated; never invent ownership.
  const storeId =
    sessionUserId && input.storeId && String(input.storeId).trim()
      ? String(input.storeId).trim()
      : null;

  const row = await prisma.globalLiveEoiRegistration.create({
    data: {
      pilotId,
      userId: sessionUserId,
      storeId,
      name: sanitizeText(input.name, 120),
      businessName: sanitizeText(input.businessName, 200),
      industry: sanitizeText(input.industry, 120),
      city: sanitizeText(input.city, 120),
      country: sanitizeText(input.country || pilot.defaultCountry || 'Vietnam', 120),
      phone,
      email: sanitizeText(input.email, 200),
      emailNormalized,
      showcaseTypes: input.showcaseTypes,
      businessDescription: sanitizeText(input.businessDescription, 2000),
      existingCardbeyBusiness: input.existingCardbeyBusiness,
      businessUrl: normalizeBusinessUrl(input.businessUrl),
      language: input.language ? sanitizeText(input.language, 16) : null,
      source: input.source ? sanitizeText(input.source, 200) : null,
      campaign: input.campaign ? sanitizeText(input.campaign, 200) : null,
      utmSource: input.utmSource ? sanitizeText(input.utmSource, 200) : null,
      utmMedium: input.utmMedium ? sanitizeText(input.utmMedium, 200) : null,
      utmCampaign: input.utmCampaign ? sanitizeText(input.utmCampaign, 200) : null,
      utmContent: input.utmContent ? sanitizeText(input.utmContent, 200) : null,
      referrer: input.referrer ? sanitizeText(input.referrer, 500) : null,
      socialProvider: input.socialProvider ? sanitizeText(input.socialProvider, 200) : null,
      consentGranted: true,
      consentAt: now,
      status: GLOBAL_LIVE_EOI_STATUS.SUBMITTED,
    },
  });

  return { created: true, registration: row };
}

export async function listEoiRegistrations(query = {}) {
  if (!Features.globalLiveEoi.v1) {
    throw makeError(GLOBAL_LIVE_EOI_ERROR_CODES.DISABLED, 'Global Live EOI is disabled', 403);
  }

  const prisma = getPrismaClient();
  const where = {};
  if (query.pilotId) where.pilotId = String(query.pilotId).trim();
  if (query.status && GLOBAL_LIVE_EOI_STATUSES.includes(String(query.status))) {
    where.status = String(query.status);
  }

  const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 200);
  const offset = Math.max(Number(query.offset) || 0, 0);

  const [rows, total, grouped] = await Promise.all([
    prisma.globalLiveEoiRegistration.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.globalLiveEoiRegistration.count({ where }),
    prisma.globalLiveEoiRegistration.groupBy({
      by: ['status'],
      where: query.pilotId ? { pilotId: String(query.pilotId).trim() } : undefined,
      _count: { _all: true },
    }),
  ]);

  const counts = {
    total: 0,
    SUBMITTED: 0,
    UNDER_REVIEW: 0,
    SHORTLISTED: 0,
    SELECTED: 0,
    WAITLISTED: 0,
    DECLINED: 0,
    WITHDRAWN: 0,
  };
  for (const g of grouped) {
    const n = g._count?._all ?? 0;
    counts.total += n;
    if (counts[g.status] != null) counts[g.status] = n;
  }

  return {
    items: rows.map(toAdminEoiDto),
    total,
    counts,
    limit,
    offset,
  };
}

export async function updateEoiStatus(id, status) {
  if (!Features.globalLiveEoi.v1) {
    throw makeError(GLOBAL_LIVE_EOI_ERROR_CODES.DISABLED, 'Global Live EOI is disabled', 403);
  }
  if (!GLOBAL_LIVE_EOI_STATUSES.includes(status)) {
    throw makeError(GLOBAL_LIVE_EOI_ERROR_CODES.VALIDATION, 'Invalid status', 400);
  }

  const prisma = getPrismaClient();
  const existing = await prisma.globalLiveEoiRegistration.findUnique({
    where: { id: String(id).trim() },
  });
  if (!existing) {
    throw makeError(GLOBAL_LIVE_EOI_ERROR_CODES.NOT_FOUND, 'Registration not found', 404);
  }

  const updated = await prisma.globalLiveEoiRegistration.update({
    where: { id: existing.id },
    data: { status },
  });
  return toAdminEoiDto(updated);
}
