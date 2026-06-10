/**
 * DiscoveryConfigService — singleton DB-backed discovery agent configuration.
 */

import { prisma } from '../prisma.js';

const BOOTSTRAP_DEFAULTS = {
  enabled: process.env.DISCOVERY_ENABLED === 'true',
  cronExpression: process.env.DISCOVERY_CRON?.trim() || '0 */6 * * *',
  batchSize: Math.max(1, parseInt(process.env.DISCOVERY_MAX_PER_RUN ?? '20', 10) || 20),
  concurrency: Math.max(1, parseInt(process.env.DISCOVERY_CONCURRENCY ?? '3', 10) || 3),
  delayMs: Math.max(0, parseInt(process.env.DISCOVERY_DELAY_MS ?? '2000', 10) || 2000),
  maxRunsPerDay: 4,
  pausedUntil: null,
};

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function validateCronExpression(expr) {
  if (typeof expr !== 'string' || !expr.trim()) return false;
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  return parts.every((part) => /^[\d*/,\-]+$/.test(part));
}

function validatePatch(patch) {
  const errors = [];
  if (patch.cronExpression !== undefined && !validateCronExpression(patch.cronExpression)) {
    errors.push('INVALID_CRON');
  }
  if (patch.batchSize !== undefined) {
    const n = Number(patch.batchSize);
    if (!Number.isInteger(n) || n < 1 || n > 200) errors.push('invalid_batchSize');
  }
  if (patch.concurrency !== undefined) {
    const n = Number(patch.concurrency);
    if (!Number.isInteger(n) || n < 1 || n > 10) errors.push('invalid_concurrency');
  }
  if (patch.delayMs !== undefined) {
    const n = Number(patch.delayMs);
    if (!Number.isInteger(n) || n < 500 || n > 30000) errors.push('invalid_delayMs');
  }
  if (patch.maxRunsPerDay !== undefined) {
    const n = Number(patch.maxRunsPerDay);
    if (!Number.isInteger(n) || n < 1 || n > 24) errors.push('invalid_maxRunsPerDay');
  }
  return errors;
}

export async function countRunsToday() {
  try {
    return await prisma.discoveryBatchRun.count({
      where: {
        startedAt: { gte: startOfToday() },
        status: { in: ['completed', 'partial', 'running'] },
      },
    });
  } catch {
    return 0;
  }
}

/**
 * @returns {Promise<object>}
 */
export async function getConfig() {
  try {
    let row = await prisma.discoveryConfig.findFirst({
      orderBy: { createdAt: 'asc' },
    });
    if (!row) {
      row = await prisma.discoveryConfig.create({
        data: {
          ...BOOTSTRAP_DEFAULTS,
          updatedBy: null,
        },
      });
    }
    return row;
  } catch (error) {
    console.warn('[DiscoveryConfig] getConfig failed, using bootstrap defaults:', error?.message || error);
    return { ...BOOTSTRAP_DEFAULTS, id: null, updatedAt: new Date(), createdAt: new Date() };
  }
}

/**
 * @param {object} patch
 * @param {string|null} updatedBy
 */
export async function updateConfig(patch, updatedBy = null) {
  const errors = validatePatch(patch);
  if (errors.length > 0) {
    return {
      ok: false,
      error: errors.includes('INVALID_CRON') ? 'INVALID_CRON' : 'VALIDATION_ERROR',
      details: errors,
    };
  }

  try {
    const existing = await getConfig();
    const data = { updatedBy: updatedBy || null };

    if (patch.enabled !== undefined) data.enabled = Boolean(patch.enabled);
    if (patch.cronExpression !== undefined) data.cronExpression = String(patch.cronExpression).trim();
    if (patch.batchSize !== undefined) data.batchSize = Number(patch.batchSize);
    if (patch.concurrency !== undefined) data.concurrency = Number(patch.concurrency);
    if (patch.delayMs !== undefined) data.delayMs = Number(patch.delayMs);
    if (patch.maxRunsPerDay !== undefined) data.maxRunsPerDay = Number(patch.maxRunsPerDay);
    if (patch.pausedUntil !== undefined) {
      data.pausedUntil = patch.pausedUntil ? new Date(patch.pausedUntil) : null;
    }

    let config;
    if (existing.id) {
      config = await prisma.discoveryConfig.update({
        where: { id: existing.id },
        data,
      });
    } else {
      config = await prisma.discoveryConfig.create({
        data: { ...BOOTSTRAP_DEFAULTS, ...data },
      });
    }

    return { ok: true, config };
  } catch (error) {
    console.warn('[DiscoveryConfig] updateConfig failed:', error?.message || error);
    return { ok: false, error: 'DB_ERROR' };
  }
}

export async function setEnabled(enabled, updatedBy = null) {
  return updateConfig({ enabled: Boolean(enabled) }, updatedBy);
}

export async function pauseUntil(hours, updatedBy = null) {
  const h = Number(hours);
  if (!Number.isInteger(h) || h < 1 || h > 72) {
    return { ok: false, error: 'INVALID_HOURS' };
  }
  const pausedUntil = new Date(Date.now() + h * 60 * 60 * 1000);
  return updateConfig({ pausedUntil }, updatedBy);
}

export async function resume(updatedBy = null) {
  return updateConfig({ pausedUntil: null }, updatedBy);
}

export async function isRunnable() {
  const config = await getConfig();
  const now = new Date();

  if (!config.enabled) {
    return { ok: false, reason: 'DISABLED', config };
  }

  if (config.pausedUntil && new Date(config.pausedUntil) > now) {
    return { ok: false, reason: 'PAUSED', until: config.pausedUntil, config };
  }

  const runsToday = await countRunsToday();
  if (runsToday >= config.maxRunsPerDay) {
    return {
      ok: false,
      reason: 'DAILY_LIMIT_REACHED',
      runsToday,
      limit: config.maxRunsPerDay,
      maxRunsPerDay: config.maxRunsPerDay,
      config,
    };
  }

  return { ok: true, config, runsToday };
}

export { validateCronExpression, BOOTSTRAP_DEFAULTS };
