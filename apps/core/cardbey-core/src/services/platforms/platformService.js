/**
 * Platform Service — connection status and credential persistence for social + LLM platforms.
 */

import { getPrismaClient } from '../../lib/prisma.js';
import { encryptToken, decryptToken } from '../../lib/tokenCrypto.js';
import {
  getAllPlatforms,
  getPlatformById,
  isPlatformEnvConfigured,
  SOCIAL_PLATFORMS,
  LLM_PLATFORMS,
} from '../../lib/platforms/platformRegistry.js';

function safeDecryptCredentials(encoded) {
  if (!encoded) return null;
  try {
    const raw = decryptToken(encoded);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function encryptCredentials(credentials) {
  return encryptToken(JSON.stringify(credentials ?? {}));
}

/**
 * @param {Record<string, string>} body
 * @param {string[]} requiredKeys
 */
function pickCredentialFields(body, requiredKeys) {
  const out = {};
  for (const key of requiredKeys) {
    const direct = body?.[key];
    const alt = body?.[key.toLowerCase()];
    const snake = body?.[key.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '')];
    const value = direct ?? alt ?? snake;
    if (value != null && String(value).trim()) {
      out[key] = String(value).trim();
    }
  }
  return out;
}

export class PlatformService {
  /**
   * @param {import('@prisma/client').PrismaClient} [prisma]
   */
  constructor(prisma = getPrismaClient()) {
    this.prisma = prisma;
  }

  listRegistry() {
    return {
      social: Object.values(SOCIAL_PLATFORMS),
      llm: Object.values(LLM_PLATFORMS),
    };
  }

  /**
   * @param {string} userId
   */
  async getStatus(userId) {
    const uid = String(userId ?? '').trim();
    const platforms = getAllPlatforms();
    /** @type {Record<string, object>} */
    const statuses = {};

    for (const [key, platform] of Object.entries(platforms)) {
      statuses[key] = await this.checkPlatformStatus(uid, platform);
    }

    return statuses;
  }

  /**
   * @param {string} userId
   * @param {import('../../lib/platforms/platformRegistry.js').PlatformDescriptor} platform
   */
  async checkPlatformStatus(userId, platform) {
    const uid = String(userId ?? '').trim();
    const configured =
      platform.authType === 'oauth' ? isPlatformEnvConfigured(platform) : true;
    const base = {
      platformId: platform.id,
      name: platform.name,
      icon: platform.icon,
      color: platform.color,
      authType: platform.authType,
      capabilities: platform.capabilities,
      configured,
      docUrl: platform.docUrl ?? null,
      authUrl: platform.authUrl ?? null,
    };

    if (!uid) {
      return {
        ...base,
        connected: false,
        status: 'not_connected',
        message: 'Sign in to connect',
      };
    }

    try {
      if (platform.authType === 'oauth' && platform.oauthPlatform) {
        const conn = await this.prisma.oAuthConnection.findFirst({
          where: { userId: uid, platform: platform.oauthPlatform },
          orderBy: { updatedAt: 'desc' },
          select: {
            pageId: true,
            pageName: true,
            expiresAt: true,
            createdAt: true,
            updatedAt: true,
          },
        });

        if (!conn) {
          return {
            ...base,
            connected: false,
            status: configured ? 'not_connected' : 'not_configured',
            message: configured ? 'Not connected' : 'Server OAuth credentials not configured',
          };
        }

        if (conn.expiresAt && new Date(conn.expiresAt) < new Date()) {
          return {
            ...base,
            connected: false,
            status: 'expired',
            message: 'Token expired. Please reconnect.',
            connectedAt: conn.createdAt?.toISOString?.() ?? null,
            expiresAt: conn.expiresAt?.toISOString?.() ?? null,
          };
        }

        return {
          ...base,
          connected: true,
          status: 'active',
          message: conn.pageName ? `Connected · ${conn.pageName}` : 'Connected',
          connectedAt: conn.createdAt?.toISOString?.() ?? null,
          expiresAt: conn.expiresAt?.toISOString?.() ?? null,
          accountLabel: conn.pageName ?? conn.pageId ?? null,
        };
      }

      const row = await this.prisma.platformConnection.findUnique({
        where: {
          userId_platformId: { userId: uid, platformId: platform.id },
        },
      });

      if (!row || row.status !== 'active') {
        return {
          ...base,
          connected: false,
          status: 'not_connected',
          message: 'Not connected',
        };
      }

      if (row.expiresAt && new Date(row.expiresAt) < new Date()) {
        return {
          ...base,
          connected: false,
          status: 'expired',
          message: 'Credentials expired. Please reconnect.',
          connectedAt: row.createdAt?.toISOString?.() ?? null,
          expiresAt: row.expiresAt?.toISOString?.() ?? null,
        };
      }

      return {
        ...base,
        connected: true,
        status: 'active',
        message: 'Connected',
        connectedAt: row.createdAt?.toISOString?.() ?? null,
        expiresAt: row.expiresAt?.toISOString?.() ?? null,
      };
    } catch (error) {
      return {
        ...base,
        connected: false,
        status: 'error',
        message: 'Error checking status',
        error: error?.message ?? 'status_check_failed',
      };
    }
  }

  /**
   * @param {string} userId
   * @param {string} platformId
   * @param {Record<string, string>} credentials
   */
  async connectPlatform(userId, platformId, credentials = {}) {
    const uid = String(userId ?? '').trim();
    if (!uid) throw new Error('unauthorized');

    const platform = getPlatformById(platformId);
    if (!platform) throw new Error(`Platform ${platformId} not found`);

    if (platform.authType === 'oauth') {
      return {
        ok: true,
        platform: platformId,
        status: 'redirect',
        authType: 'oauth',
        redirectUrl: platform.authUrl,
        configured: isPlatformEnvConfigured(platform),
      };
    }

    const picked = pickCredentialFields(credentials, platform.requires);
    for (const key of platform.requires) {
      if (!picked[key]) {
        const err = new Error(`Missing required credential: ${key}`);
        err.code = 'missing_credential';
        err.field = key;
        throw err;
      }
    }

    const encrypted = encryptCredentials(picked);
    const connection = await this.prisma.platformConnection.upsert({
      where: {
        userId_platformId: { userId: uid, platformId: platform.id },
      },
      update: {
        credentialsEnc: encrypted,
        status: 'active',
        disconnectedAt: null,
        updatedAt: new Date(),
      },
      create: {
        userId: uid,
        platformId: platform.id,
        credentialsEnc: encrypted,
        status: 'active',
      },
    });

    return {
      ok: true,
      platform: platformId,
      status: 'connected',
      connectedAt: connection.createdAt?.toISOString?.() ?? new Date().toISOString(),
      capabilities: platform.capabilities,
    };
  }

  /**
   * @param {string} userId
   * @param {string} platformId
   */
  async disconnectPlatform(userId, platformId) {
    const uid = String(userId ?? '').trim();
    if (!uid) throw new Error('unauthorized');

    const platform = getPlatformById(platformId);
    if (!platform) throw new Error(`Platform ${platformId} not found`);

    if (platform.authType === 'oauth' && platform.oauthPlatform) {
      await this.prisma.oAuthConnection.deleteMany({
        where: { userId: uid, platform: platform.oauthPlatform },
      });
      return { ok: true, platform: platformId, status: 'disconnected' };
    }

    await this.prisma.platformConnection.updateMany({
      where: { userId: uid, platformId: platform.id, status: 'active' },
      data: {
        status: 'inactive',
        disconnectedAt: new Date(),
      },
    });

    return { ok: true, platform: platformId, status: 'disconnected' };
  }

  /**
   * @param {string} userId
   * @param {string} platformId
   */
  async getDecryptedCredentials(userId, platformId) {
    const uid = String(userId ?? '').trim();
    const platform = getPlatformById(platformId);
    if (!uid || !platform) return null;

    const row = await this.prisma.platformConnection.findUnique({
      where: { userId_platformId: { userId: uid, platformId: platform.id } },
    });
    if (!row || row.status !== 'active') return null;
    return safeDecryptCredentials(row.credentialsEnc);
  }
}

export default new PlatformService();
