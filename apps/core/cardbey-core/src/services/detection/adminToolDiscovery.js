/**
 * Detect admin sessions struggling to discover Console / Control Tower tools.
 */

const ADMIN_TOOL_QUERY = /control|tower|admin|console|platform|ops|deploy|telemetry/i;
const MARKETING_PATH = /\/dashboard|\/catalog|\/orders|\/marketing|\/insights/;
const CONSOLE_PATH = /\/app\/console|\/console\/control-tower/;

function isMarketingPath(path) {
  return typeof path === 'string' && MARKETING_PATH.test(path);
}

function isConsolePath(path) {
  return typeof path === 'string' && CONSOLE_PATH.test(path);
}

/**
 * @param {import('../../lib/prisma.js').PrismaClient} prisma
 * @param {{ windowHours?: number }} [opts]
 */
export async function detectAdminToolDiscoveryIssues(prisma, opts = {}) {
  const windowHours = Math.min(168, Math.max(1, opts.windowHours ?? 24));
  const since = new Date(Date.now() - windowHours * 3600000);

  const rows = await prisma.telemetryNavigation.findMany({
    where: {
      createdAt: { gte: since },
      userRole: 'admin',
    },
    orderBy: { createdAt: 'asc' },
    take: 5000,
  });

  /** @type {Map<string, { userId: string | null, sessionId: string | null, marketingVisits: number, consoleVisits: number, searchQueries: string[], frustrationSignals: number, events: typeof rows }>} */
  const bySession = new Map();

  for (const row of rows) {
    const key = `${row.userId ?? 'anon'}::${row.sessionId ?? 'no-session'}`;
    if (!bySession.has(key)) {
      bySession.set(key, {
        userId: row.userId ?? null,
        sessionId: row.sessionId ?? null,
        marketingVisits: 0,
        consoleVisits: 0,
        searchQueries: [],
        frustrationSignals: 0,
        events: [],
      });
    }
    const bucket = bySession.get(key);
    bucket.events.push(row);

    const path = row.fromPath || row.toPath || '';
    if (row.eventType === 'page.view') {
      if (isMarketingPath(path) || isMarketingPath(row.toPath || '')) bucket.marketingVisits += 1;
      if (isConsolePath(path) || isConsolePath(row.toPath || '')) bucket.consoleVisits += 1;
    }
    if (row.eventType === 'navigation.frustration') bucket.frustrationSignals += 1;
    if (row.searchQuery && ADMIN_TOOL_QUERY.test(row.searchQuery)) {
      if (!bucket.searchQueries.includes(row.searchQuery)) {
        bucket.searchQueries.push(row.searchQuery);
      }
    }
  }

  /** @type {Array<{ userId: string | null, sessionId: string | null, marketingVisits: number, consoleVisits: number, searchQueries: string[], frustrationSignals: number, severity: 'medium' | 'high', suggestedFix: string }>} */
  const problematic = [];

  for (const session of bySession.values()) {
    const searchingAdminTools = session.searchQueries.length > 0;
    const stuckOnMarketing =
      session.marketingVisits > 3 && session.consoleVisits === 0 && searchingAdminTools;
    const highFrustration = session.frustrationSignals >= 2;

    if (!stuckOnMarketing && !highFrustration) continue;

    const severity = highFrustration ? 'high' : 'medium';
    const suggestedFix =
      'Add Control Tower link to marketing sidebar for admin users, or default admin login redirect to /app/console/control-tower';

    problematic.push({
      userId: session.userId,
      sessionId: session.sessionId,
      marketingVisits: session.marketingVisits,
      consoleVisits: session.consoleVisits,
      searchQueries: session.searchQueries,
      frustrationSignals: session.frustrationSignals,
      severity,
      suggestedFix,
    });

    console.warn('[SelfHealing] admin_tool_discovery_failure', {
      userId: session.userId,
      sessionId: session.sessionId,
      marketingVisits: session.marketingVisits,
      consoleVisits: session.consoleVisits,
      searchQueries: session.searchQueries,
      frustrationSignals: session.frustrationSignals,
    });
  }

  return {
    windowHours,
    sessionsAnalyzed: bySession.size,
    problematicCount: problematic.length,
    problematic,
    suggestedGlobalFix:
      problematic.length >= 3
        ? 'Enable VITE_MARKETING_ADMIN_CONSOLE_LINK=true or persist marketing sidebar Control Tower link for admins'
        : null,
  };
}

/**
 * Aggregate verify-style success metrics for admin navigation (companion to hero video telemetry).
 * @param {import('../../lib/prisma.js').PrismaClient} prisma
 */
export async function buildAdminDiscoveryMetrics(prisma) {
  const since = new Date(Date.now() - 7 * 86400000);
  const rows = await prisma.telemetryNavigation.findMany({
    where: { userRole: 'admin', createdAt: { gte: since } },
    select: { userId: true, fromPath: true, toPath: true, eventType: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });

  /** @type {Map<string, { discoveredConsole: boolean, frustration: number, marketingViews: number }>} */
  const byUser = new Map();

  for (const row of rows) {
    const uid = row.userId ?? 'anon';
    if (!byUser.has(uid)) {
      byUser.set(uid, { discoveredConsole: false, frustration: 0, marketingViews: 0 });
    }
    const u = byUser.get(uid);
    const path = row.toPath || row.fromPath || '';
    if (row.eventType === 'page.view' && isMarketingPath(path)) u.marketingViews += 1;
    if (row.eventType === 'page.view' && isConsolePath(path)) u.discoveredConsole = true;
    if (row.eventType === 'navigation.frustration') u.frustration += 1;
  }

  const users = [...byUser.values()];
  const adminsWithFrustration = users.filter((u) => u.frustration > 0).length;
  const adminsWhoFoundConsole = users.filter((u) => u.discoveredConsole).length;
  const adminsNeverFound = users.filter((u) => !u.discoveredConsole && u.marketingViews > 3).length;

  return {
    windowDays: 7,
    adminsTracked: users.length,
    adminsWithFrustration,
    adminsWhoFoundConsole,
    adminsNeverFound,
  };
}
