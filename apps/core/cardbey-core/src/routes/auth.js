/**
 * Authentication Routes
 * POST /api/auth/register
 * POST /api/auth/login
 * GET  /api/auth/me
 */

import express from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { generateToken, generateGuestToken, requireAuth } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { sendMail } from '../services/email/mailer.js';
import { getVerifyEmailContent } from '../services/email/templates/verifyEmail.js';
import { getResetPasswordContent } from '../services/email/templates/resetPasswordEmail.js';
import { registerWithEmailPassword, loginWithEmailPassword } from '../services/auth/authService.js';
import { getPersonalPresenceLinkFields } from '../services/personalPresence/personalPresenceQr.js';

const router = express.Router();

/** Rate limit: 3 verification requests per 15 minutes per user (skipped in test) */
const verificationRequestLimiter = (req, res, next) => {
  if (process.env.NODE_ENV === 'test') return next();
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 3,
    keyGenerator: (req) => `verify-req-user:${req.userId || req.user?.id || 'unknown'}`,
    message: 'You can request another verification email in {retryAfter} seconds. Limit is {max} requests per {windowMinutes} minutes.',
    code: 'RATE_LIMITED',
  })(req, res, next);
};

/** Rate limit: 10 verification requests per hour per IP (skipped in test) */
const verificationRequestLimiterIP = (req, res, next) => {
  if (process.env.NODE_ENV === 'test') return next();
  return rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    keyGenerator: (req) => `verify-req-ip:${req.ip || 'unknown'}`,
    message: 'Too many verification requests from this network. Try again in {retryAfter} seconds.',
    code: 'RATE_LIMITED',
  })(req, res, next);
};

/** 60s cooldown per user between successful sends (in-memory; resets on restart) */
const verificationSendCooldownMs = 60 * 1000;
const lastVerificationSendByUser = new Map();

/** Rate limit: 5 password reset requests per 15 minutes per IP (skipped in test) */
const passwordResetRequestLimiter = (req, res, next) => {
  if (process.env.NODE_ENV === 'test') return next();
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    keyGenerator: (req) => `pwd-reset:${req.ip || 'unknown'}`,
    message: 'Too many reset requests. Try again in {retryAfter} seconds.',
  })(req, res, next);
};
const prisma = new PrismaClient();

function normalizeIdentifier(value) {
  if (!value) return '';
  return value.toString().trim().toLowerCase();
}

function isValidHttpUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    const u = new URL(value.trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Optional string fields: return JSON null (not the string "null", not undefined).
 * Handles DB/legacy values where the literal "null" was stored as text.
 */
function jsonNullIfUnset(value) {
  if (value == null) return null;
  if (typeof value === 'string') {
    const t = value.trim();
    if (t === '' || t.toLowerCase() === 'null') return null;
    return t;
  }
  return value;
}

function buildPatchProfileUserResponse(updatedUser) {
  const { passwordHash: _, personalPresenceStore, ...userWithoutPassword } = updatedUser;
  return {
    ...userWithoutPassword,
    roles: JSON.parse(userWithoutPassword.roles || '["viewer"]'),
    onboarding: userWithoutPassword.onboarding ? JSON.parse(userWithoutPassword.onboarding) : null,
    stores: updatedUser.businesses || [],
    hasStore: Array.isArray(updatedUser.businesses) && updatedUser.businesses.length > 0,
    handle: updatedUser.handle,
    displayName: jsonNullIfUnset(updatedUser.displayName),
    tagline: updatedUser.tagline,
    avatarUrl: updatedUser.avatarUrl,
    profilePhoto: jsonNullIfUnset(updatedUser.profilePhoto),
    bio: jsonNullIfUnset(updatedUser.bio),
    qrCodeUrl: jsonNullIfUnset(updatedUser.qrCodeUrl),
    personalPresenceStoreId: updatedUser.personalPresenceStoreId ?? null,
    personalPresenceStoreSlug: personalPresenceStore?.slug ?? null,
    phone: jsonNullIfUnset(updatedUser.phone),
    addressLine1: jsonNullIfUnset(updatedUser.addressLine1),
    addressLine2: jsonNullIfUnset(updatedUser.addressLine2),
    city: jsonNullIfUnset(updatedUser.city),
    country: jsonNullIfUnset(updatedUser.country),
    postcode: jsonNullIfUnset(updatedUser.postcode),
  };
}

/**
 * PATCH /api/auth/profile and PATCH /api/users/me (mounted in server.js).
 * Client cannot set qrCodeUrl; it is ignored if sent.
 */
export async function patchCurrentUserProfile(req, res, next) {
  try {
    const body = req.body ?? {};
    const {
      displayName,
      fullName,
      email,
      accountType,
      avatarUrl,
      tagline,
      profilePhoto,
      bio,
      personalPresenceStoreId,
      phone,
      addressLine1,
      addressLine2,
      city,
      country,
      postcode,
    } = body;
    const hasPresenceKey = Object.prototype.hasOwnProperty.call(body, 'personalPresenceStoreId');
    const hasContactKey =
      Object.prototype.hasOwnProperty.call(body, 'phone') ||
      Object.prototype.hasOwnProperty.call(body, 'addressLine1') ||
      Object.prototype.hasOwnProperty.call(body, 'addressLine2') ||
      Object.prototype.hasOwnProperty.call(body, 'city') ||
      Object.prototype.hasOwnProperty.call(body, 'country') ||
      Object.prototype.hasOwnProperty.call(body, 'postcode');

    if (
      displayName === undefined &&
      fullName === undefined &&
      email === undefined &&
      accountType === undefined &&
      avatarUrl === undefined &&
      tagline === undefined &&
      profilePhoto === undefined &&
      bio === undefined &&
      !hasPresenceKey &&
      !hasContactKey
    ) {
      return res.status(400).json({
        ok: false,
        error: 'No fields to update',
        message: 'At least one field must be provided',
      });
    }

    if (displayName !== undefined) {
      if (typeof displayName !== 'string' || displayName.trim().length === 0) {
        return res.status(400).json({
          ok: false,
          error: 'Invalid display name',
          message: 'Display name must be a non-empty string',
        });
      }
      if (displayName.trim().length > 100) {
        return res.status(400).json({
          ok: false,
          error: 'Invalid display name',
          message: 'Display name must be at most 100 characters',
        });
      }
    }

    if (email !== undefined) {
      const normalizedEmail = normalizeIdentifier(email);
      if (!normalizedEmail || !normalizedEmail.includes('@')) {
        return res.status(400).json({
          ok: false,
          error: 'Invalid email',
          message: 'Email must be a valid email address',
        });
      }

      const existing = await prisma.user.findUnique({
        where: { email: normalizedEmail },
      });
      if (existing && existing.id !== req.userId) {
        return res.status(409).json({
          ok: false,
          error: 'Email already in use',
          message: 'This email is already registered to another account',
        });
      }
    }

    if (accountType !== undefined) {
      const validTypes = ['personal', 'business', 'both'];
      if (!validTypes.includes(accountType)) {
        return res.status(400).json({
          ok: false,
          error: 'Invalid account type',
          message: `Account type must be one of: ${validTypes.join(', ')}`,
        });
      }
    }

    if (profilePhoto !== undefined && profilePhoto !== null && typeof profilePhoto !== 'string') {
      return res.status(400).json({
        ok: false,
        error: 'Invalid profile photo',
        message: 'profilePhoto must be a string URL or null',
      });
    }

    if (profilePhoto !== undefined && typeof profilePhoto === 'string') {
      const trimmed = profilePhoto.trim();
      if (trimmed.length > 0 && !isValidHttpUrl(trimmed)) {
        return res.status(400).json({
          ok: false,
          error: 'Invalid profile photo',
          message: 'profilePhoto must be a valid http(s) URL',
        });
      }
    }

    if (bio !== undefined && bio !== null && typeof bio !== 'string') {
      return res.status(400).json({
        ok: false,
        error: 'Invalid bio',
        message: 'bio must be a string or null',
      });
    }
    if (bio !== undefined && typeof bio === 'string' && bio.length > 500) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid bio',
        message: 'bio must be at most 500 characters',
      });
    }

    if (hasPresenceKey && personalPresenceStoreId !== null && personalPresenceStoreId !== undefined) {
      if (typeof personalPresenceStoreId !== 'string') {
        return res.status(400).json({
          ok: false,
          error: 'Invalid personalPresenceStoreId',
          message: 'personalPresenceStoreId must be a string or null',
        });
      }
      const id = personalPresenceStoreId.trim();
      if (!id) {
        return res.status(400).json({
          ok: false,
          error: 'Invalid personalPresenceStoreId',
          message: 'personalPresenceStoreId cannot be empty',
        });
      }
    }

    const contactStr = (val, label, maxLen = 255) => {
      if (val === null) return { ok: true, v: null };
      if (val === undefined) return { ok: true, v: null };
      if (typeof val !== 'string') {
        return { ok: false, message: `${label} must be a string or null` };
      }
      const t = val.trim();
      if (t.length > maxLen) {
        return { ok: false, message: `${label} must be at most ${maxLen} characters` };
      }
      return { ok: true, v: t.length ? t : null };
    };

    const updateData = {};
    if (displayName !== undefined) {
      updateData.displayName = displayName.trim();
    }
    if (fullName !== undefined) {
      updateData.fullName = fullName.trim() || null;
    }
    if (email !== undefined) {
      updateData.email = normalizeIdentifier(email);
    }
    if (accountType !== undefined) {
      updateData.accountType = accountType;
    }
    if (avatarUrl !== undefined) {
      updateData.avatarUrl = avatarUrl?.trim() || null;
    }
    if (tagline !== undefined) {
      updateData.tagline = tagline?.trim() || null;
    }
    if (profilePhoto !== undefined) {
      if (profilePhoto === null) {
        updateData.profilePhoto = null;
      } else {
        const t = profilePhoto.trim();
        updateData.profilePhoto = t.length ? t : null;
      }
    }
    if (bio !== undefined) {
      updateData.bio = bio === null ? null : bio.trim() || null;
    }

    if (Object.prototype.hasOwnProperty.call(body, 'phone')) {
      const r = contactStr(phone, 'phone', 40);
      if (!r.ok) {
        return res.status(400).json({ ok: false, error: 'Invalid phone', message: r.message });
      }
      updateData.phone = r.v;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'addressLine1')) {
      const r = contactStr(addressLine1, 'addressLine1', 255);
      if (!r.ok) {
        return res.status(400).json({ ok: false, error: 'Invalid address', message: r.message });
      }
      updateData.addressLine1 = r.v;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'addressLine2')) {
      const r = contactStr(addressLine2, 'addressLine2', 255);
      if (!r.ok) {
        return res.status(400).json({ ok: false, error: 'Invalid address', message: r.message });
      }
      updateData.addressLine2 = r.v;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'city')) {
      const r = contactStr(city, 'city', 120);
      if (!r.ok) {
        return res.status(400).json({ ok: false, error: 'Invalid city', message: r.message });
      }
      updateData.city = r.v;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'country')) {
      const r = contactStr(country, 'country', 120);
      if (!r.ok) {
        return res.status(400).json({ ok: false, error: 'Invalid country', message: r.message });
      }
      updateData.country = r.v;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'postcode')) {
      const r = contactStr(postcode, 'postcode', 32);
      if (!r.ok) {
        return res.status(400).json({ ok: false, error: 'Invalid postcode', message: r.message });
      }
      updateData.postcode = r.v;
    }

    if (hasPresenceKey) {
      if (personalPresenceStoreId === null) {
        updateData.personalPresenceStoreId = null;
        updateData.qrCodeUrl = null;
      } else {
        const id = String(personalPresenceStoreId).trim();
        const linkFields = await getPersonalPresenceLinkFields(prisma, req.userId, id);
        if (!linkFields) {
          return res.status(403).json({
            ok: false,
            error: 'Forbidden',
            message: 'You do not own this store or it does not exist',
          });
        }
        Object.assign(updateData, linkFields);
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id: req.userId },
      data: updateData,
      include: {
        businesses: { select: { id: true, name: true } },
        personalPresenceStore: { select: { slug: true } },
      },
    });

    console.log(`[Auth] ✅ Profile updated for user ${req.userId}`);

    res.json({
      ok: true,
      user: buildPatchProfileUserResponse(updatedUser),
    });
  } catch (error) {
    console.error('[Auth] Update profile error:', error);
    next(error);
  }
}

// Test route to verify auth router is accessible
router.get('/test', (req, res) => {
  res.json({ ok: true, message: 'Auth router is working', path: req.path, originalUrl: req.originalUrl });
});

/**
 * POST /api/auth/register
 * Register a new user (delegates to authService; same response shape).
 */
