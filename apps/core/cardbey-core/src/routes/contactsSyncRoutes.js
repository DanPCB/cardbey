/**
 * Contact Sync API (Phase 1 MVP)
 * Non-negotiables:
 * - Reject guest tokens explicitly (guests pass requireAuth in this codebase).
 * - Never accept raw contacts in logs; never log identifiers/hashes.
 * - No lookup endpoints (no match-by-phone/email).
 * - Matching happens only after user-owned upload.
 */

import { Router } from 'express';
import crypto from 'crypto';
import { requireAuth } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { getPrismaClient } from '../lib/prisma.js';
import { piiSafeError } from '../utils/piiGuard.js';
import {
  canonicalizeEmail,
  canonicalizePhoneE164,
  isContactSyncHashConfigured,
  getContactSyncHashVersion,
  hmacIdentifier,
} from '../lib/contactSyncHash.js';

const router = Router();
const prisma = getPrismaClient();

const POLICY_VERSION = 'contacts_sync_v1';
const UPLOAD_TOKEN_TTL_MS = 15 * 60 * 1000;

function isGuest(req) {
  return req?.user?.role === 'guest' || String(req?.user?.id || '').startsWith('guest_');
}

async function requireDbUser(req) {
  if (!req?.user?.id) return null;
  // Always verify DB-backed user exists; do not trust JWT alone.
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { id: true, email: true, emailVerified: true, createdAt: true },
  });
  return user;
}

function newUploadToken() {
  return crypto.randomBytes(24).toString('hex');
}

function safePlatform(input) {
  const p = typeof input === 'string' ? input.trim().toLowerCase() : '';
  if (p === 'ios' || p === 'android' || p === 'web') return p;
  return null;
}

function computeRateLimitKey(req, suffix) {
  const userId = req?.user?.id || 'anon';
  const ip = req.ip || 'unknown';
  return `contactsSync:${suffix}:${userId}:${ip}`;
}

// Strict MVP abuse control:
// - Session create is cheap, but still rate limited.
// - Upload is tightly rate limited (anti-enumeration).
const limitCreateSession = rateLimit({
  windowMs: 60_000,
  max: 10,
  keyGenerator: (req) => computeRateLimitKey(req, 'create'),
  code: 'contacts_sync_rate_limited',
});

const limitUpload = rateLimit({
  windowMs: 60_000,
  max: 5,
  keyGenerator: (req) => computeRateLimitKey(req, 'upload'),
  code: 'contacts_sync_rate_limited',
});

/**
 * POST /api/contacts-sync/sessions
 * Auth required; rejects guest tokens.
 * Creates consent+source+job and issues short-lived uploadToken.
 */
