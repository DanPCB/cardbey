/**
 * Persist dashboard navigation telemetry events.
 */

export const NAVIGATION_TELEMETRY_EVENTS = new Set([
  'page.view',
  'sidebar.click',
  'search.query',
  'navigation.frustration',
]);

const MAX_PATH_LEN = 500;
const MAX_QUERY_LEN = 200;
const MAX_SECTION_LEN = 120;
const MAX_ROLE_LEN = 32;
const MAX_SESSION_LEN = 64;
const MAX_ENV_LEN = 32;

function trimOptionalString(value, maxLen) {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  if (!t) return null;
  return t.length > maxLen ? t.slice(0, maxLen) : t;
}

function parseOptionalInt(value) {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : parseInt(String(value), 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {unknown} body
 * @returns {import('@prisma/client').Prisma.TelemetryNavigationCreateInput | null}
 */
export function parseNavigationTelemetryBody(body) {
  const b = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const eventType = typeof b.event === 'string' ? b.event.trim() : '';
  if (!NAVIGATION_TELEMETRY_EVENTS.has(eventType)) return null;

  let clientTs = null;
  if (typeof b.ts === 'number' && Number.isFinite(b.ts) && b.ts > 0) {
    clientTs = new Date(b.ts);
  }

  let metadata = null;
  if (b.metadata && typeof b.metadata === 'object' && !Array.isArray(b.metadata)) {
    metadata = b.metadata;
  }

  return {
    eventType,
    userId: trimOptionalString(b.userId, 64),
    userRole: trimOptionalString(b.userRole, MAX_ROLE_LEN),
    sessionId: trimOptionalString(b.sessionId, MAX_SESSION_LEN),
    fromPath: trimOptionalString(b.fromPath, MAX_PATH_LEN),
    toPath: trimOptionalString(b.toPath, MAX_PATH_LEN),
    targetSection: trimOptionalString(b.targetSection, MAX_SECTION_LEN),
    searchQuery: trimOptionalString(b.searchQuery, MAX_QUERY_LEN),
    timeOnPageMs: parseOptionalInt(b.timeOnPageMs),
    environment: trimOptionalString(b.environment, MAX_ENV_LEN),
    metadata,
    clientTs,
  };
}

/**
 * @param {import('../../lib/prisma.js').PrismaClient} prisma
 * @param {import('@prisma/client').Prisma.TelemetryNavigationCreateInput} data
 * @param {{ userId?: string | null; userRole?: string | null }} [opts]
 */
export async function recordNavigationTelemetry(prisma, data, opts = {}) {
  const userId =
    (typeof opts.userId === 'string' && opts.userId.trim()) ||
    data.userId ||
    null;
  const userRole =
    (typeof opts.userRole === 'string' && opts.userRole.trim()) ||
    data.userRole ||
    null;

  return prisma.telemetryNavigation.create({
    data: {
      ...data,
      userId,
      userRole,
    },
  });
}

/**
 * @param {import('@prisma/client').TelemetryNavigation} row
 */
export function logNavigationTelemetrySideEffects(row) {
  if (row.eventType !== 'navigation.frustration') return;
  const meta =
    row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
      ? row.metadata
      : {};
  const reason = typeof meta.reason === 'string' ? meta.reason : 'unknown';
  console.warn(
    `[NavigationTelemetry] Admin frustration (${reason}) user=${row.userId ?? 'anon'} session=${row.sessionId ?? '?'} path=${row.fromPath ?? '?'}`,
  );
}
