import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { getPrivilegedActionPolicy } from '../../lib/privilegedActionPolicy.js';
import {
  recordSecurityEvent,
  SecurityEventSeverity,
  SecurityEventType,
} from './securityEventService.js';

export const PrivilegedVerificationMethod = Object.freeze({
  PASSWORD_RECONFIRM: 'password_reconfirm',
  TOTP: 'totp',
  WEBAUTHN: 'webauthn',
});

export const PRIVILEGED_VERIFICATION_COOKIE_NAME = 'cardbey_privileged_verification';
export const PRIVILEGED_VERIFICATION_MAX_AGE_SECONDS = 600;

const PRIVILEGED_VERIFICATION_SECRET =
  process.env.PRIVILEGED_VERIFICATION_SECRET || process.env.JWT_SECRET || 'default-secret-change-this';

export class PrivilegedVerificationError extends Error {
  constructor(message, { code = 'privileged_verification_failed', status = 403, details } = {}) {
    super(message);
    this.name = 'PrivilegedVerificationError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function resolveMaxAgeSeconds(action) {
  const policy = getPrivilegedActionPolicy(action);
  if (policy?.maxAgeSeconds && Number.isFinite(policy.maxAgeSeconds)) {
    return Math.max(1, Math.trunc(policy.maxAgeSeconds));
  }
  return PRIVILEGED_VERIFICATION_MAX_AGE_SECONDS;
}

function getCookieOptions(maxAgeSeconds = PRIVILEGED_VERIFICATION_MAX_AGE_SECONDS) {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/api/dev',
    maxAge: maxAgeSeconds * 1000,
  };
}

function parseCookieHeader(cookieHeader) {
  const parsed = {};
  for (const part of String(cookieHeader || '').split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) continue;
    parsed[trimmed.slice(0, separatorIndex).trim()] = decodeURIComponent(trimmed.slice(separatorIndex + 1).trim());
  }
  return parsed;
}

