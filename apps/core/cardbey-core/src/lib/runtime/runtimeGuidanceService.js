/**
 * Canonical runtime guidance payloads for Performer stream rendering.
 * Distinct from prerequisites (missing) vs readiness (exists-but-incomplete).
 */

import { STORE_READINESS } from './runtimeTargetReadinessService.js';
import { RUNTIME_PREREQ_STATUS } from './runtimePrerequisiteState.js';

/** @typedef {'prerequisite' | 'readiness' | 'next_actions' | 'store_selection' | 'proactive_plan'} RuntimeGuidanceSubtype */

/**
 * @param {string} id
 * @param {string} label
 * @param {string} [intentText]
 * @param {object} [extra]
 */
export function buildGuidanceAction(id, label, intentText, extra = {}) {
  return {
    id: String(id).trim(),
    label: String(label).trim(),
    intentText: intentText ? String(intentText).trim() : label,
    kind: extra.kind === 'primary' ? 'primary' : 'ghost',
    ...(extra.storeId ? { storeId: String(extra.storeId) } : {}),
    ...(extra.action ? { action: String(extra.action) } : {}),
  };
}

const READINESS_ACTION_LABELS = {
  create_store: ['Create a store', 'Create a store'],
  select_existing_store: ['Select existing store', 'Select existing store'],
  publish_store: ['Publish store', 'Publish my store'],
  connect_domain: ['Connect custom domain', 'Connect custom domain'],
  launch_first_offer: ['Launch first offer', 'Launch first offer'],
  launch_campaign: ['Launch campaign', 'Launch a marketing campaign'],
  analyze_store: ['Analyze store', 'Analyze store content'],
  review_store_performance: ['Review performance', 'Review store performance'],
  review_store_draft: ['Review draft', 'Review my store draft'],
  connect_signage_device: ['Connect device', 'Connect a signage screen'],
  wait_for_draft: ['Wait', 'Wait for draft'],
};

/**
 * @param {string} actionId
 */
function actionFromReadinessId(actionId) {
  const pair = READINESS_ACTION_LABELS[actionId];
  if (pair) return buildGuidanceAction(actionId, pair[0], pair[1], { action: actionId });
  const label = actionId.replace(/_/g, ' ');
  return buildGuidanceAction(actionId, label, label, { action: actionId });
}

/**
 * @param {{
 *   missionId?: string|null;
 *   prerequisite?: object|null;
 *   storeCandidates?: object[];
 * }} input
 */
export function buildPrerequisiteGuidance(input) {
  const missionId = typeof input?.missionId === 'string' ? input.missionId.trim() : '';
  const prereq = input?.prerequisite && typeof input.prerequisite === 'object' ? input.prerequisite : {};
  const candidates = Array.isArray(input?.storeCandidates)
    ? input.storeCandidates
    : Array.isArray(prereq.storeCandidates)
      ? prereq.storeCandidates
      : [];

  /** @type {object[]} */
  const actions = [];
  const suggested = Array.isArray(prereq.suggestedActions) ? prereq.suggestedActions : [];

  if (suggested.includes('select_existing_store') && candidates.length > 0) {
    for (const c of candidates) {
      const sid = typeof c?.storeId === 'string' ? c.storeId.trim() : '';
      if (!sid) continue;
      const name =
        (typeof c?.name === 'string' && c.name.trim()) ||
        (typeof c?.slug === 'string' && c.slug.trim()) ||
        sid;
      actions.push(
        buildGuidanceAction(`select_store:${sid}`, `Select: ${name}`, undefined, {
          kind: 'ghost',
          action: 'select_existing_store',
          storeId: sid,
        }),
      );
    }
  }
  if (suggested.includes('create_store')) {
    actions.push(
      buildGuidanceAction('create_store', 'Create new store', 'Create a store', {
        kind: 'primary',
        action: 'create_store',
      }),
    );
  }

  const message =
    (Array.isArray(prereq.missingRequirements) &&
      typeof prereq.missingRequirements[0]?.message === 'string' &&
      prereq.missingRequirements[0].message.trim()) ||
    'This step requires a store first.';

  return {
    type: 'runtime_guidance',
    subtype: 'prerequisite',
    targetId: missionId || null,
    targetType: 'mission',
    message,
    actions,
    priority: 10,
    source: 'runtime_prerequisite_resolver',
    guidanceKey: `prerequisite:${missionId || 'unknown'}`,
    meta: { prerequisite: prereq, missionId },
  };
}

/**
 * @param {{
 *   readiness?: object|null;
 *   missionId?: string|null;
 *   storeId?: string|null;
 * }} input
 */
export function buildReadinessGuidance(input) {
  const readiness = input?.readiness && typeof input.readiness === 'object' ? input.readiness : {};
  const storeId =
    (typeof input?.storeId === 'string' && input.storeId.trim()) ||
    (typeof readiness.storeId === 'string' && readiness.storeId.trim()) ||
    null;
  const missionId = typeof input?.missionId === 'string' ? input.missionId.trim() : null;

  const message =
    (typeof readiness.guidanceMessage === 'string' && readiness.guidanceMessage.trim()) ||
    'Your store needs a next step.';

  const recommended = Array.isArray(readiness.recommendedActions) ? readiness.recommendedActions : [];
  const actions = recommended
    .filter((a) => a !== 'wait_for_draft' && a !== 'select_existing_store' && a !== 'create_store')
    .slice(0, 4)
    .map((a) => actionFromReadinessId(String(a)));

  return {
    type: 'runtime_guidance',
    subtype: 'readiness',
    targetId: storeId,
    targetType: 'store',
    message,
    actions,
    priority: 20,
    source: 'runtime_target_readiness',
    guidanceKey: `readiness:${storeId || missionId || 'unknown'}:${readiness.readinessState || 'unknown'}`,
    meta: { readinessState: readiness.readinessState ?? null, missionId },
  };
}