router.post('/register', async (req, res, next) => {
  console.log('[AUTH] Register endpoint hit', {
    method: req.method,
    path: req.path,
    originalUrl: req.originalUrl,
    bodyKeys: req.body ? Object.keys(req.body) : [],
    hasBody: !!req.body
  });
  try {
    const { email, password, fullName, displayName } = req.body ?? {};
    const name = fullName?.trim() || displayName?.trim() || undefined;
    const { user, token } = await registerWithEmailPassword({ email, password, name });

    // When email verification is enabled, send verification email on signup (fire-and-forget; do not block 201)
    const verificationEnabled = process.env.ENABLE_EMAIL_VERIFICATION === 'true' || process.env.ENABLE_EMAIL_VERIFICATION === '1';
    if (verificationEnabled && user?.id && user?.email) {
      const rawToken = generateSecureToken(32);
      const hashedToken = hashVerificationToken(rawToken);
      const expiresAt = new Date(Date.now() + VERIFICATION_EXPIRY_MS);
      await prisma.user.update({
        where: { id: user.id },
        data: { verificationToken: hashedToken, verificationTokenRaw: rawToken, verificationExpires: expiresAt },
      });
      sendVerificationEmail({
        to: user.email,
        rawToken,
        displayName: user.displayName || user.fullName || undefined,
      }).catch((err) => {
        console.error('[Auth] Register verification email send failed', { userId: user.id, error: err?.message });
      });
    }

    res.status(201).json({ ok: true, token, user });
  } catch (error) {
    if (error.code === 'EMAIL_EXISTS') {
      return res.status(409).json({
        ok: false,
        error: 'Email already registered',
        message: 'This email is already registered. Please use a different email or log in.'
      });
    }
    if (error.code === 'MISSING_FIELDS') {
      return res.status(400).json({ ok: false, error: error.message, message: error.message });
    }
    if (error.code === 'PASSWORD_TOO_SHORT') {
      return res.status(400).json({ ok: false, error: error.message, message: error.message });
    }
    console.error('[Auth] Register error:', error);
    next(error);
  }
});

/**
 * POST /api/auth/login
 * Login existing user (delegates to authService; same response shape).
 */
router.post('/login', async (req, res, next) => {
  try {
    console.info('[AUTH] Login request received', {
      method: req.method,
      path: req.path,
      bodyKeys: req.body ? Object.keys(req.body) : [],
    });
    const identifierRaw = (req.body?.username ?? req.body?.email ?? '').toString().trim();
    const { password } = req.body ?? {};
    const { user, token } = await loginWithEmailPassword({
      emailOrUsername: identifierRaw,
      password,
    });
    res.json({
      ok: true,
      token,
      accessToken: token,
      user,
    });
  } catch (error) {
    if (error.code === 'MISSING_FIELDS') {
      return res.status(400).json({
        ok: false,
        error: 'Email/username and password are required',
        message: error.message,
      });
    }
    if (error.code === 'INVALID_CREDENTIALS') {
      return res.status(401).json({
        ok: false,
        error: 'Invalid credentials',
        message: error.message || 'Invalid email or password',
      });
    }
    console.error('[Auth] Login error:', error);
    next(error);
  }
});

/**
 * GET /api/auth/me
 * Get current user info
 * 
 * Headers:
 *   - Authorization: Bearer <token> (required)
 * 
 * Response (200):
 *   - ok: true
 *   - user: User object with stores array
 * 
 * Errors:
 *   - 401: No token provided, invalid token, or expired token
 */
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    // Guest tokens: no DB user; requireAuth already set req.user = { id, role: 'guest' }
    if (req.user?.role === 'guest') {
      return res.json({
        ok: true,
        user: { id: req.user.id, role: 'guest' }
      });
    }

    // DATA ISOLATION: Use only req.userId from JWT (set by requireAuth). Do not use client params.
    // Schema has businesses[], not business; include only minimal fields needed for /me response.
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      include: {
        businesses: { select: { id: true, name: true } },
        personalPresenceStore: { select: { slug: true } },
      },
    });
    
    if (!user) {
      // This should rarely happen since requireAuth validates the user exists
      // But if it does, return 401 (not 404) since it's an auth issue
      return res.status(401).json({ 
        ok: false,
        error: 'User not found',
        message: 'Authentication failed. Please log in again.'
      });
    }
    
    // User is already attached by requireAuth middleware
    const { passwordHash: _, personalPresenceStore, ...userWithoutPassword } = user;
    
    // Parse JSON fields for response
    const userResponse = {
      ...userWithoutPassword,
      roles: JSON.parse(userWithoutPassword.roles || '["viewer"]'),
      onboarding: userWithoutPassword.onboarding ? JSON.parse(userWithoutPassword.onboarding) : null,
      // Include stores array from businesses relation (schema: businesses Business[])
      stores: user.businesses || [],
      // Compute hasStore boolean
      hasStore: Array.isArray(user.businesses) && user.businesses.length > 0,
      // Ensure handle, displayName, tagline, avatarUrl are included
      handle: user.handle,
      displayName: jsonNullIfUnset(user.displayName),
      tagline: user.tagline,
      avatarUrl: user.avatarUrl,
      profilePhoto: jsonNullIfUnset(user.profilePhoto),
      bio: jsonNullIfUnset(user.bio),
      qrCodeUrl: jsonNullIfUnset(user.qrCodeUrl),
      personalPresenceStoreId: user.personalPresenceStoreId ?? null,
      personalPresenceStoreSlug: personalPresenceStore?.slug ?? null,
      phone: jsonNullIfUnset(user.phone),
      addressLine1: jsonNullIfUnset(user.addressLine1),
      addressLine2: jsonNullIfUnset(user.addressLine2),
      city: jsonNullIfUnset(user.city),
      country: jsonNullIfUnset(user.country),
      postcode: jsonNullIfUnset(user.postcode),
      // Email verification status (additive; does not change existing response shape)
      emailVerified: user.emailVerified ?? false,
      // When true, frontend should gate "Publish store" until user verifies email
      emailVerificationRequired: process.env.ENABLE_EMAIL_VERIFICATION === 'true' || process.env.ENABLE_EMAIL_VERIFICATION === '1',
      // Only when verification gate is on: allow "Publish anyway" in UI (e.g. dev). Prod: do not set CARD_BEY_ALLOW_UNVERIFIED_PUBLISH.
      allowUnverifiedPublish: (process.env.ENABLE_EMAIL_VERIFICATION === 'true' || process.env.ENABLE_EMAIL_VERIFICATION === '1') &&
        (process.env.CARD_BEY_ALLOW_UNVERIFIED_PUBLISH === 'true' || process.env.CARD_BEY_ALLOW_UNVERIFIED_PUBLISH === '1'),
    };
    
    res.json({
      ok: true,
      user: userResponse
    });
  } catch (error) {
    console.error('[Auth] Get me error:', error);
    next(error);
  }
});

