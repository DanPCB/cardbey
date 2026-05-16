/**
 * Per-store MCP access tokens (hash-only at rest). Scoped to user + business (storeId).
 */

import crypto from 'node:crypto';
import { getPrismaClient } from '../prisma.js';

/**
 * @param {{ userId: string, storeId: string, label?: string }} params
 * @returns {Promise<{ token: string, label: string }>}
 */
export async function generateMcpToken({ userId, storeId, label = 'MCP Token' }) {
  const uid = String(userId || '').trim();
  const sid = String(storeId || '').trim();
  if (!uid || !sid) {
    throw new Error('userId and storeId required');
  }

  const prisma = getPrismaClient();
  const owned = await prisma.business.findFirst({
    where: { id: sid, userId: uid },
    select: { id: true },
  });
  if (!owned) {
    throw new Error('store_not_found_or_forbidden');
  }

  const raw = `mcp_${crypto.randomBytes(32).toString('hex')}`;
  const hash = crypto.createHash('sha256').update(raw).digest('hex');

  await prisma.mcpToken.create({
    data: {
      userId: uid,
      storeId: sid,
      tokenHash: hash,
      label: String(label || 'MCP Token').slice(0, 200),
    },
  });

  return { token: raw, label: String(label || 'MCP Token').slice(0, 200) };
}

/**
 * @param {string} rawToken
 * @returns {Promise<{ userId: string, storeId: string } | null>}
 */
export async function validateMcpToken(rawToken) {
  if (typeof rawToken !== 'string' || !rawToken.startsWith('mcp_')) return null;
  const prisma = getPrismaClient();
  const hash = crypto.createHash('sha256').update(rawToken).digest('hex');

  const record = await prisma.mcpToken.findFirst({
    where: { tokenHash: hash, revoked: false },
  });

  if (!record) return null;

  await prisma.mcpToken
    .update({
      where: { id: record.id },
      data: { lastUsedAt: new Date() },
    })
    .catch(() => {});

  return { userId: record.userId, storeId: record.storeId };
}

/**
 * @param {string} userId
 */
export async function listMcpTokens(userId) {
  const uid = String(userId || '').trim();
  if (!uid) return [];
  const prisma = getPrismaClient();
  return prisma.mcpToken.findMany({
    where: { userId: uid, revoked: false },
    select: { id: true, label: true, storeId: true, createdAt: true, lastUsedAt: true },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * @param {{ tokenId: string, userId: string }} params
 */
export async function revokeMcpToken({ tokenId, userId }) {
  const prisma = getPrismaClient();
  return prisma.mcpToken.updateMany({
    where: { id: String(tokenId).trim(), userId: String(userId).trim() },
    data: { revoked: true },
  });
}
