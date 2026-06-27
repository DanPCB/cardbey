/**

 * Feature flags for intent consolidation (P0–P3).

 * Store creation always routes through dispatchCreateStoreViaKernel (no legacy toggle).

 */



import { getDomainForIntent } from './intentDomains.js';



/**

 * Shadow executeIntent telemetry from legacy intake/mission paths.

 * Default: off. Set EXECUTE_INTENT_SHADOW=true to enable parallel planning comparison.

 * @returns {boolean}

 */

export function isExecuteIntentShadowEnabled() {

  return process.env.EXECUTE_INTENT_SHADOW === 'true';

}



/**

 * Post-classify reactPlanner ask/confirm layer (P1).

 * @returns {boolean}

 */

export function isReactPlannerPostClassifyEnabled() {

  return process.env.ENABLE_REACT_PLANNER_POST_CLASSIFY !== 'false';

}



/**

 * When RUNTIME_SKILL_RUNTIME_DOMAINS is set (comma-separated, e.g. LOYALTY,STORE),

 * skill_runtime dispatch only runs for matching intent domains.

 * @param {string | null | undefined} userMessage

 * @param {string | null | undefined} [skillId]

 * @returns {boolean}

 */

export function isSkillRuntimeDispatchAllowed(userMessage, skillId = null) {

  const allowedRaw = process.env.RUNTIME_SKILL_RUNTIME_DOMAINS?.trim();

  if (!allowedRaw) return true;



  const allowed = allowedRaw

    .split(',')

    .map((s) => s.trim().toUpperCase())

    .filter(Boolean);

  if (allowed.length === 0) return true;



  const domain = getDomainForIntent(userMessage);

  if (allowed.includes(domain)) return true;



  if (skillId) {

    const skillUpper = String(skillId).trim().toUpperCase();

    if (allowed.some((d) => skillUpper.includes(d.toLowerCase()))) return true;

  }



  return false;

}



/**

 * Fire-and-forget shadow planning — intake V2 owns NL classification; this is diagnostics only.

 * @param {object} partialIntent

 * @param {object} [options]

 */

export function scheduleExecuteIntentShadow(partialIntent, options = {}) {

  if (!isExecuteIntentShadowEnabled()) return;

  setImmediate(() => {

    import('../orchestrator/executeIntent.js')

      .then(({ executeIntent }) =>

        executeIntent(partialIntent, {

          shadow: true,

          ...options,

        }),

      )

      .catch(() => {});

  });

}


