/**
 * Database-backed Pairing Session Store
 * -------------------------------------
 * This is the canonical source of truth for pairing sessions, using Prisma/DB.
 * Replaces the in-memory store for production use.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// 6-char code: A–Z & 0–9 (avoid ambiguous chars)
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';

/**
 * Generate a random 6-character code
 * @returns {string}
 */
function randomCode() {
  let code = '';
  for (let i = 0; i < 6; i += 1) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

/**
 * Normalize code to uppercase
 * @param {string} code
 * @returns {string}
 */
function normaliseCode(code) {
  return (code || '').trim().toUpperCase();
}

/**
 * Allocate a unique code that is not already in use
 * @returns {Promise<string>}
 */
async function allocateUniqueCode() {
  for (let i = 0; i < 25; i += 1) {
    const candidate = randomCode();
    const existing = await prisma.pairingSession.findUnique({
      where: { code: candidate },
    });
    if (!existing || existing.status === 'expired') {
      return candidate;
    }
  }
  throw new Error('PAIR_SESSION_CODE_EXHAUSTED');
}

/**
 * Expire sessions that have passed their expiry time
 * @param {Date} [now] - Current timestamp (defaults to new Date())
 */
export async function expireSessions(now = new Date()) {
  await prisma.pairingSession.updateMany({
    where: {
      expiresAt: { lt: now },
      status: { not: 'expired' },
    },
    data: {
      status: 'expired',
    },
  });
}

/**
 * Create a new pairing session
 * @param {{ ttlSec?: number, fingerprint: string, model: string, name: string, location?: string, origin?: string }} options
 * @returns {Promise<{sessionId: string, code: string, expiresAt: Date, status: string, fingerprint: string, model: string, name: string, location?: string}>}
 */
export async function createPairSession(options = {}) {
  const ttlSec = Number(options.ttlSec) || 300; // Default 5 minutes
  const expiresAt = new Date(Date.now() + (ttlSec * 1000));
  const code = await allocateUniqueCode();
  
  const session = await prisma.pairingSession.create({
    data: {
      code,
      status: 'showing_code',
      expiresAt,
      fingerprint: options.fingerprint,
      model: options.model,
      name: options.name,
      location: options.location || null,
      origin: options.origin || 'device',
    },
  });

  return {
    sessionId: session.sessionId,
    code: session.code,
    expiresAt: session.expiresAt,
    status: session.status,
    fingerprint: session.fingerprint,
    model: session.model,
    name: session.name,
    location: session.location,
    origin: session.origin,
  };
}

/**
 * Get a session by sessionId
 * @param {string} sessionId
 * @returns {Promise<{sessionId: string, code: string, status: string, expiresAt: Date, screenId?: string, deviceToken?: string, fingerprint: string, model: string, name: string, location?: string, claimedBy?: string} | null>}
 */
export async function getPairSession(sessionId) {
  if (!sessionId) return null;
  
  // Expire sessions before checking
  await expireSessions();
  
  const session = await prisma.pairingSession.findUnique({
    where: { sessionId },
  });
  
  if (!session) return null;
  
  // Check if expired
  const now = new Date();
  if (session.expiresAt < now && session.status !== 'expired' && session.status !== 'bound') {
    const updated = await prisma.pairingSession.update({
      where: { sessionId },
      data: { status: 'expired' },
    });
    return {
      sessionId: updated.sessionId,
      code: updated.code,
      status: updated.status,
      expiresAt: updated.expiresAt,
      screenId: updated.screenId || undefined,
      deviceToken: updated.deviceToken || undefined,
      fingerprint: updated.fingerprint,
      model: updated.model,
      name: updated.name,
      location: updated.location || undefined,
      claimedBy: updated.claimedBy || undefined,
      origin: updated.origin || undefined,
    };
  }
  
  return {
    sessionId: session.sessionId,
    code: session.code,
    status: session.status,
    expiresAt: session.expiresAt,
    screenId: session.screenId || undefined,
    deviceToken: session.deviceToken || undefined,
    fingerprint: session.fingerprint,
    model: session.model,
    name: session.name,
    location: session.location || undefined,
    claimedBy: session.claimedBy || undefined,
    origin: session.origin || undefined,
  };
}

/**
 * Find a session by code
 * @param {string} code
 * @returns {Promise<{sessionId: string, code: string, status: string, expiresAt: Date, screenId?: string, deviceToken?: string, fingerprint: string, model: string, name: string, location?: string, claimedBy?: string} | null>}
 */
export async function findByCode(code) {
  const normalized = normaliseCode(code);
  
  // Expire sessions before checking
  await expireSessions();
  
  const session = await prisma.pairingSession.findUnique({
    where: { code: normalized },
  });
  
  if (!session) return null;
  
  // Check if expired
  const now = new Date();
  if (session.expiresAt < now && session.status !== 'expired' && session.status !== 'bound') {
    const updated = await prisma.pairingSession.update({
      where: { code: normalized },
      data: { status: 'expired' },
    });
    return {
      sessionId: updated.sessionId,
      code: updated.code,
      status: updated.status,
      expiresAt: updated.expiresAt,
      screenId: updated.screenId || undefined,
      deviceToken: updated.deviceToken || undefined,
      fingerprint: updated.fingerprint,
      model: updated.model,
      name: updated.name,
      location: updated.location || undefined,
      claimedBy: updated.claimedBy || undefined,
      origin: updated.origin || undefined,
    };
  }
  
  return {
    sessionId: session.sessionId,
    code: session.code,
    status: session.status,
    expiresAt: session.expiresAt,
    screenId: session.screenId || undefined,
    deviceToken: session.deviceToken || undefined,
    fingerprint: session.fingerprint,
    model: session.model,
    name: session.name,
    location: session.location || undefined,
    claimedBy: session.claimedBy || undefined,
    origin: session.origin || undefined,
  };
}

/**
 * Update a session's status and optional fields
 * @param {string} sessionId
 * @param {string} status
 * @param {{ screenId?: string, deviceToken?: string, claimedBy?: string, name?: string, location?: string }} [updates]
 * @returns {Promise<{sessionId: string, code: string, status: string, expiresAt: Date, screenId?: string, deviceToken?: string, fingerprint: string, model: string, name: string, location?: string, claimedBy?: string} | null>}
 */
export async function updatePairSession(sessionId, status, updates = {}) {
  const updateData = { status };
  
  if (updates.screenId !== undefined) updateData.screenId = updates.screenId;
  if (updates.deviceToken !== undefined) updateData.deviceToken = updates.deviceToken;
  if (updates.claimedBy !== undefined) updateData.claimedBy = updates.claimedBy;
  if (updates.name !== undefined) updateData.name = updates.name;
  if (updates.location !== undefined) updateData.location = updates.location;
  
  try {
    const session = await prisma.pairingSession.update({
      where: { sessionId },
      data: updateData,
    });
    
    return {
      sessionId: session.sessionId,
      code: session.code,
      status: session.status,
      expiresAt: session.expiresAt,
      screenId: session.screenId || undefined,
      deviceToken: session.deviceToken || undefined,
      fingerprint: session.fingerprint,
      model: session.model,
      name: session.name,
      location: session.location || undefined,
      claimedBy: session.claimedBy || undefined,
      origin: session.origin || undefined,
    };
  } catch (error) {
    if (error.code === 'P2025') {
      // Record not found
      return null;
    }
    throw error;
  }
}

/**
 * Get all active (non-expired, non-completed) sessions
 * @returns {Promise<Array<{sessionId: string, code: string, status: string, expiresAt: Date}>>}
 */
export async function getAllActiveSessions() {
  await expireSessions();
  const now = new Date();
  
  const sessions = await prisma.pairingSession.findMany({
    where: {
      expiresAt: { gt: now },
      status: { notIn: ['expired', 'bound'] },
    },
    select: {
      sessionId: true,
      code: true,
      status: true,
      expiresAt: true,
    },
  });
  
  return sessions;
}

/**
 * Get active session count
 * @returns {Promise<number>}
 */
export async function getActiveSessionCount() {
  const active = await getAllActiveSessions();
  return active.length;
}

/**
 * Clear sessions for a specific screen (used when screen is deleted)
 * @param {string} screenId
 * @returns {Promise<number>}
 */
export async function clearPairSessionsByScreenId(screenId) {
  const result = await prisma.pairingSession.updateMany({
    where: { screenId },
    data: { status: 'expired' },
  });
  return result.count;
}