/**
 * GET /api/profile
 * Get current user profile (alias of /api/auth/me)
 * 
 * Headers:
 *   - Authorization: Bearer <token> (required)
 * 
 * Response (200):
 *   - ok: true
 *   - user: User object with stores array
 * 
 * Errors:
 *   - 401: No token provided, invalid token, or expired token
 */
router.get('/profile', requireAuth, async (req, res, next) => {
  try {
    // Fetch user with businesses relation (schema: businesses Business[])
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      include: {
        businesses: { select: { id: true, name: true } },
        personalPresenceStore: { select: { slug: true } },
      },
    });
    
    if (!user) {
      return res.status(401).json({ 
        ok: false,
        error: 'User not found',
        message: 'Authentication failed. Please log in again.'
      });
    }
    
    const { passwordHash: _, personalPresenceStore, ...userWithoutPassword } = user;
    
    const userResponse = {
      ...userWithoutPassword,
      roles: JSON.parse(userWithoutPassword.roles || '["viewer"]'),
      onboarding: userWithoutPassword.onboarding ? JSON.parse(userWithoutPassword.onboarding) : null,
      stores: user.businesses || [],
      hasStore: Array.isArray(user.businesses) && user.businesses.length > 0,
      // Ensure handle, displayName, tagline, avatarUrl are included
      handle: user.handle,
      displayName: jsonNullIfUnset(user.displayName),
      tagline: user.tagline,
      avatarUrl: user.avatarUrl,
      profilePhoto: jsonNullIfUnset(user.profilePhoto),
      bio: jsonNullIfUnset(user.bio),
      qrCodeUrl: jsonNullIfUnset(user.qrCodeUrl),
      personalPresenceStoreId: user.personalPresenceStoreId ?? null,
      personalPresenceStoreSlug: personalPresenceStore?.slug ?? null,
      phone: jsonNullIfUnset(user.phone),
      addressLine1: jsonNullIfUnset(user.addressLine1),
      addressLine2: jsonNullIfUnset(user.addressLine2),
      city: jsonNullIfUnset(user.city),
      country: jsonNullIfUnset(user.country),
      postcode: jsonNullIfUnset(user.postcode),
      // Email verification status (additive)
      emailVerified: user.emailVerified ?? false,
      emailVerificationRequired: process.env.ENABLE_EMAIL_VERIFICATION === 'true' || process.env.ENABLE_EMAIL_VERIFICATION === '1',
      allowUnverifiedPublish: (process.env.ENABLE_EMAIL_VERIFICATION === 'true' || process.env.ENABLE_EMAIL_VERIFICATION === '1') &&
        (process.env.CARD_BEY_ALLOW_UNVERIFIED_PUBLISH === 'true' || process.env.CARD_BEY_ALLOW_UNVERIFIED_PUBLISH === '1'),
    };
    
    res.json({
      ok: true,
      user: userResponse
    });
  } catch (error) {
    console.error('[Auth] Get profile error:', error);
    next(error);
  }
});

/**
 * PATCH /api/profile
 * Update user profile (name, email, personal profile fields)
 * 
 * Headers:
 *   - Authorization: Bearer <token> (required)
 * 
 * Request body:
 *   - displayName?: string (max 100 chars)
 *   - profilePhoto?: string | null (http(s) URL)
 *   - bio?: string | null (max 500 chars)
 *   - personalPresenceStoreId?: string | null (must be a Business/store owned by the user; sets server-generated qrCodeUrl)
 *   - qrCodeUrl: ignored if sent (server-only)
 *   - email?: string (if email updates are allowed)
 * 
 * Response (200):
 *   - ok: true
 *   - user: Updated User object
 * 
 * Errors:
 *   - 400: Invalid input
 *   - 401: Not authenticated
 *   - 409: Email already in use (if updating email)
 */
router.patch('/profile', requireAuth, patchCurrentUserProfile);

/**
 * GET /api/auth/profile/media — list current user's personal media (images/videos).
 */
router.get('/profile/media', requireAuth, async (req, res, next) => {
  try {
    if (req.user?.role === 'guest') {
      return res.status(401).json({ ok: false, error: 'unauthorized', message: 'Authentication required.' });
    }
    const media = await prisma.personalMedia.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ ok: true, media });
  } catch (error) {
    console.error('[Auth] GET profile/media error:', error);
    next(error);
  }
});

/**
 * POST /api/auth/profile/media — register an uploaded asset URL after POST /api/uploads/create.
 * Body: { url: string, type: "image" | "video" }
 */
router.post('/profile/media', requireAuth, async (req, res, next) => {
  try {
    if (req.user?.role === 'guest') {
      return res.status(401).json({ ok: false, error: 'unauthorized', message: 'Authentication required.' });
    }
    const { url, type } = req.body ?? {};
    if (!url || typeof url !== 'string' || !url.trim()) {
      return res.status(400).json({ ok: false, error: 'invalid_url', message: 'url is required' });
    }
    const trimmed = url.trim();
    if (!isValidHttpUrl(trimmed)) {
      return res.status(400).json({ ok: false, error: 'invalid_url', message: 'url must be a valid http(s) URL' });
    }
    const t = type === 'video' ? 'video' : type === 'image' ? 'image' : null;
    if (!t) {
      return res.status(400).json({
        ok: false,
        error: 'invalid_type',
        message: 'type must be "image" or "video"',
      });
    }
    const row = await prisma.personalMedia.create({
      data: { userId: req.userId, url: trimmed, type: t },
    });
    res.status(201).json({ ok: true, media: row });
  } catch (error) {
    console.error('[Auth] POST profile/media error:', error);
    next(error);
  }
});

/**
 * DELETE /api/auth/profile/media/:id — remove a personal media row (does not delete remote file).
 */
