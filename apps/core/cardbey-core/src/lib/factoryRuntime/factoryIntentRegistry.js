/**
 * Pluggable factory intent resolution registry.
 */

/** @type {Array<object>} */
const intents = [];

/**
 * @param {{
 *   id: string;
 *   factoryId?: string;
 *   resolveFactoryId?: (ctx: object) => string|null;
 *   patterns?: { labels?: string[]; regex?: RegExp[] };
 *   match?: (ctx: object) => boolean;
 *   capability?: string;
 *   priority?: number;
 *   flag?: string;
 *   enabled?: (ctx?: object) => boolean;
 * }} entry
 */
export function registerFactoryIntent(entry) {
  const id = String(entry?.id ?? '').trim();
  if (!id) throw new Error('[factoryIntentRegistry] id is required');
  if (!entry.factoryId && typeof entry.resolveFactoryId !== 'function' && typeof entry.match !== 'function') {
    throw new Error('[factoryIntentRegistry] factoryId, resolveFactoryId, or match required');
  }
  intents.push({
    id,
    factoryId: entry.factoryId ?? null,
    resolveFactoryId: entry.resolveFactoryId ?? null,
    patterns: entry.patterns ?? {},
    match: entry.match ?? null,
    capability: entry.capability ?? null,
    priority: typeof entry.priority === 'number' ? entry.priority : 0,
    flag: entry.flag ?? null,
    enabled: entry.enabled ?? null,
  });
  intents.sort((a, b) => b.priority - a.priority);
}

/**
 * @param {string} flag
 */
function isFlagEnabled(flag) {
  if (!flag) return true;
  const raw = process.env[flag];
  if (raw === 'false' || raw === '0') return false;
  if (raw === 'true' || raw === '1') return true;
  return flag === 'ENABLE_CREATIVE_FACTORY_V1';
}

/**
 * @param {object} entry
 * @param {object} ctx
 */
function entryMatches(entry, ctx) {
  if (entry.enabled && !entry.enabled(ctx)) return false;
  if (entry.flag && !isFlagEnabled(entry.flag)) return false;

  if (typeof entry.match === 'function') {
    return Boolean(entry.match(ctx));
  }

  const label = String(ctx.intentLabel ?? '').trim().toLowerCase();
  const msg = String(ctx.userMessage ?? '').trim().toLowerCase();
  const labels = entry.patterns?.labels ?? [];
  if (label && labels.map((l) => String(l).toLowerCase()).includes(label)) return true;

  const regexes = entry.patterns?.regex ?? [];
  const haystack = `${label} ${msg}`.trim();
  return regexes.some((re) => re.test(haystack));
}

/**
 * @param {{ intentLabel?: string; userMessage?: string; [key: string]: unknown }} userIntent
 * @param {Record<string, unknown>} [context]
 */
export function resolveFactoryIntent(userIntent, context = {}) {
  const ctx = {
    ...context,
    intentLabel: userIntent?.intentLabel ?? userIntent?.tool ?? '',
    userMessage: userIntent?.userMessage ?? userIntent?.goal ?? userIntent?.message ?? '',
  };

  for (const entry of intents) {
    if (!entryMatches(entry, ctx)) continue;
    const factoryId =
      typeof entry.resolveFactoryId === 'function'
        ? entry.resolveFactoryId(ctx)
        : entry.factoryId;
    if (!factoryId) continue;
    return {
      factoryId,
      intentId: entry.id,
      capability: entry.capability,
      priority: entry.priority,
    };
  }
  return null;
}

export function listFactoryIntents() {
  return [...intents];
}

export function clearFactoryIntentsForTests() {
  intents.length = 0;
}
