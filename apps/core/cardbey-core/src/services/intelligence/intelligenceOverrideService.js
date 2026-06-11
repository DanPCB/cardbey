/**
 * Fleet-wide intelligence foundation overrides (force-false kill switch only).
 */
import { getPrismaClient } from '../../lib/prisma.js';

export const INTELLIGENCE_OVERRIDE_SINGLETON_ID = 'singleton';

export const ALLOWED_INTELLIGENCE_OVERRIDE_KEYS = new Set([
  'foundation',
  'surfaceBriefing',
  'surfacePil',
  'surfaceConcierge',
  'surfaceDiscover',
]);

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
  if (!modelAvailable(prisma)) return {};
  const row = await prisma.intelligenceOverride.findUnique({
    where: { id: INTELLIGENCE_OVERRIDE_SINGLETON_ID },
  });
  if (!row) return {};
  return parseOverridesJson(row.overridesJson);
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
