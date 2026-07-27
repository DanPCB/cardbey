/**
 * Replay pending store disambiguation when the user replies with a store name (typed or chip).
 */

import { fetchUserStoresForDisambiguation } from './resolveStoreAmbiguity.js';

function pickString(...values) {
  for (const value of values) {
    if (value == null) continue;
    const trimmed = String(value).trim();
    if (trimmed) return trimmed;
  }
  return null;
}

/**
 * @param {unknown} name
 */
export function normalizeStoreMatchKey(name) {
  return String(name ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * @param {unknown} reply
 * @param {Array<Record<string, unknown>>} candidates
 * @returns {{ id: string; name: string } | null}
 */
export function matchStoreCandidateByReply(reply, candidates = []) {
  const key = normalizeStoreMatchKey(reply);
  if (!key || key.length < 2) return null;

  const list = Array.isArray(candidates) ? candidates : [];
  const normalized = list
    .map((c) => {
      if (!c || typeof c !== 'object') return null;
      const id = pickString(c.value, c.id, c.storeId);
      const name = pickString(c.label, c.name);
      if (!id || !name) return null;
      return { id, name, key: normalizeStoreMatchKey(name) };
    })
    .filter(Boolean);

  const exact = normalized.find((c) => c.key === key);
  if (exact) return { id: exact.id, name: exact.name };

  const exactContains = normalized.filter((c) => c.key.includes(key) || key.includes(c.key));
  if (exactContains.length === 1) {
    return { id: exactContains[0].id, name: exactContains[0].name };
  }

  return null;
}

/**
 * Build intake clarify options from planner resolution errors.
 *
 * @param {import('../memory/memoryHydrator.js').HydratedContext | null | undefined} hydratedContext
 * @param {{ tool?: string; parameters?: Record<string, unknown> } | null | undefined} classification
 */
export function buildStoreClarifyOptionsFromHydratedContext(hydratedContext, classification) {
  const storeError = (hydratedContext?.resolution?.errors ?? []).find(
    (e) =>
      e?.entityType === 'store' &&
      e?.reason === 'AMBIGUOUS' &&
      Array.isArray(e.candidates) &&
      e.candidates.length > 0,
  );
  if (!storeError) return [];

  const tool = pickString(classification?.tool) ?? 'general_chat';
  const baseParams =
    classification?.parameters && typeof classification.parameters === 'object' && !Array.isArray(classification.parameters)
      ? classification.parameters
      : {};

  return storeError.candidates
    .map((c) => {
      const id = pickString(c?.id);
      const name = pickString(c?.name);
      if (!id || !name) return null;
      return {
        label: name,
        tool,
        parameters: { ...baseParams, storeId: id },
      };
    })
    .filter(Boolean);
}

/**
 * When a prior turn asked "Which store?" and the user replies with a store name, replay the original goal.
 *
 * @param {{
 *   userMessage?: string;
 *   pendingIntent?: Record<string, unknown> | null;
 *   userId?: string | null;
 * }} input
 * @returns {Promise<{ selectedTool: string; selectedParameters: Record<string, unknown>; originalGoal: string } | null>}
 */
export async function tryReplayPendingStoreSelection(input = {}) {
  const pendingIntent =
    input.pendingIntent && typeof input.pendingIntent === 'object' && !Array.isArray(input.pendingIntent)
      ? input.pendingIntent
      : null;
  const originalGoal = pickString(pendingIntent?.userMessage);
  const originalTool = pickString(pendingIntent?.originalTool, pendingIntent?.tool);
  const reply = pickString(input.userMessage);

  if (!originalGoal || !originalTool || !reply) return null;
  if (normalizeStoreMatchKey(reply) === normalizeStoreMatchKey(originalGoal)) return null;

  const inlineCandidates = [];
  if (Array.isArray(pendingIntent?.storeCandidates)) {
    inlineCandidates.push(...pendingIntent.storeCandidates);
  }
  if (Array.isArray(pendingIntent?.options)) {
    inlineCandidates.push(...pendingIntent.options);
  }

  let matched = matchStoreCandidateByReply(reply, inlineCandidates);
  if (!matched && input.userId) {
    const stores = await fetchUserStoresForDisambiguation(input.userId);
    matched = matchStoreCandidateByReply(
      reply,
      stores.map((s) => ({ id: s.id, name: s.name, label: s.name, value: s.id })),
    );
  }
  if (!matched?.id) return null;

  const baseParams =
    pendingIntent?.selectedParameters &&
    typeof pendingIntent.selectedParameters === 'object' &&
    !Array.isArray(pendingIntent.selectedParameters)
      ? pendingIntent.selectedParameters
      : {};

  return {
    selectedTool: originalTool,
    selectedParameters: { ...baseParams, storeId: matched.id, activeStoreId: matched.id },
    originalGoal,
  };
}