router.delete('/profile/media/:id', requireAuth, async (req, res, next) => {
  try {
    if (req.user?.role === 'guest') {
      return res.status(401).json({ ok: false, error: 'unauthorized', message: 'Authentication required.' });
    }
    const { id } = req.params;
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ ok: false, error: 'invalid_id', message: 'Invalid id' });
    }
    const existing = await prisma.personalMedia.findFirst({
      where: { id, userId: req.userId },
    });
    if (!existing) {
      return res.status(404).json({ ok: false, error: 'not_found', message: 'Media not found' });
    }
    await prisma.personalMedia.delete({ where: { id } });
    res.json({ ok: true });
  } catch (error) {
    console.error('[Auth] DELETE profile/media error:', error);
    next(error);
  }
});

/**
 * Generate a secure random token (32 bytes = 64 hex chars)
 * Uses crypto.randomBytes for cryptographically secure randomness
 */
function generateSecureToken(length = 32) {
  return crypto.randomBytes(length).toString('hex');
}

/** Hash a token for storage (compare with stored hash on confirm) */
function hashVerificationToken(token) {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

const VERIFICATION_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes

/** Default API origin for verification links when env is unset or invalid */
const VERIFICATION_LINK_FALLBACK_ORIGIN = 'http://localhost:3001';

/** Temporary path segments that must not appear in verification link base (e.g. short-link or dev paths) */
const INVALID_BASE_PATH_PATTERNS = ['/q/', '/go/'];

/**
 * Canonical base URL for email verification links. Must be the API origin (no frontend or short-link URLs).
 * Normalizes trailing slashes and rejects bases containing temporary path segments like /q/ or /go/.
 * EMAIL_VERIFICATION_API_ORIGIN overrides PUBLIC_API_BASE_URL so links work when the latter is a LAN IP
 * the mail recipient cannot reach (e.g. open email on same PC → use http://localhost:3001).
 * @returns {{ base: string, isFallback: boolean }} Origin with no trailing slash; isFallback true when using localhost default.
 */
function getVerificationLinkBaseUrl() {
  const override = (process.env.EMAIL_VERIFICATION_API_ORIGIN || '').trim().replace(/\/+$/, '');
  if (override) {
    const bad = INVALID_BASE_PATH_PATTERNS.some((p) => override.includes(p));
    if (!bad) {
      if (process.env.NODE_ENV !== 'production') {
        console.log('[Auth] Verification links use EMAIL_VERIFICATION_API_ORIGIN', { base: override });
      }
      return { base: override, isFallback: false };
    }
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[Auth] EMAIL_VERIFICATION_API_ORIGIN ignored (invalid path segment)', { value: override });
    }
  }

  const raw = (process.env.PUBLIC_API_BASE_URL || process.env.PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
  if (!raw) return { base: VERIFICATION_LINK_FALLBACK_ORIGIN, isFallback: true };
  const hasInvalidPath = INVALID_BASE_PATH_PATTERNS.some((p) => raw.includes(p));
  if (hasInvalidPath) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[Auth] Verification link base URL rejected (contains temporary path segment like /q/ or /go/)', { value: raw });
    }
    return { base: VERIFICATION_LINK_FALLBACK_ORIGIN, isFallback: true };
  }
  if (
    process.env.NODE_ENV !== 'production' &&
    !process.env.EMAIL_VERIFICATION_API_ORIGIN &&
    /^https?:\/\/(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(raw)
  ) {
    console.warn(
      '[Auth] Verification emails use PUBLIC_API_BASE_URL with a private LAN IP. If the link fails in the browser, set EMAIL_VERIFICATION_API_ORIGIN=http://localhost:3001 (same machine) or your reachable public API URL.'
    );
  }
  return { base: raw, isFallback: false };
}

/**
 * Absolute origin for post-verification browser redirects (SPA).
 * Never emit a relative Location header — clients resolve it against the API host and users land on the wrong origin.
 * Dev fallback matches password-reset link default.
 */
function resolvePublicWebBaseForBrowserRedirect() {
  const webBase = (process.env.PUBLIC_WEB_BASE_URL || process.env.FRONTEND_URL || process.env.PUBLIC_BASE_URL || '').trim().replace(/\/$/, '');
  if (webBase) return webBase;
  if (process.env.NODE_ENV !== 'production') {
    return 'http://localhost:5174';
  }
  return '';
}

/** Shared success response after email is verified (redirect to SPA or JSON). */
function respondAfterEmailVerified(res, redirect_uri) {
  const safeRedirect = redirect_uri && typeof redirect_uri === 'string' && redirect_uri.startsWith('/') && !redirect_uri.startsWith('//');
  if (safeRedirect) {
    const webBase = resolvePublicWebBaseForBrowserRedirect();
    if (webBase) {
      return res.redirect(302, `${webBase}${redirect_uri}`);
    }
    if (process.env.NODE_ENV === 'production') {
      console.error('[Auth] verify: set PUBLIC_WEB_BASE_URL or FRONTEND_URL for post-verify browser redirect');
    }
    return res.json({
      ok: true,
      verified: true,
      message: 'Email verified. Open the app in your browser to continue.',
    });
  }
  return res.json({ ok: true, verified: true });
}

/**
 * True when verification email can be sent: ENABLE_EMAIL_VERIFICATION, MAIL_HOST set, and in production a non-fallback base URL.
 * Used to return 503 EMAIL_NOT_CONFIGURED instead of 200 when no email will be sent.
 */
function isVerificationEmailConfigured() {
  const enabled = process.env.ENABLE_EMAIL_VERIFICATION === 'true' || process.env.ENABLE_EMAIL_VERIFICATION === '1';
  const hasMailHost = (process.env.MAIL_HOST || '').trim().length > 0;
  if (!enabled || !hasMailHost) return false;
  const { isFallback } = getVerificationLinkBaseUrl();
  if (process.env.NODE_ENV === 'production' && isFallback) return false;
  return true;
}

/**
 * Send verification email. When configured, awaits sendMail and returns { sent, code?, error? }.
 * Never logs raw token. Used by handleRequestVerification (await) and register (fire-and-forget).
 * @returns {Promise<{ sent: boolean, code?: string, error?: string }>}
 */
