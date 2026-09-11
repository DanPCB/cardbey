/**
 * Execution frame — resolves locale for Performer tool dispatch (content generation).
 */

import { normalizeLocale } from './localePrompt.js';

function isMaintenanceExecutionContext(context) {
  if (!context || typeof context !== 'object') return false;
  const missionType = String(context.missionType ?? '').toUpperCase();
  if (missionType === 'MAINTENANCE') return true;
  if (context.skipLocaleResolution === true) return true;
  if (context.maintenanceToken != null && String(context.maintenanceToken).trim()) return true;
  return false;
}

function getBusinessLocaleCache(context) {
  if (!context || typeof context !== 'object') return new Map();
  if (!(context._businessLocaleCache instanceof Map)) {
    context._businessLocaleCache = new Map();
  }
  return context._businessLocaleCache;
}

async function lookupBusinessLocale(storeId, cache) {
  const id = typeof storeId === 'string' ? storeId.trim() : '';
  if (!id) return 'en';
  if (cache.has(id)) return cache.get(id);
  // Business.locale is not in the Prisma schema — do not query it (avoids noisy prisma:error on every tool dispatch).
  // Prefer context.locale / region when callers pass them; otherwise default en.
  const locale = 'en';
  cache.set(id, locale);
  return locale;
}

/**
 * @param {object} [context]
 * @returns {Promise<{ locale: string, storeId?: string, missionId?: string, tenantId?: string, userId?: string }>}
 */
export async function buildExecutionFrame(context = undefined) {
  const ctx =
    context && typeof context === 'object' && !Array.isArray(context) ? context : {};

  if (isMaintenanceExecutionContext(ctx)) {
    return {
      locale: 'en',
      ...(typeof ctx.storeId === 'string' && ctx.storeId.trim() ? { storeId: ctx.storeId.trim() } : {}),
      ...(typeof ctx.missionId === 'string' && ctx.missionId.trim() ? { missionId: ctx.missionId.trim() } : {}),
      ...(ctx.tenantId != null ? { tenantId: ctx.tenantId } : {}),
      ...(ctx.userId != null ? { userId: ctx.userId } : {}),
    };
  }

  let locale;
  if (ctx.locale != null && String(ctx.locale).trim()) {
    locale = normalizeLocale(ctx.locale);
  } else {
    const storeId = typeof ctx.storeId === 'string' ? ctx.storeId.trim() : '';
    if (storeId) {
      const cache = getBusinessLocaleCache(ctx);
      locale = await lookupBusinessLocale(storeId, cache);
    } else {
      locale = 'en';
    }
  }

  return {
    locale,
    ...(typeof ctx.storeId === 'string' && ctx.storeId.trim() ? { storeId: ctx.storeId.trim() } : {}),
    ...(typeof ctx.missionId === 'string' && ctx.missionId.trim() ? { missionId: ctx.missionId.trim() } : {}),
    ...(ctx.tenantId != null ? { tenantId: ctx.tenantId } : {}),
    ...(ctx.userId != null ? { userId: ctx.userId } : {}),
  };
}