router.post('/contacts-sync/sessions', requireAuth, limitCreateSession, async (req, res, next) => {
  try {
    if (isGuest(req)) {
      return res.status(403).json({ ok: false, code: 'AUTH_REQUIRED', error: 'forbidden', message: 'Auth required for contact sync' });
    }
    if (!isContactSyncHashConfigured()) {
      return res.status(503).json({ ok: false, code: 'CONTACT_SYNC_NOT_CONFIGURED', error: 'service_unavailable', message: 'Contact sync is not configured on this server' });
    }
    const dbUser = await requireDbUser(req);
    if (!dbUser) {
      return res.status(401).json({ ok: false, code: 'UNAUTHORIZED', error: 'unauthorized', message: 'User not found' });
    }

    // Optional improvement: verified account requirement (lightweight).
    // Allow if email verified OR account older than 10 minutes.
    const minAgeMs = 10 * 60 * 1000;
    const ageMs = Date.now() - new Date(dbUser.createdAt).getTime();
    const verifiedOk = Boolean(dbUser.emailVerified) || ageMs >= minAgeMs;
    if (!verifiedOk) {
      return res.status(403).json({
        ok: false,
        code: 'ACCOUNT_NOT_VERIFIED',
        error: 'forbidden',
        message: 'Please verify your account (or wait a few minutes) before syncing contacts.',
      });
    }

    const platform = safePlatform(req.body?.platform);
    if (!platform) {
      return res.status(400).json(piiSafeError('platform is required (ios|android|web)', 'BAD_REQUEST'));
    }
    const deviceFingerprint =
      typeof req.body?.deviceFingerprint === 'string' && req.body.deviceFingerprint.trim()
        ? req.body.deviceFingerprint.trim().slice(0, 200)
        : null;

    const consent = await prisma.contactSyncConsent.create({
      data: {
        userId: dbUser.id,
        status: 'granted',
        policyVersion: POLICY_VERSION,
      },
      select: { id: true },
    });

    const uploadToken = newUploadToken();
    const source = await prisma.contactSyncSource.create({
      data: {
        userId: dbUser.id,
        consentId: consent.id,
        platform,
        deviceFingerprint,
        status: 'active',
        // Store token in deviceFingerprint? No. Keep separate via source metadata? MVP: store in ContactSyncJob counts? No.
      },
      select: { id: true },
    });

    const job = await prisma.contactSyncJob.create({
      data: {
        sourceId: source.id,
        status: 'started',
        counts: {
          uploadToken,
          uploadTokenExpiresAt: Date.now() + UPLOAD_TOKEN_TTL_MS,
          hashVersion: getContactSyncHashVersion(),
        },
      },
      select: { id: true },
    });

    // Ensure the current user has a verified identifier row for email (global match anchor).
    // This is server-controlled HMAC; no raw email returned.
    if (dbUser.email && typeof dbUser.email === 'string') {
      const canonEmail = canonicalizeEmail(dbUser.email);
      if (canonEmail) {
        const hash = hmacIdentifier('email', canonEmail);
        const hv = getContactSyncHashVersion();
        await prisma.userIdentifier.upsert({
          where: { kind_hash_hashVersion: { kind: 'email', hash, hashVersion: hv } },
          create: {
            userId: dbUser.id,
            kind: 'email',
            hash,
            hashVersion: hv,
            source: 'email',
            verifiedAt: dbUser.emailVerified ? new Date() : null,
          },
          update: {
            userId: dbUser.id,
            verifiedAt: dbUser.emailVerified ? new Date() : undefined,
          },
        });
      }
    }

    return res.status(201).json({
      ok: true,
      sessionId: source.id,
      jobId: job.id,
      uploadToken,
      uploadTokenExpiresInS: Math.floor(UPLOAD_TOKEN_TTL_MS / 1000),
      hashVersion: getContactSyncHashVersion(),
      maxIdentifiers: 5000, // MVP cap; enforced on upload
    });
  } catch (err) {
    next(err);
  }
});

function extractUploadTokenFromJob(job) {
  const c = job?.counts;
  if (!c || typeof c !== 'object') return null;
  const token = c.uploadToken;
  const expiresAt = c.uploadTokenExpiresAt;
  if (typeof token !== 'string' || !token) return null;
  if (typeof expiresAt !== 'number') return null;
  return { token, expiresAt };
}

/**
 * POST /api/contacts-sync/sessions/:sessionId/identifiers
 * Body: { identifiers: [{ kind: 'phone'|'email', value: string }] }
 * - Client sends normalized values (E.164 / lowercase email), but server re-canonicalizes.
 * - Server computes HMAC and stores hashes only.
 */
