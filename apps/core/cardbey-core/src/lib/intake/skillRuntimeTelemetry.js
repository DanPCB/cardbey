/**
 * Skill runtime dispatch telemetry — staging metrics for per-domain rollout.
 */

import { getDomainForIntent } from './intentDomains.js';

/**
 * @param {object} payload
 */
export function logSkillRuntimeDispatch(payload) {
  const line = {
    tag: 'SKILL_RUNTIME_DISPATCH',
    ts: new Date().toISOString(),
    result: payload.result ?? null,
    domain: payload.domain ?? getDomainForIntent(payload.userMessage ?? ''),
    skillId: payload.skillId ?? null,
    state: payload.state ?? null,
    userMessage:
      typeof payload.userMessage === 'string' ? payload.userMessage.slice(0, 200) : '',
    storeId: payload.storeId ?? null,
    userId: payload.userId ?? null,
    error: payload.error ? String(payload.error).slice(0, 200) : null,
  };
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(line));
}
