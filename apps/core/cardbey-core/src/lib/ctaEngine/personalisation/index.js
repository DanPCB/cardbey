/**
 * Journey personalisation — completion + dismiss memory (in-process Phase 1).
 */

/** @type {Map<string, Set<string>>} subjectKey → completed capability ids */
const completedBySubject = new Map();
/** @type {Map<string, Set<string>>} subjectKey → dismissed variant ids */
const dismissedBySubject = new Map();

/**
 * @param {string | null | undefined} subjectKey  userId | sessionId | guest:*
 */
function key(subjectKey) {
  return String(subjectKey || 'anonymous').trim() || 'anonymous';
}

/**
 * @param {string} subjectKey
 * @param {string} capabilityId
 */
export function markCapabilityCompleted(subjectKey, capabilityId) {
  const k = key(subjectKey);
  const set = completedBySubject.get(k) ?? new Set();
  set.add(String(capabilityId));
  completedBySubject.set(k, set);
}

/**
 * @param {string} subjectKey
 * @param {string} variantId
 */
export function dismissCta(subjectKey, variantId) {
  const k = key(subjectKey);
  const set = dismissedBySubject.get(k) ?? new Set();
  set.add(String(variantId));
  dismissedBySubject.set(k, set);
}

/**
 * Merge durable memory into a context object.
 * @param {Partial<import('../sharedTypes/index.js').CtaSemanticContext>} ctx
 * @param {string} subjectKey
 */
export function applyPersonalisation(ctx, subjectKey) {
  const k = key(subjectKey);
  const completed = [...(completedBySubject.get(k) ?? [])];
  const dismissed = [...(dismissedBySubject.get(k) ?? [])];
  return {
    ...ctx,
    completedCapabilityIds: [...new Set([...(ctx.completedCapabilityIds || []), ...completed])],
    dismissedCtaIds: [...new Set([...(ctx.dismissedCtaIds || []), ...dismissed])],
  };
}

/** @internal */
export function _resetPersonalisationForTests() {
  completedBySubject.clear();
  dismissedBySubject.clear();
}