function createPrivilegedVerificationToken({ actor, method, maxAgeSeconds }) {
  const verifiedAt = new Date();
  const expiresAt = new Date(verifiedAt.getTime() + maxAgeSeconds * 1000);
  const token = jwt.sign(
    {
      type: 'privileged_verification',
      sub: String(actor.id),
      email: actor?.email ? String(actor.email) : null,
      role: String(actor?.role || ''),
      method,
      verifiedAt: verifiedAt.toISOString(),
      nonce: crypto.randomUUID?.() || crypto.randomBytes(16).toString('hex'),
    },
    PRIVILEGED_VERIFICATION_SECRET,
    { expiresIn: maxAgeSeconds }
  );

  return {
    token,
    verifiedAt: verifiedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
}

export function readPrivilegedVerification(req) {
  const cookies = req.cookies ?? parseCookieHeader(req.headers?.cookie);
  const token = cookies?.[PRIVILEGED_VERIFICATION_COOKIE_NAME];
  if (!token) {
    return { ok: false, reason: 'missing' };
  }

  try {
    const decoded = jwt.verify(token, PRIVILEGED_VERIFICATION_SECRET);
    if (!decoded?.sub || !decoded?.verifiedAt || decoded?.type !== 'privileged_verification') {
      return { ok: false, reason: 'invalid' };
    }
    if (req.user?.id && String(decoded.sub) !== String(req.user.id)) {
      return { ok: false, reason: 'subject_mismatch' };
    }
    return {
      ok: true,
      method: decoded.method || null,
      recentVerificationAt: decoded.verifiedAt,
      subjectUserId: decoded.sub,
    };
  } catch (error) {
    if (error?.name === 'TokenExpiredError') {
      return { ok: false, reason: 'expired' };
    }
    return { ok: false, reason: 'invalid' };
  }
}

export function clearPrivilegedVerification(res) {
  res.clearCookie(PRIVILEGED_VERIFICATION_COOKIE_NAME, getCookieOptions(1));
}

export function createPrivilegedVerificationCookieValue({ actor, method, maxAgeSeconds } = {}) {
  return createPrivilegedVerificationToken({
    actor,
    method: method || PrivilegedVerificationMethod.PASSWORD_RECONFIRM,
    maxAgeSeconds:
      maxAgeSeconds == null ? PRIVILEGED_VERIFICATION_MAX_AGE_SECONDS : maxAgeSeconds,
  }).token;
}

export async function issuePrivilegedVerification({ req, res, actor, method, requestContext, action }) {
  const maxAgeSeconds = resolveMaxAgeSeconds(action);
  const verification = createPrivilegedVerificationToken({
    actor,
    method,
    maxAgeSeconds,
  });

  res.cookie(
    PRIVILEGED_VERIFICATION_COOKIE_NAME,
    verification.token,
    getCookieOptions(maxAgeSeconds)
  );

  await recordSecurityEvent({
    actor,
    type: SecurityEventType.ADMIN_PRIVILEGED_VERIFICATION_SUCCEEDED,
    severity: SecurityEventSeverity.INFO,
    source: 'privileged_verification',
    route: requestContext?.route ?? req.originalUrl ?? req.path ?? null,
    ip: requestContext?.ip ?? req.ip ?? null,
    userAgent: requestContext?.userAgent ?? req.get?.('user-agent') ?? null,
    details: {
      action,
      method,
      verifiedAt: verification.verifiedAt,
      expiresAt: verification.expiresAt,
    },
  });

  return {
    ok: true,
    verification: {
      method,
      verifiedAt: verification.verifiedAt,
      expiresAt: verification.expiresAt,
      maxAgeSeconds,
    },
  };
}

export async function verifyPrivilegedPassword({ req, res, actor, password, requestContext, action }) {
  const valid =
    typeof password === 'string' &&
    password.length > 0 &&
    Boolean(actor?.passwordHash) &&
    (await bcrypt.compare(password, actor.passwordHash));
  if (!valid) {
    await recordSecurityEvent({
      actor,
      type: SecurityEventType.ADMIN_PRIVILEGED_VERIFICATION_FAILED,
      severity: SecurityEventSeverity.HIGH,
      source: 'privileged_verification',
      route: requestContext?.route ?? req.originalUrl ?? req.path ?? null,
      ip: requestContext?.ip ?? req.ip ?? null,
      userAgent: requestContext?.userAgent ?? req.get?.('user-agent') ?? null,
      details: {
        action,
        method: PrivilegedVerificationMethod.PASSWORD_RECONFIRM,
      },
    });

    throw new PrivilegedVerificationError('Verification failed', {
      code: 'invalid_credentials',
      status: 401,
    });
  }

  return issuePrivilegedVerification({
    req,
    res,
    actor,
    method: PrivilegedVerificationMethod.PASSWORD_RECONFIRM,
    requestContext,
    action,
  });
}

export async function requireRecentPrivilegedVerification({
  req,
  res,
  actor,
  action,
  requestContext,
}) {
  const policy = getPrivilegedActionPolicy(action);
  if (!policy?.requiresRecentPrivilegedVerification) {
    return {
      ok: true,
      verification: {
        requiredNow: false,
        satisfiedNow: true,
      },
    };
  }

  const verification = readPrivilegedVerification(req);
  if (verification.ok) {
    const verifiedAtMs = new Date(verification.recentVerificationAt).getTime();
    const maxAgeMs = (policy.maxAgeSeconds ?? PRIVILEGED_VERIFICATION_MAX_AGE_SECONDS) * 1000;
    if (Date.now() - verifiedAtMs <= maxAgeMs) {
      return {
        ok: true,
        verification: {
          requiredNow: true,
          satisfiedNow: true,
          recentVerificationAt: verification.recentVerificationAt,
          method: verification.method,
          maxAgeSeconds: policy.maxAgeSeconds ?? PRIVILEGED_VERIFICATION_MAX_AGE_SECONDS,
        },
      };
    }

    clearPrivilegedVerification(res);
  }

  const eventType =
    verification.reason === 'expired'
      ? SecurityEventType.ADMIN_PRIVILEGED_VERIFICATION_EXPIRED
      : SecurityEventType.ADMIN_PRIVILEGED_VERIFICATION_REQUIRED;

  await recordSecurityEvent({
    actor,
    type: eventType,
    severity: SecurityEventSeverity.WARNING,
    source: 'privileged_verification',
    route: requestContext?.route ?? req.originalUrl ?? req.path ?? null,
    ip: requestContext?.ip ?? req.ip ?? null,
    userAgent: requestContext?.userAgent ?? req.get?.('user-agent') ?? null,
    details: {
      action,
      reason: verification.reason,
      maxAgeSeconds: policy.maxAgeSeconds ?? PRIVILEGED_VERIFICATION_MAX_AGE_SECONDS,
    },
  });

  throw new PrivilegedVerificationError('Recent privileged verification required', {
    code: 'privileged_verification_required',
    status: 403,
    details: {
      action,
      reason: verification.reason === 'expired' ? 'expired' : 'required',
      verificationMethod: policy.verificationMethod,
      maxAgeSeconds: policy.maxAgeSeconds ?? PRIVILEGED_VERIFICATION_MAX_AGE_SECONDS,
    },
  });
}