async function sendVerificationEmail({ to, rawToken, displayName }) {
  const { base: apiBase, isFallback } = getVerificationLinkBaseUrl();
  const redirectUri = '/onboarding/business?verified=1';
  const confirmPath = '/api/auth/verify/confirm';
  const query = new URLSearchParams({
    token: rawToken,
    redirect_uri: redirectUri
  });
  const fullLink = `${apiBase}${confirmPath}?${query.toString()}`;

  const enabled = process.env.ENABLE_EMAIL_VERIFICATION === 'true' || process.env.ENABLE_EMAIL_VERIFICATION === '1';
  const hasMailHost = (process.env.MAIL_HOST || '').trim().length > 0;

  if (!enabled || !hasMailHost) {
    return { sent: false, code: 'EMAIL_NOT_CONFIGURED', error: 'Email provider not configured' };
  }

  if (process.env.NODE_ENV === 'production' && isFallback) {
    return { sent: false, code: 'EMAIL_NOT_CONFIGURED', error: 'Verification link base URL not set for production' };
  }

  const { subject, html } = getVerifyEmailContent({ verifyLink: fullLink, displayName: displayName || undefined });
  const result = await sendMail({ to, subject, html });

  if (result.ok) {
    return { sent: true };
  }
  if (result.skipped) {
    return { sent: false, code: 'EMAIL_NOT_CONFIGURED', error: result.error || 'Mail skipped' };
  }
  return { sent: false, code: 'EMAIL_SEND_FAILED', error: result.error || 'Send failed' };
}

/**
 * Shared handler: request email verification (requireAuth, store hashed token, send email).
 * Used by POST /api/auth/verify/request and POST /api/auth/request-verification.
 * Returns 503 with EMAIL_NOT_CONFIGURED or EMAIL_SEND_FAILED when email cannot be sent.
 */
async function handleRequestVerification(req, res, next) {
  try {
    res.setHeader('X-Verify-Handler', 'honest-status');
    console.log('[Auth] verify/request received', { userId: req.user?.id ?? null });

    if (req.user?.role === 'guest') {
      return res.status(401).json({
        ok: false,
        error: 'unauthorized',
        message: 'Guest users cannot request email verification.'
      });
    }
    const user = req.user;
    if (!user || !user.id) {
      return res.status(401).json({
        ok: false,
        error: 'unauthorized',
        message: 'Authentication required.'
      });
    }

    console.log('[Auth] verify/request user resolved', { userId: user.id, email: user.email ? `${user.email.slice(0, 3)}***` : null });

    if (user.emailVerified) {
      return res.status(400).json({
        ok: false,
        error: 'Email already verified',
        message: 'This email is already verified'
      });
    }

    const configOk = isVerificationEmailConfigured();
    const verificationEnabled =
      process.env.ENABLE_EMAIL_VERIFICATION === 'true' || process.env.ENABLE_EMAIL_VERIFICATION === '1';
    console.log('[Auth] verify/request config validation', { configOk });
    // Vitest: when gate is off, still mint a token so API tests don't require MAIL_* (no email sent).
    if (!configOk && process.env.NODE_ENV === 'test' && !verificationEnabled) {
      const rawToken = generateSecureToken(32);
      const hashedToken = hashVerificationToken(rawToken);
      const expiresAt = new Date(Date.now() + VERIFICATION_EXPIRY_MS);
      await prisma.user.update({
        where: { id: user.id },
        data: {
          verificationToken: hashedToken,
          verificationTokenRaw: rawToken,
          verificationExpires: expiresAt,
        },
      });
      return res.json({ ok: true, token: rawToken });
    }
    if (!configOk) {
      return res.status(503).json({
        ok: false,
        code: 'EMAIL_NOT_CONFIGURED',
        message: 'Email verification is not configured. Please set ENABLE_EMAIL_VERIFICATION, MAIL_HOST, and in production PUBLIC_API_BASE_URL.'
      });
    }

    const now = Date.now();
    if (process.env.NODE_ENV !== 'test') {
      const lastSend = lastVerificationSendByUser.get(user.id);
      if (lastSend != null && (now - lastSend) < verificationSendCooldownMs) {
        const retryAfter = Math.ceil((verificationSendCooldownMs - (now - lastSend)) / 1000);
        res.setHeader('Retry-After', retryAfter);
        console.log('[Auth] verify/request rate limited (cooldown)', { userId: user.id, retryAfter });
        return res.status(429).json({
          ok: false,
          code: 'RATE_LIMITED',
          message: `Please wait ${retryAfter} seconds before requesting another verification email.`,
          retryAfter,
        });
      }
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { verificationToken: true, verificationExpires: true, verificationTokenRaw: true },
    });
    const hasValidToken = dbUser?.verificationToken != null &&
      dbUser?.verificationExpires != null &&
      new Date(dbUser.verificationExpires) > new Date();

    if (hasValidToken && (dbUser?.verificationTokenRaw ?? '').trim().length > 0) {
      const rawToken = dbUser.verificationTokenRaw;
      console.log('[Auth] verify/request token reused, resend attempt', { userId: user.id });
      const sendResult = await sendVerificationEmail({
        to: user.email,
        rawToken,
        displayName: user.displayName || user.fullName || undefined
      });
      if (!sendResult.sent) {
        console.error('[Auth] verify/request resend failed', { userId: user.id, code: sendResult.code, error: sendResult.error });
        return res.status(503).json({
          ok: false,
          code: sendResult.code || 'EMAIL_SEND_FAILED',
          message: sendResult.error || 'Failed to send verification email. Please try again later.'
        });
      }
      console.log('[Auth] verify/request resend success', { userId: user.id });
      lastVerificationSendByUser.set(user.id, Date.now());
      return res.json({ ok: true, resent: true, reusedToken: true });
    }

    const rawToken = generateSecureToken(32);
    const hashedToken = hashVerificationToken(rawToken);
    const expiresAt = new Date(Date.now() + VERIFICATION_EXPIRY_MS);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        verificationToken: hashedToken,
        verificationTokenRaw: rawToken,
        verificationExpires: expiresAt
      }
    });

    console.log('[Auth] verify/request token created', { userId: user.id, expiresAt: expiresAt.toISOString() });

    const sendResult = await sendVerificationEmail({
      to: user.email,
      rawToken,
      displayName: user.displayName || user.fullName || undefined
    });

    if (!sendResult.sent) {
      console.error('[Auth] verify/request provider send failed', { userId: user.id, code: sendResult.code, error: sendResult.error });
      return res.status(503).json({
        ok: false,
        code: sendResult.code || 'EMAIL_SEND_FAILED',
        message: sendResult.error || 'Failed to send verification email. Please try again later.'
      });
    }

    console.log('[Auth] verify/request provider send success', { userId: user.id });
    lastVerificationSendByUser.set(user.id, Date.now());

    res.json({
      ok: true,
      ...(process.env.NODE_ENV !== 'production' && { token: rawToken })
    });
  } catch (error) {
    console.error('[Auth] Request verification error:', error?.message ?? error);
    next(error);
  }
}

