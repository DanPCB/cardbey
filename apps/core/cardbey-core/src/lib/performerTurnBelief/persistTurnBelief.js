/**
 * Persist TurnBelief snapshot onto intake/mission context objects (no DB migration).
 *
 * @module performerTurnBelief/persistTurnBelief
 */

import { isTurnBelief } from './turnBelief.js';

/**
 * Deep-clone belief into a compact JSON-serializable snapshot.
 * @param {import('./turnBelief.js').TurnBelief} belief
 * @returns {import('./turnBelief.js').TurnBelief | null}
 */
export function serializeTurnBeliefSnapshot(belief) {
  if (!isTurnBelief(belief)) return null;
  return JSON.parse(JSON.stringify(belief));
}

/**
 * Write turnBelief onto context objects in-place (does not touch safeExecutionTrace).
 * @param {{
 *   turnBelief: import('./turnBelief.js').TurnBelief;
 *   intentSourceContext?: Record<string, unknown> | null;
 *   sourceContext?: Record<string, unknown> | null;
 *   missionContext?: Record<string, unknown> | null;
 * }} input
 * @returns {import('./turnBelief.js').TurnBelief | null}
 */
export function persistTurnBelief(input = {}) {
  const snapshot = serializeTurnBeliefSnapshot(input.turnBelief);
  if (!snapshot) return null;

  const write = (ctx) => {
    if (!ctx || typeof ctx !== 'object' || Array.isArray(ctx)) return;
    ctx.turnBelief = snapshot;
    ctx.turnBeliefId = snapshot.turnBeliefId;
    ctx.performerStatus = snapshot.status;
  };

  write(input.intentSourceContext);
  if (input.sourceContext && input.sourceContext !== input.intentSourceContext) {
    write(input.sourceContext);
  }
  write(input.missionContext);

  return snapshot;
}

/**
 * Persist from create-store dispatch deps (mutates deps.intentSourceContext when missing).
 * @param {Record<string, unknown>} deps
 * @param {import('./turnBelief.js').TurnBelief} turnBelief
 * @returns {import('./turnBelief.js').TurnBelief | null}
 */
export function persistTurnBeliefOnDispatchDeps(deps, turnBelief) {
  if (!deps || typeof deps !== 'object') return null;

  if (!deps.intentSourceContext || typeof deps.intentSourceContext !== 'object') {
    deps.intentSourceContext = {};
  }

  const isc = /** @type {Record<string, unknown>} */ (deps.intentSourceContext);
  const missionContext =
    (deps.missionContext && typeof deps.missionContext === 'object' ? deps.missionContext : null) ??
    (isc.missionContext && typeof isc.missionContext === 'object' ? isc.missionContext : null);

  const sourceContext =
    deps.sourceContext && typeof deps.sourceContext === 'object'
      ? deps.sourceContext
      : isc;

  return persistTurnBelief({
    turnBelief,
    intentSourceContext: isc,
    sourceContext,
    missionContext,
  });
}

/**
 * Read TurnBelief from a context bag (intentSourceContext, sourceContext, or missionContext).
 * @param {Record<string, unknown> | null | undefined} ctx
 * @returns {import('./turnBelief.js').TurnBelief | null}
 */
export function readTurnBeliefFromContext(ctx) {
  if (!ctx || typeof ctx !== 'object') return null;
  const raw = ctx.turnBelief;
  return isTurnBelief(raw) ? raw : null;
}

export default {
  serializeTurnBeliefSnapshot,
  persistTurnBelief,
  persistTurnBeliefOnDispatchDeps,
  readTurnBeliefFromContext,
};
