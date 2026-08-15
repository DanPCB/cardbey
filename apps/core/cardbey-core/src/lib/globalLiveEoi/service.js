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
  toApplicantEoiDto,
  toPublicPilotDto,
} from './domain.js';
import { buildServerConsentEvidence } from './consentEvidence.js';
import { generateEoiPublicReference } from './publicReference.js';
import {
  confirmationStatusFromResult,
  sendEoiConfirmation,
} from './sendEoiConfirmation.js';
import { getEoiOperationalHealth } from './health.js';

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

export { getEoiOperationalHealth };

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
    return { created: false, registration: existing };
  }

  const now = new Date();
  const sessionUserId =
    ctx.userId && typeof ctx.userId === 'string' && ctx.userId.trim()
      ? ctx.userId.trim()
      : null;

  let storeId = null;
  const requestedStoreId =
    input.storeId && String(input.storeId).trim() ? String(input.storeId).trim() : null;
  if (requestedStoreId) {
    if (!sessionUserId) {
      storeId = null;
    } else {
      const owned = await prisma.business.findFirst({
        where: { id: requestedStoreId, userId: sessionUserId },
        select: { id: true },
      });
      if (!owned) {
        throw makeError(
          GLOBAL_LIVE_EOI_ERROR_CODES.VALIDATION,
          'Selected business is not available for this account',
          400,
        );
      }
      storeId = owned.id;
    }
  }

  // Server-authoritative consent — ignore any client version fields.
  const consent = buildServerConsentEvidence({ language: input.language });

  let row = null;
  let lastErr = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      row = await prisma.globalLiveEoiRegistration.create({
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
          consentVersion: consent.consentVersion,
          privacyVersion: consent.privacyVersion,
          termsVersion: consent.termsVersion,
          consentLocale: consent.consentLocale,
          consentContext: consent.consentContext,
          consentTextHash: consent.consentTextHash,
          publicReference: generateEoiPublicReference(),
          status: GLOBAL_LIVE_EOI_STATUS.SUBMITTED,
        },
      });
      break;
    } catch (err) {
      lastErr = err;
      // Unique collision on publicReference — retry with a new opaque id.
      if (err?.code === 'P2002') continue;
      throw err;
    }
  }
  if (!row) {
    console.warn('[GlobalLiveEoi] create failed after reference retries', {
      code: lastErr?.code || 'unknown',
    });
    throw makeError(GLOBAL_LIVE_EOI_ERROR_CODES.UNKNOWN, 'Unable to process your request', 500);
  }

  // Best-effort confirmation — never fail create if delivery fails.
  try {
    const delivery = await sendEoiConfirmation({
      name: row.name,
      businessName: row.businessName,
      email: row.email,
      phone: row.phone,
      language: row.language,
      country: row.country,
      pilotId: row.pilotId,
      registrationId: row.id,
      publicReference: row.publicReference,
      createdAt: row.createdAt,
      showcaseTypes: row.showcaseTypes,
      status: row.status,
      storeId: row.storeId,
      userId: row.userId,
      confirmationEmailStatus: row.confirmationEmailStatus,
    });
    const status = confirmationStatusFromResult(delivery.email);
    const updated = await prisma.globalLiveEoiRegistration.update({
      where: { id: row.id },
      data: {
        confirmationEmailStatus: status,
        confirmationSentAt: status === 'sent' ? new Date() : null,
      },
    });
    row = updated;
  } catch (err) {
    console.warn('[GlobalLiveEoi] Confirmation failed (registration kept)', {
      registrationId: row.id,
      error: err?.message ? String(err.message).slice(0, 120) : 'unknown',
    });
    try {
      row = await prisma.globalLiveEoiRegistration.update({
        where: { id: row.id },
        data: { confirmationEmailStatus: 'failed' },
      });
    } catch {
      /* keep original row */
    }
  }

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
  if (query.createdFrom || query.createdTo) {
    where.createdAt = {};
    if (query.createdFrom) {
      const d = new Date(query.createdFrom);
      if (!Number.isNaN(d.getTime())) where.createdAt.gte = d;
    }
    if (query.createdTo) {
      const d = new Date(query.createdTo);
      if (!Number.isNaN(d.getTime())) where.createdAt.lte = d;
    }
  }
  const q = query.q != null ? String(query.q).trim() : '';
  if (q) {
    where.OR = [
      { businessName: { contains: q } },
      { publicReference: { contains: q } },
    ];
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

export async function getEoiRegistration(id) {
  if (!Features.globalLiveEoi.v1) {
    throw makeError(GLOBAL_LIVE_EOI_ERROR_CODES.DISABLED, 'Global Live EOI is disabled', 403);
  }
  const prisma = getPrismaClient();
  const row = await prisma.globalLiveEoiRegistration.findUnique({
    where: { id: String(id).trim() },
  });
  if (!row) {
    throw makeError(GLOBAL_LIVE_EOI_ERROR_CODES.NOT_FOUND, 'Registration not found', 404);
  }
  return toAdminEoiDto(row);
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

/**
 * Authenticated applicant view — only rows linked by userId or verified email match.
 * Possession of publicReference alone never grants access.
 */
export async function listMyEoiApplications({ userId, user, locale = 'en', limit } = {}) {
  if (!Features.globalLiveEoi.v1) {
    throw makeError(GLOBAL_LIVE_EOI_ERROR_CODES.DISABLED, 'Global Live EOI is disabled', 403);
  }
  const uid = userId && String(userId).trim() ? String(userId).trim() : null;
  if (!uid) {
    throw makeError(GLOBAL_LIVE_EOI_ERROR_CODES.VALIDATION, 'Authentication required', 401);
  }

  const prisma = getPrismaClient();
  const take = Math.min(Math.max(Number(limit) || 50, 1), 100);

  const byUser = await prisma.globalLiveEoiRegistration.findMany({
    where: { userId: uid },
    orderBy: { createdAt: 'desc' },
    take,
  });

  const emailVerified = Boolean(user?.emailVerified === true || user?.emailVerified === 1);
  const userEmailNorm = normalizeEmail(user?.email || '');

  // Link orphan rows only when email is verified and matches (side effect for claim).
  if (emailVerified && userEmailNorm) {
    const orphans = await prisma.globalLiveEoiRegistration.findMany({
      where: {
        userId: null,
        emailNormalized: userEmailNorm,
      },
      orderBy: { createdAt: 'desc' },
      take,
    });
    for (const orphan of orphans) {
      try {
        await prisma.globalLiveEoiRegistration.update({
          where: { id: orphan.id },
          data: { userId: uid },
        });
        orphan.userId = uid;
        byUser.push(orphan);
      } catch {
        /* ignore race */
      }
    }
  }

  const seen = new Set();
  const items = [];
  for (const row of byUser.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    items.push(toApplicantEoiDto(row, locale === 'vi' ? 'vi' : 'en'));
    if (items.length >= take) break;
  }

  return { items, total: items.length };
}