/** GET /api/auth/verify/status - deploy verification: returns whether email is configured (no auth) */
router.get('/verify/status', (req, res) => {
  const configured = isVerificationEmailConfigured();
  res.json({
    ok: true,
    emailConfigured: configured,
    handlerVersion: 'honest-status',
  });
});

/** POST /api/auth/verify/request (requireAuth) - 60s cooldown, 3/15min per user, 10/hour per IP */
router.post('/verify/request', requireAuth, verificationRequestLimiter, verificationRequestLimiterIP, handleRequestVerification);

/** POST /api/auth/request-verification - legacy path, same behavior */
router.post('/request-verification', requireAuth, verificationRequestLimiter, verificationRequestLimiterIP, handleRequestVerification);

/**
 * Find user by verification token hash only (any expiry). Used to distinguish TOKEN_INVALID vs TOKEN_EXPIRED vs TOKEN_ALREADY_USED.
 */
async function findUserByVerificationTokenHash(hashed) {
  if (!hashed || typeof hashed !== 'string') return null;
  return prisma.user.findFirst({ where: { verificationToken: hashed } });
}

/**
 * Shared: validate token by hash (must be non-expired). In non-production only, also allow plain token match (backward compat).
 */
async function findUserByVerificationToken(token) {
  if (!token || typeof token !== 'string') return null;
  const hashed = hashVerificationToken(token);
  const now = new Date();
  const where = {
    verificationExpires: { gt: now },
    ...(process.env.NODE_ENV === 'production'
      ? { verificationToken: hashed }
      : { OR: [{ verificationToken: hashed }, { verificationToken: token }] }),
  };
  const user = await prisma.user.findFirst({ where });
  return user;
}

/**
 * GET /api/auth/verify/confirm?token=...
 * Validate token, atomically consume (set emailVerified, clear token), then redirect or return JSON.
 * Stable codes: TOKEN_INVALID, TOKEN_EXPIRED, TOKEN_ALREADY_USED.
 */
router.get('/verify/confirm', async (req, res, next) => {
  try {
    const { token, redirect_uri } = req.query;

    if (!token || typeof token !== 'string') {
      return res.status(400).json({
        ok: false,
        code: 'TOKEN_INVALID',
        error: 'Token required',
        message: 'Verification token is required'
      });
    }

    const hashed = hashVerificationToken(token);
    const now = new Date();
    const user = await findUserByVerificationTokenHash(hashed);
    if (!user) {
      console.log('[Auth] verify/confirm invalid', { reason: 'no_user_for_hash' });
      return res.status(400).json({
        ok: false,
        code: 'TOKEN_INVALID',
        error: 'Invalid token',
        message: 'This verification token is invalid. Please request a new one.'
      });
    }
    // Same link again after success (hash kept for idempotency). Avoid TOKEN_INVALID when token was cleared in older deployments.
    if (user.emailVerified) {
      console.log('[Auth] verify/confirm idempotent (already verified)', { userId: user.id });
      return respondAfterEmailVerified(res, redirect_uri);
    }
    if (user.verificationExpires == null || new Date(user.verificationExpires) <= now) {
      console.log('[Auth] verify/confirm expired', { userId: user.id });
      return res.status(400).json({
        ok: false,
        code: 'TOKEN_EXPIRED',
        error: 'Token expired',
        message: 'This verification token has expired. Please request a new one.'
      });
    }

    const result = await prisma.user.updateMany({
      where: {
        id: user.id,
        verificationToken: hashed,
        verificationExpires: { gt: now },
        emailVerified: false,
      },
      data: {
        emailVerified: true,
        // Keep hash so repeat clicks / scanners do not yield TOKEN_INVALID; raw + expiry cleared.
        verificationTokenRaw: null,
        verificationExpires: null,
      },
    });

    if (result.count === 0) {
      const fresh = await prisma.user.findUnique({
        where: { id: user.id },
        select: { emailVerified: true },
      });
      if (fresh?.emailVerified) {
        console.log('[Auth] verify/confirm idempotent (already verified, e.g. race)', { userId: user.id });
        return respondAfterEmailVerified(res, redirect_uri);
      }
      console.log('[Auth] verify/confirm already used (race)', { userId: user.id });
      return res.status(400).json({
        ok: false,
        code: 'TOKEN_ALREADY_USED',
        error: 'Email already verified',
        message: 'This email is already verified.'
      });
    }

    console.log('[Auth] verify/confirm success', { userId: user.id });

    return respondAfterEmailVerified(res, redirect_uri);
  } catch (error) {
    console.error('[Auth] Verify confirm error:', error?.message ?? error);
    next(error);
  }
});

/**
 * GET /api/auth/verify?token=...
 * Verify email with token (same validation as /verify/confirm; JSON only). Stable codes: TOKEN_INVALID, TOKEN_EXPIRED, TOKEN_ALREADY_USED.
 */
router.get('/verify', async (req, res, next) => {
  try {
    const { token } = req.query;

    if (!token || typeof token !== 'string') {
      return res.status(400).json({
        ok: false,
        code: 'TOKEN_INVALID',
        error: 'Token required',
        message: 'Verification token is required'
      });
    }

    const hashed = hashVerificationToken(token);
    const now = new Date();
    const user = await findUserByVerificationTokenHash(hashed);
    if (!user) {
      return res.status(400).json({
        ok: false,
        code: 'TOKEN_INVALID',
        error: 'Invalid token',
        message: 'This verification token is invalid. Please request a new one.'
      });
    }
    if (user.emailVerified) {
      console.log('[Auth] verify idempotent (already verified)', { userId: user.id, email: user.email });
      return res.json({ ok: true, message: 'Email verified successfully' });
    }
    if (user.verificationExpires == null || new Date(user.verificationExpires) <= now) {
      return res.status(400).json({
        ok: false,
        code: 'TOKEN_EXPIRED',
        error: 'Token expired',
        message: 'This verification token has expired. Please request a new one.'
      });
    }

    const result = await prisma.user.updateMany({
      where: {
        id: user.id,
        verificationToken: hashed,
        verificationExpires: { gt: now },
        emailVerified: false,
      },
      data: {
        emailVerified: true,
        verificationTokenRaw: null,
        verificationExpires: null,
      },
    });
    if (result.count === 0) {
      const fresh = await prisma.user.findUnique({
        where: { id: user.id },
        select: { emailVerified: true },
      });
      if (fresh?.emailVerified) {
        console.log('[Auth] Email verified (idempotent, e.g. race)', { userId: user.id, email: user.email });
        return res.json({ ok: true, message: 'Email verified successfully' });
      }
      return res.status(400).json({
        ok: false,
        code: 'TOKEN_ALREADY_USED',
        error: 'Email already verified',
        message: 'This email is already verified.'
      });
    }

    console.log('[Auth] Email verified', { userId: user.id, email: user.email });

    res.json({ ok: true, message: 'Email verified successfully' });
  } catch (error) {
    console.error('[Auth] Verify error:', error);
    next(error);
  }
});

