/**
 * Reusable auth service: register, login, getMe.
 * Used by /api/auth/* and by mobile compat routes. Does not change token format or existing behavior.
 */

import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { generateToken } from '../../middleware/auth.js';
import { generateHandle, generateUniqueHandle } from '../../utils/generateHandle.js';

const prisma = new PrismaClient();

function normalizeIdentifier(value) {
  if (!value) return '';
  return value.toString().trim().toLowerCase();
}

/** Sanitize user for response (no passwordHash, parsed JSON fields) */
function toUserResponse(user) {
  if (!user) return null;
  const { passwordHash: _, ...rest } = user;
  return {
    ...rest,
    roles: typeof rest.roles === 'string' ? JSON.parse(rest.roles || '["viewer"]') : rest.roles,
    onboarding: rest.onboarding ? (typeof rest.onboarding === 'string' ? JSON.parse(rest.onboarding) : rest.onboarding) : null,
  };
}

/**
 * Register with email and password.
 * Role is never accepted from caller; new users get default role/roles only (no privilege escalation).
 * @param {{ email: string, password: string, name?: string }} params
 * @returns {{ user: object, token: string }}
 * @throws Error with .code 'MISSING_FIELDS' | 'PASSWORD_TOO_SHORT' | 'EMAIL_EXISTS'
 */
export async function registerWithEmailPassword({ email, password, name }) {
  if (!email || !password) {
    const err = new Error('Email and password are required');
    err.code = 'MISSING_FIELDS';
    throw err;
  }
  if (password.length < 6) {
    const err = new Error('Password must be at least 6 characters');
    err.code = 'PASSWORD_TOO_SHORT';
    throw err;
  }
  const normalizedEmail = normalizeIdentifier(email);
  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    const err = new Error('Email already registered');
    err.code = 'EMAIL_EXISTS';
    throw err;
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const userDisplayName = (name && name.trim()) || normalizedEmail.split('@')[0] || normalizedEmail;
  const baseHandleInput = name || userDisplayName || normalizedEmail;
  const baseHandle = generateHandle(baseHandleInput);
  let uniqueHandle = null;
  if (baseHandle) {
    uniqueHandle = await generateUniqueHandle(baseHandle, async (handle) => {
      const u = await prisma.user.findUnique({ where: { handle } });
      return u !== null;
    });
  }
  if (!uniqueHandle) {
    uniqueHandle = `${(normalizedEmail.split('@')[0] || 'user')}-${Date.now()}`;
  }

  const user = await prisma.user.create({
    data: {
      email: normalizedEmail,
      passwordHash: hashedPassword,
      displayName: userDisplayName,
      handle: uniqueHandle,
      roles: JSON.stringify(['viewer']),
      hasBusiness: false,
      onboarding: JSON.stringify({
        completed: false,
        currentStep: 'welcome',
        steps: { welcome: false, profile: false, business: false },
      }),
    },
  });

  const { grantWelcomeBundleOnRegister } = await import('../billing/creditsService.js');
  await grantWelcomeBundleOnRegister(user.id).catch((err) => {
    console.warn('[Auth] grantWelcomeBundleOnRegister failed (non-fatal):', err?.message || err);
  });

  const token = generateToken(user.id);
  return { user: toUserResponse(user), token };
}

/**
 * Login with email or username and password.
 * Role is never accepted from caller; user (including role) is always loaded from DB.
 * @param {{ emailOrUsername: string, password: string }} params
 * @returns {{ user: object, token: string }}
 * @throws Error with .code 'MISSING_FIELDS' | 'INVALID_CREDENTIALS'
 */
export async function loginWithEmailPassword({ emailOrUsername, password }) {
  if (!emailOrUsername || !password) {
    const err = new Error('Email/username and password are required');
    err.code = 'MISSING_FIELDS';
    throw err;
  }
  const normalized = normalizeIdentifier(emailOrUsername);
  // Login: minimal scalar fields only; do not include relations (schema has businesses[], not business).
  const loginSelect = {
    id: true,
    email: true,
    handle: true,
    displayName: true,
    passwordHash: true,
    role: true,
    roles: true,
    onboarding: true,
  };
  let user = await prisma.user.findFirst({
    where: {
      OR: [
        { email: normalized },
        { handle: normalized },
      ],
    },
    select: loginSelect,
  });

  if (!user && emailOrUsername) {
    const variations = [
      emailOrUsername,
      normalized,
      emailOrUsername.charAt(0).toUpperCase() + emailOrUsername.slice(1).toLowerCase(),
    ];
    const uniqueVariations = [...new Set(variations)];
    user = await prisma.user.findFirst({
      where: { displayName: { in: uniqueVariations } },
      select: loginSelect,
    });
  }

  if (!user) {
    const err = new Error('Invalid email or password');
    err.code = 'INVALID_CREDENTIALS';
    throw err;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    const err = new Error('Invalid email or password');
    err.code = 'INVALID_CREDENTIALS';
    throw err;
  }

  const token = generateToken(user.id);
  return { user: toUserResponse(user), token };
}

/**
 * Get user by id (for /me). Excludes password.
 * @param {string} userId
 * @returns {Promise<object|null>}
 */
export async function getMe(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { businesses: { select: { id: true, name: true } } },
  });
  return user ? toUserResponse(user) : null;
}

export { normalizeIdentifier };
