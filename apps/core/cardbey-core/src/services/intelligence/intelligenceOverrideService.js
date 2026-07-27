/**
 * Fleet-wide intelligence foundation overrides (force-false kill switch only).
 */
import { getPrismaClient } from '../../lib/prisma.js';

export const INTELLIGENCE_OVERRIDE_SINGLETON_ID = 'singleton';
export const INTELLIGENCE_OVERRIDE_MAX_KEYS = 50;
export const INTELLIGENCE_OVERRIDE_MAX_JSON_BYTES = 8 * 1024;
export const INTELLIGENCE_OVERRIDE_CACHE_TTL_MS = 30_000;
export const INTELLIGENCE_OVERRIDE_CACHE_MAX_ENTRIES = 8;

/** @type {{ value: Record<string, boolean>; expiresAt: number } | null} */
let overrideCache = null;

/** @type {Map<string, { value: Record<string, boolean>; expiresAt: number }>} */
const overrideCacheByKey = new Map();

export const ALLOWED_INTELLIGENCE_OVERRIDE_KEYS = new Set([
  'foundation',
  'surfaceBriefing',
  'surfacePil',
  'surfaceConcierge',
  'surfaceDiscover',
]);

function boundOverrides(raw) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const bounded = {};
  let count = 0;
  for (const [key, value] of Object.entries(source)) {
    if (!ALLOWED_INTELLIGENCE_OVERRIDE_KEYS.has(key)) continue;
    if (typeof value !== 'boolean') continue;
    bounded[key] = value;
    count += 1;
    if (count >= INTELLIGENCE_OVERRIDE_MAX_KEYS) break;
  }
  const json = JSON.stringify(bounded);
  if (Buffer.byteLength(json, 'utf8') > INTELLIGENCE_OVERRIDE_MAX_JSON_BYTES) {
    return {};
  }
  return bounded;
}

function readOverrideCache(cacheKey) {
  const now = Date.now();
  if (overrideCache && now < overrideCache.expiresAt) {
    return overrideCache.value;
  }
  const keyed = overrideCacheByKey.get(cacheKey);
  if (keyed && now < keyed.expiresAt) {
    return keyed.value;
  }
  return null;
}

function writeOverrideCache(cacheKey, value) {
  const expiresAt = Date.now() + INTELLIGENCE_OVERRIDE_CACHE_TTL_MS;
  overrideCache = { value, expiresAt };
  overrideCacheByKey.set(cacheKey, { value, expiresAt });
  while (overrideCacheByKey.size > INTELLIGENCE_OVERRIDE_CACHE_MAX_ENTRIES) {
    const oldest = overrideCacheByKey.keys().next().value;
    if (oldest == null) break;
    overrideCacheByKey.delete(oldest);
  }
}

function parseOverridesJson(raw) {
  if (raw == null || raw === '') return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function modelAvailable(prisma) {
  const delegate = prisma?.intelligenceOverride;
  return Boolean(delegate && typeof delegate.findUnique === 'function');
}

/**
 * Validate PUT body: only allowed keys, boolean false only (force-false kill switch).
 * @param {unknown} body
 */
export function validateIntelligenceOverridePayload(body) {
  if (body == null || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'invalid_body', code: 'invalid_input' };
  }
  const overrides = {};
  for (const [key, value] of Object.entries(body)) {
    if (!ALLOWED_INTELLIGENCE_OVERRIDE_KEYS.has(key)) {
      return { ok: false, error: `unknown_key:${key}`, code: 'invalid_input' };
    }
    if (typeof value !== 'boolean') {
      return { ok: false, error: `invalid_type:${key}`, code: 'invalid_input' };
    }
    if (value === true) {
      return { ok: false, error: `force_false_only:${key}`, code: 'invalid_input' };
    }
    overrides[key] = false;
  }
  return { ok: true, overrides };
}

/**
 * @param {import('@prisma/client').PrismaClient} [prisma]
 */
export async function getFleetIntelligenceOverrides(prisma = getPrismaClient()) {
  const cacheKey = INTELLIGENCE_OVERRIDE_SINGLETON_ID;
  const cached = readOverrideCache(cacheKey);
  if (cached) return cached;

  if (!modelAvailable(prisma)) {
    const empty = {};
    writeOverrideCache(cacheKey, empty);
    return empty;
  }
  const row = await prisma.intelligenceOverride.findUnique({
    where: { id: INTELLIGENCE_OVERRIDE_SINGLETON_ID },
    select: { overridesJson: true },
  });
  const parsed = row ? boundOverrides(parseOverridesJson(row.overridesJson)) : {};
  writeOverrideCache(cacheKey, parsed);
  return parsed;
}

/**
 * @param {Record<string, boolean>} overrides
 * @param {string | null | undefined} actorId
 * @param {import('@prisma/client').PrismaClient} [prisma]
 */
export async function setFleetIntelligenceOverrides(overrides, actorId, prisma = getPrismaClient()) {
  const validated = validateIntelligenceOverridePayload(overrides);
  if (!validated.ok) {
    const err = new Error(validated.error);
    err.statusCode = 400;
    err.code = validated.code;
    throw err;
  }
  if (!modelAvailable(prisma)) {
    const err = new Error('intelligence_override_unavailable');
    err.statusCode = 503;
    err.code = 'unavailable';
    throw err;
  }

  const before = await getFleetIntelligenceOverrides(prisma);
  const after = validated.overrides;
  const json = JSON.stringify(after);

  await prisma.intelligenceOverride.upsert({
    where: { id: INTELLIGENCE_OVERRIDE_SINGLETON_ID },
    create: {
      id: INTELLIGENCE_OVERRIDE_SINGLETON_ID,
      overridesJson: json,
      updatedBy: actorId ? String(actorId) : null,
    },
    update: {
      overridesJson: json,
      updatedBy: actorId ? String(actorId) : null,
    },
  });

  invalidateIntelligenceOverrideCache();

  console.log(
    JSON.stringify({
      evt: 'intelligence_override_set',
      actor: actorId ?? null,
      before,
      after,
    }),
  );

  return after;
}

function invalidateIntelligenceOverrideCache() {
  overrideCache = null;
  overrideCacheByKey.clear();
}

/** @internal test helper */
export function resetIntelligenceOverrideCacheForTests() {
  invalidateIntelligenceOverrideCache();
}