/**
 * POST /api/auth/request-reset
 * Request password reset token; sends reset email when MAIL_* is configured.
 * Rate limited per IP. Always returns generic success to prevent email enumeration.
 */
router.post('/request-reset', passwordResetRequestLimiter, async (req, res, next) => {
  try {
    const { email } = req.body ?? {};

    if (!email || typeof email !== 'string') {
      return res.status(400).json({
        ok: false,
        error: 'Email required',
        message: 'Email is required'
      });
    }

    const normalizedEmail = normalizeIdentifier(email);

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail }
    });

    if (user) {
      const token = generateSecureToken(32);
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

      await prisma.user.update({
        where: { id: user.id },
        data: {
          resetToken: token,
          resetExpires: expiresAt
        }
      });

      const webBase = process.env.PUBLIC_WEB_BASE_URL || process.env.FRONTEND_URL || process.env.PUBLIC_BASE_URL || 'http://localhost:5174';
      const resetPath = '/reset';
      const resetLink = `${webBase.replace(/\/$/, '')}${resetPath}?token=${encodeURIComponent(token)}`;

      const hasMail = (process.env.MAIL_HOST || '').trim().length > 0;
      if (hasMail) {
        const { subject, html } = getResetPasswordContent({
          resetLink,
          displayName: user.displayName || user.fullName || undefined
        });
        sendMail({ to: user.email, subject, html }).then((result) => {
          if (result.ok) {
            if (process.env.NODE_ENV !== 'production') console.log('[Auth] Password reset email sent', { to: user.email });
          } else if (!result.skipped) {
            console.error('[Auth] Password reset email failed', { to: user.email, error: result.error });
          }
        }).catch((err) => console.error('[Auth] Password reset email error', { to: user.email, error: err?.message }));
      }

      if (process.env.NODE_ENV !== 'production') {
        console.log('[Auth] Password reset token generated', { userId: user.id, email: user.email, expiresAt: expiresAt.toISOString() });
        if (!hasMail) console.log('[Auth] Reset link (no MAIL_HOST):', resetLink);
      }
    }

    res.json({
      ok: true,
      message: 'If an account exists with this email, a password reset link has been sent.'
    });
  } catch (error) {
    console.error('[Auth] Request reset error:', error);
    next(error);
  }
});

/**
 * POST /api/auth/reset
 * Reset password with token
 * 
 * Request body:
 *   - token: string (required) - Reset token
 *   - password: string (required, min 6 chars) - New password
 * 
 * Response (200):
 *   - ok: true
 *   - message: "Password reset successfully"
 * 
 * Errors:
 *   - 400: Invalid or expired token
 *   - 400: Password too short
 */
router.post('/reset', async (req, res, next) => {
  try {
    const { token, password } = req.body ?? {};

    if (!token || typeof token !== 'string') {
      return res.status(400).json({
        ok: false,
        error: 'Token required',
        message: 'Reset token is required'
      });
    }

    if (!password || typeof password !== 'string') {
      return res.status(400).json({
        ok: false,
        error: 'Password required',
        message: 'New password is required'
      });
    }

    const minLen = 8;
    if (password.length < minLen) {
      return res.status(400).json({
        ok: false,
        error: 'Password too short',
        message: `Password must be at least ${minLen} characters`
      });
    }

    // Find user by reset token
    const user = await prisma.user.findFirst({
      where: {
        resetToken: token,
        resetExpires: {
          gt: new Date() // Token not expired
        }
      }
    });

    if (!user) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid or expired token',
        message: 'This reset token is invalid or has expired. Please request a new one.'
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(password, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: hashedPassword,
        resetToken: null,
        resetExpires: null
      }
    });

    console.log('[Auth] Password reset successful', { userId: user.id, email: user.email });

    const fullUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true },
    });
    const authToken = fullUser ? generateToken(fullUser.id) : null;

    res.json({
      ok: true,
      message: 'Password reset successfully. You can now log in with your new password.',
      ...(authToken && { token: authToken })
    });
  } catch (error) {
    console.error('[Auth] Reset error:', error);
    next(error);
  }
});

function envTrue(v) { return String(v || '').toLowerCase() === 'true' || v === '1'; }

/** Rate limit: 5/min per IP for guest auth */
const guestAuthLimiter = (req, res, next) => {
  if (process.env.NODE_ENV === 'test') return next();
  const max = parseInt(process.env.GUEST_RATE_LIMIT_PER_MIN || '5', 10) || 5;
  return rateLimit({ windowMs: 60 * 1000, max, keyGenerator: (r) => `guest:${r.ip || 'unknown'}` })(req, res, next);
};

/**
 * POST /api/auth/guest
 * Create a minimal guest session (no account, no DB user). JWT payload: { userId, role: 'guest', auth: 'guest' }.
 * - Dev/test: always allowed.
 * - Production: only if GUEST_AUTH_ENABLED, ENABLE_GUEST_AUTH, or ALLOW_GUEST_AUTH is true/1, otherwise 410.
 *
 * Response (200): { ok: true, token, user: { id, role: 'guest' } }
 */
router.post('/guest', guestAuthLimiter, (req, res, next) => {
  try {
    const guestEnabled =
      envTrue(process.env.GUEST_AUTH_ENABLED) ||
      envTrue(process.env.ENABLE_GUEST_AUTH) ||
      envTrue(process.env.ALLOW_GUEST_AUTH);
    console.log('[guest] enabled=', guestEnabled, 'GUEST_AUTH_ENABLED=', process.env.GUEST_AUTH_ENABLED);
    if (process.env.NODE_ENV === 'production' && !guestEnabled) {
      return res.status(410).json({
        ok: false,
        error: 'guest_disabled',
        message: 'Guest auth is not enabled in this environment.',
      });
    }
    const { token, userId } = generateGuestToken();
    res.json({
      ok: true,
      token,
      user: { id: userId, role: 'guest' },
    });
  } catch (error) {
    console.error('[Auth] Guest token error:', error);
    next(error);
  }
});

export default router;