router.post('/contacts-sync/sessions/:sessionId/identifiers', requireAuth, limitUpload, async (req, res, next) => {
  try {
    if (isGuest(req)) {
      return res.status(403).json({ ok: false, code: 'AUTH_REQUIRED', error: 'forbidden', message: 'Auth required for contact sync' });
    }
    if (!isContactSyncHashConfigured()) {
      return res.status(503).json({ ok: false, code: 'CONTACT_SYNC_NOT_CONFIGURED', error: 'service_unavailable', message: 'Contact sync is not configured on this server' });
    }
    const dbUser = await requireDbUser(req);
    if (!dbUser) {
      return res.status(401).json({ ok: false, code: 'UNAUTHORIZED', error: 'unauthorized', message: 'User not found' });
    }
    const sessionId = typeof req.params.sessionId === 'string' ? req.params.sessionId.trim() : '';
    if (!sessionId) return res.status(400).json(piiSafeError('sessionId required', 'BAD_REQUEST'));

    const source = await prisma.contactSyncSource.findUnique({
      where: { id: sessionId },
      select: { id: true, userId: true, status: true },
    });
    if (!source || source.userId !== dbUser.id) {
      return res.status(404).json({ ok: false, code: 'NOT_FOUND', error: 'not_found', message: 'Sync session not found' });
    }
    if (source.status !== 'active') {
      return res.status(409).json({ ok: false, code: 'SESSION_INACTIVE', error: 'conflict', message: 'Sync session is not active' });
    }

    const tokenHeader = (req.get('x-contacts-sync-token') || '').trim();
    if (!tokenHeader) {
      return res.status(401).json({ ok: false, code: 'UPLOAD_TOKEN_REQUIRED', error: 'unauthorized', message: 'Upload token required' });
    }

    const latestJob = await prisma.contactSyncJob.findFirst({
      where: { sourceId: source.id },
      orderBy: { startedAt: 'desc' },
      select: { id: true, counts: true, status: true },
    });
    const tok = extractUploadTokenFromJob(latestJob);
    if (!tok || tok.token !== tokenHeader) {
      return res.status(401).json({ ok: false, code: 'UPLOAD_TOKEN_INVALID', error: 'unauthorized', message: 'Upload token invalid' });
    }
    if (Date.now() > tok.expiresAt) {
      return res.status(401).json({ ok: false, code: 'UPLOAD_TOKEN_EXPIRED', error: 'unauthorized', message: 'Upload token expired' });
    }

    const rawList = req.body?.identifiers;
    if (!Array.isArray(rawList) || rawList.length === 0) {
      return res.status(400).json(piiSafeError('identifiers must be a non-empty array', 'BAD_REQUEST'));
    }
    if (rawList.length > 5000) {
      return res.status(413).json({ ok: false, code: 'TOO_MANY_IDENTIFIERS', error: 'payload_too_large', message: 'Too many identifiers in one upload' });
    }

    const hv = getContactSyncHashVersion();
    const now = new Date();
    const hashes = [];
    for (const row of rawList) {
      const kind = row?.kind;
      const value = row?.value;
      if (kind !== 'phone' && kind !== 'email') continue;
      if (typeof value !== 'string') continue;

      if (kind === 'email') {
        const canon = canonicalizeEmail(value);
        if (!canon) continue;
        hashes.push({ kind: 'email', hash: hmacIdentifier('email', canon) });
      } else if (kind === 'phone') {
        const canon = canonicalizePhoneE164(value);
        if (!canon) continue;
        hashes.push({ kind: 'phone', hash: hmacIdentifier('phone', canon) });
      }
    }
    if (hashes.length === 0) {
      return res.status(400).json(piiSafeError('No valid identifiers to upload', 'BAD_REQUEST'));
    }

    // Dedup in memory to reduce DB writes
    const dedupKey = (k, h) => `${k}:${h}`;
    const seen = new Set();
    const deduped = [];
    for (const h of hashes) {
      const key = dedupKey(h.kind, h.hash);
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(h);
    }

    // Store identifiers (hashes only)
    // Use createMany with skipDuplicates? Not available in older Prisma? We'll do upsert per row to be safe.
    let accepted = 0;
    for (const h of deduped) {
      await prisma.contactIdentifier.upsert({
        where: {
          sourceId_kind_hash_hashVersion: {
            sourceId: source.id,
            kind: h.kind,
            hash: h.hash,
            hashVersion: hv,
          },
        },
        create: {
          sourceId: source.id,
          kind: h.kind,
          hash: h.hash,
          hashVersion: hv,
          firstSeenAt: now,
          lastSeenAt: now,
        },
        update: { lastSeenAt: now },
      });
      accepted += 1;
    }

    // Match: join uploaded identifiers to UserIdentifier (global).
    // Exact match only; no directory endpoint.
    const kindToUserIds = new Map(); // kind:hash -> userId[]
    for (const h of deduped) {
      const rows = await prisma.userIdentifier.findMany({
        where: { kind: h.kind, hash: h.hash, hashVersion: hv },
        select: { userId: true },
        take: 5, // defensive; should be unique by kind+hash+hv
      });
      for (const r of rows) {
        if (r.userId && r.userId !== dbUser.id) {
          const k = dedupKey(h.kind, h.hash);
          const list = kindToUserIds.get(k) || [];
          list.push(r.userId);
          kindToUserIds.set(k, list);
        }
      }
    }

    // Collapse per matched user
    const matchedByUser = new Map(); // userId -> { phone:boolean, email:boolean }
    for (const [k, userIds] of kindToUserIds.entries()) {
      const kind = k.startsWith('phone:') ? 'phone' : 'email';
      for (const uid of userIds) {
        const rec = matchedByUser.get(uid) || { phone: false, email: false };
        rec[kind] = true;
        matchedByUser.set(uid, rec);
      }
    }

    let matchedCount = 0;
    for (const [uid, basis] of matchedByUser.entries()) {
      const matchBasis = basis.phone && basis.email ? 'both' : basis.phone ? 'phone' : 'email';
      await prisma.contactMatch.upsert({
        where: { sourceId_matchedUserId: { sourceId: source.id, matchedUserId: uid } },
        create: {
          sourceId: source.id,
          matchedUserId: uid,
          matchBasis,
          confidence: 1.0,
          lastSeenAt: now,
        },
        update: { matchBasis, lastSeenAt: now },
      });
      matchedCount += 1;
    }

    // Update source metadata
    await prisma.contactSyncSource.update({
      where: { id: source.id },
      data: { lastSyncAt: now },
    });

    // Materialize suggestions (simple MVP ranking: matched users first)
    // Clear existing active suggestions for user to avoid stale results.
    await prisma.contactSuggestion.updateMany({
      where: { userId: dbUser.id, status: 'active' },
      data: { status: 'expired' },
    });

    let rank = 0;
    for (const uid of matchedByUser.keys()) {
      rank += 1;
      await prisma.contactSuggestion.create({
        data: {
          userId: dbUser.id,
          type: 'connect',
          matchedUserId: uid,
          rankScore: 1_000_000 - rank,
          reasonCode: 'direct_contact_match',
          status: 'active',
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });
    }

    // Mark job completed (store counts; do not store identifiers/hashes)
    if (latestJob?.id) {
      const prevCounts = latestJob.counts && typeof latestJob.counts === 'object' ? latestJob.counts : {};
      await prisma.contactSyncJob.update({
        where: { id: latestJob.id },
        data: {
          status: 'completed',
          finishedAt: now,
          counts: {
            ...prevCounts,
            received: rawList.length,
            accepted,
            matched: matchedCount,
          },
        },
      });
    }

    return res.json({
      ok: true,
      accepted,
      matched: matchedCount,
      suggestionsReady: true,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/contacts-sync/sessions/:sessionId/results
 * Returns connect suggestions (matched user profiles) + invite skeleton suggestions.
 * No raw identifiers returned; no hashes returned.
 */
router.get('/contacts-sync/sessions/:sessionId/results', requireAuth, async (req, res, next) => {
  try {
    if (isGuest(req)) {
      return res.status(403).json({ ok: false, code: 'AUTH_REQUIRED', error: 'forbidden', message: 'Auth required for contact sync' });
    }
    if (!isContactSyncHashConfigured()) {
      return res.status(503).json({ ok: false, code: 'CONTACT_SYNC_NOT_CONFIGURED', error: 'service_unavailable', message: 'Contact sync is not configured on this server' });
    }
    const dbUser = await requireDbUser(req);
    if (!dbUser) {
      return res.status(401).json({ ok: false, code: 'UNAUTHORIZED', error: 'unauthorized', message: 'User not found' });
    }
    const sessionId = typeof req.params.sessionId === 'string' ? req.params.sessionId.trim() : '';
    if (!sessionId) return res.status(400).json(piiSafeError('sessionId required', 'BAD_REQUEST'));

    const source = await prisma.contactSyncSource.findUnique({
      where: { id: sessionId },
      select: { id: true, userId: true },
    });
    if (!source || source.userId !== dbUser.id) {
      return res.status(404).json({ ok: false, code: 'NOT_FOUND', error: 'not_found', message: 'Sync session not found' });
    }

    const suggestions = await prisma.contactSuggestion.findMany({
      where: { userId: dbUser.id, status: 'active' },
      orderBy: [{ rankScore: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    });

    const matchedUserIds = suggestions
      .filter((s) => s.type === 'connect' && s.matchedUserId)
      .map((s) => s.matchedUserId);

    const uniqueIds = Array.from(new Set(matchedUserIds));
    const users = uniqueIds.length
      ? await prisma.user.findMany({
          where: { id: { in: uniqueIds } },
          select: {
            id: true,
            handle: true,
            displayName: true,
            fullName: true,
            avatarUrl: true,
            tagline: true,
          },
        })
      : [];
    const userById = new Map(users.map((u) => [u.id, u]));

    const connect = [];
    for (const s of suggestions) {
      if (s.type !== 'connect' || !s.matchedUserId) continue;
      const u = userById.get(s.matchedUserId);
      if (!u) continue;
      connect.push({
        suggestionId: s.id,
        user: u,
        reasonCode: s.reasonCode,
      });
    }

    return res.json({
      ok: true,
      sessionId: source.id,
      connect,
      invite: [], // MVP: invite suggestions come from client contact list; server only provides invite link creation API.
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/contacts-sync/suggestions/:id/dismiss
 */
router.post('/contacts-sync/suggestions/:id/dismiss', requireAuth, async (req, res, next) => {
  try {
    if (isGuest(req)) {
      return res.status(403).json({ ok: false, code: 'AUTH_REQUIRED', error: 'forbidden', message: 'Auth required for contact sync' });
    }
    const dbUser = await requireDbUser(req);
    if (!dbUser) {
      return res.status(401).json({ ok: false, code: 'UNAUTHORIZED', error: 'unauthorized', message: 'User not found' });
    }
    const id = typeof req.params.id === 'string' ? req.params.id.trim() : '';
    if (!id) return res.status(400).json(piiSafeError('id required', 'BAD_REQUEST'));
    const row = await prisma.contactSuggestion.findUnique({ where: { id }, select: { id: true, userId: true } });
    if (!row || row.userId !== dbUser.id) {
      return res.status(404).json({ ok: false, code: 'NOT_FOUND', error: 'not_found', message: 'Suggestion not found' });
    }
    await prisma.contactSuggestion.update({ where: { id }, data: { status: 'dismissed' } });
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/contacts-sync/revoke
 * Marks consent revoked and disables sources.
 */
router.post('/contacts-sync/revoke', requireAuth, async (req, res, next) => {
  try {
    if (isGuest(req)) {
      return res.status(403).json({ ok: false, code: 'AUTH_REQUIRED', error: 'forbidden', message: 'Auth required for contact sync' });
    }
    const dbUser = await requireDbUser(req);
    if (!dbUser) return res.status(401).json({ ok: false, code: 'UNAUTHORIZED', error: 'unauthorized', message: 'User not found' });

    await prisma.contactSyncConsent.updateMany({
      where: { userId: dbUser.id, status: 'granted' },
      data: { status: 'revoked', revokedAt: new Date() },
    });
    await prisma.contactSyncSource.updateMany({
      where: { userId: dbUser.id, status: 'active' },
      data: { status: 'disabled' },
    });
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/contacts-sync/data
 * Hard deletes contact sync data for the authenticated user (idempotent).
 */
router.delete('/contacts-sync/data', requireAuth, async (req, res, next) => {
  try {
    if (isGuest(req)) {
      return res.status(403).json({ ok: false, code: 'AUTH_REQUIRED', error: 'forbidden', message: 'Auth required for contact sync' });
    }
    const dbUser = await requireDbUser(req);
    if (!dbUser) return res.status(401).json({ ok: false, code: 'UNAUTHORIZED', error: 'unauthorized', message: 'User not found' });

    // Find sources to cascade delete child rows in correct order (SQLite FK constraints depend on migration settings)
    const sources = await prisma.contactSyncSource.findMany({
      where: { userId: dbUser.id },
      select: { id: true, consentId: true },
    });
    const sourceIds = sources.map((s) => s.id);
    const consentIds = Array.from(new Set(sources.map((s) => s.consentId)));

    const deleted = {
      sources: 0,
      consents: 0,
      identifiers: 0,
      matches: 0,
      jobs: 0,
      suggestions: 0,
    };

    if (sourceIds.length) {
      deleted.identifiers = (await prisma.contactIdentifier.deleteMany({ where: { sourceId: { in: sourceIds } } })).count;
      deleted.matches = (await prisma.contactMatch.deleteMany({ where: { sourceId: { in: sourceIds } } })).count;
      deleted.jobs = (await prisma.contactSyncJob.deleteMany({ where: { sourceId: { in: sourceIds } } })).count;
      deleted.sources = (await prisma.contactSyncSource.deleteMany({ where: { id: { in: sourceIds } } })).count;
    }
    deleted.suggestions = (await prisma.contactSuggestion.deleteMany({ where: { userId: dbUser.id } })).count;
    if (consentIds.length) {
      deleted.consents = (await prisma.contactSyncConsent.deleteMany({ where: { id: { in: consentIds } } })).count;
    }

    return res.json({ ok: true, deleted });
  } catch (err) {
    next(err);
  }
});

export default router;