/**
 * @param {{
 *   storeCandidates?: object[];
 *   missionId?: string|null;
 * }} input
 */
export function buildStoreSelectionGuidance(input) {
  const candidates = Array.isArray(input?.storeCandidates) ? input.storeCandidates : [];
  const missionId = typeof input?.missionId === 'string' ? input.missionId.trim() : null;
  const actions = candidates.map((c) => {
    const sid = typeof c?.storeId === 'string' ? c.storeId.trim() : '';
    const name =
      (typeof c?.name === 'string' && c.name.trim()) ||
      (typeof c?.slug === 'string' && c.slug.trim()) ||
      sid;
    return buildGuidanceAction(`select_store:${sid}`, name, undefined, {
      action: 'select_existing_store',
      storeId: sid,
    });
  });

  return {
    type: 'runtime_guidance',
    subtype: 'store_selection',
    targetId: missionId,
    targetType: 'mission',
    message: 'Which store should I use for this mission?',
    actions,
    priority: 15,
    source: 'runtime_session',
    guidanceKey: `store_selection:${missionId || 'unknown'}`,
  };
}

/**
 * @param {{ missionId?: string|null }} [input]
 */
export function buildMissingStoreGuidance(input = {}) {
  const missionId = typeof input?.missionId === 'string' ? input.missionId.trim() : null;
  return {
    type: 'runtime_guidance',
    subtype: 'prerequisite',
    targetId: missionId,
    targetType: 'mission',
    message: 'To run this mission, you need a store first.',
    actions: [
      buildGuidanceAction('create_store', 'Create a store', 'Create a store', {
        kind: 'primary',
        action: 'create_store',
      }),
    ],
    priority: 10,
    source: 'runtime_session',
    guidanceKey: `missing_store:${missionId || 'unknown'}`,
  };
}

/**
 * @param {{
 *   labels: string[];
 *   missionId: string;
 *   message?: string;
 * }} input
 */
export function buildNextActionsGuidance(input) {
  const missionId = String(input.missionId ?? '').trim();
  const labels = Array.isArray(input.labels) ? input.labels.filter(Boolean) : [];
  return {
    type: 'runtime_guidance',
    subtype: 'next_actions',
    targetId: missionId,
    targetType: 'mission',
    message: typeof input.message === 'string' && input.message.trim() ? input.message.trim() : 'Next steps',
    actions: labels.map((label) =>
      buildGuidanceAction(`next:${label}`, label, label, { action: 'next_step', kind: 'ghost' }),
    ),
    priority: 100,
    source: 'post_build_inline_ui',
    guidanceKey: `next_actions:${missionId}`,
  };
}

/**
 * @param {{
 *   missionId?: string|null;
 *   activeStoreId?: string|null;
 *   waitingForPrerequisite?: boolean;
 *   runtimePrerequisites?: object|null;
 *   requiresStoreSelection?: boolean;
 *   storeCandidates?: object[];
 *   needsStoreFirst?: boolean;
 *   targetReadiness?: object|null;
 * }} input
 * @returns {object[]}
 */
export function resolveRuntimeGuidanceForSession(input) {
  const missionId = typeof input?.missionId === 'string' ? input.missionId.trim() : null;
  /** @type {object[]} */
  const out = [];

  if (input?.waitingForPrerequisite && input?.runtimePrerequisites) {
    out.push(
      buildPrerequisiteGuidance({
        missionId,
        prerequisite: input.runtimePrerequisites,
        storeCandidates: input.storeCandidates,
      }),
    );
    return out;
  }

  if (input?.requiresStoreSelection && Array.isArray(input.storeCandidates) && input.storeCandidates.length > 1) {
    out.push(buildStoreSelectionGuidance({ storeCandidates: input.storeCandidates, missionId }));
    return out;
  }

  if (input?.needsStoreFirst && missionId) {
    out.push(buildMissingStoreGuidance({ missionId }));
    return out;
  }

  const readiness = input?.targetReadiness;
  if (
    readiness &&
    readiness.exists === true &&
    readiness.readinessState &&
    readiness.readinessState !== STORE_READINESS.MISSING
  ) {
    const state = readiness.readinessState;
    const hasBlocking =
      Array.isArray(readiness.blockingIssues) && readiness.blockingIssues.length > 0;
    const isDraftBlocking =
      state === STORE_READINESS.DRAFT_CREATED || state === STORE_READINESS.DRAFT_READY;
    // ACTIVE / published nudges are Explore territory; omit from idle runtime session guidance.
    const skipIdleInformational =
      !missionId &&
      (state === STORE_READINESS.ACTIVE || state === STORE_READINESS.PUBLISHED);
    const skipActiveScaling = state === STORE_READINESS.ACTIVE;
    if (
      !skipActiveScaling &&
      !skipIdleInformational &&
      (hasBlocking || isDraftBlocking || missionId)
    ) {
      const g = buildReadinessGuidance({
        readiness,
        missionId,
        storeId: input?.activeStoreId ?? readiness.storeId ?? null,
      });
      if (g.actions.length > 0 || g.message) out.push(g);
    }
  }

  return out.sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));
}

export function isWaitingPrerequisiteStatus(status) {
  return String(status ?? '').trim() === RUNTIME_PREREQ_STATUS.WAITING;
}

export default {
  resolveRuntimeGuidanceForSession,
  buildPrerequisiteGuidance,
  buildReadinessGuidance,
  buildStoreSelectionGuidance,
  buildMissingStoreGuidance,
  buildNextActionsGuidance,
  buildGuidanceAction,
};
