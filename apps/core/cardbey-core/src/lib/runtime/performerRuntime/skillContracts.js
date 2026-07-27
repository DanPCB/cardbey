/**
 * Performer runtime — workflow skill contracts (server mirror of dashboard catalog).
 */

export const SKILL_CONTRACT_VERSION = 1;

/** @type {Record<string, { skillId: string, label: string, description: string, status: 'active' | 'placeholder', actionTypes: string[], requiredCapabilities: string[], prerequisites: string[], steps: Array<{ capabilityId: string, order: number, tool?: string, prerequisiteKeys?: string[] }> }>} */
export const SKILL_CONTRACTS = {
  launch_first_offer: {
    skillId: 'launch_first_offer',
    label: 'Launch first offer',
    description:
      'Workflow: analyze store → select products → generate copy → draft → review → publish (advisory; execution disabled).',
    status: 'active',
    actionTypes: ['launch_first_offer'],
    requiredCapabilities: [
      'analyze_store',
      'select_offer_products',
      'generate_offer_copy',
      'create_offer_draft',
      'review_offer',
      'publish_offer',
    ],
    prerequisites: ['store', 'auth'],
    steps: [
      {
        capabilityId: 'analyze_store',
        order: 0,
        tool: 'analyze_store',
        prerequisiteKeys: ['store', 'auth'],
      },
      {
        capabilityId: 'select_offer_products',
        order: 1,
        prerequisiteKeys: ['store', 'auth'],
      },
      {
        capabilityId: 'generate_offer_copy',
        order: 2,
        prerequisiteKeys: ['store', 'auth'],
      },
      {
        capabilityId: 'create_offer_draft',
        order: 3,
        tool: 'create_offer_draft',
        prerequisiteKeys: ['store', 'auth'],
      },
      {
        capabilityId: 'review_offer',
        order: 4,
        prerequisiteKeys: ['store', 'auth'],
      },
      {
        capabilityId: 'publish_offer',
        order: 5,
        prerequisiteKeys: ['store', 'auth', 'offer_draft_approved'],
      },
    ],
  },
  setup_online_presence: {
    skillId: 'setup_online_presence',
    label: 'Setup online presence',
    description: 'Future: social accounts, listings, and storefront polish.',
    status: 'placeholder',
    actionTypes: [],
    requiredCapabilities: [],
    prerequisites: [],
    steps: [],
  },
  optimize_storefront: {
    skillId: 'optimize_storefront',
    label: 'Optimize storefront',
    description: 'Future: layout, SEO, and conversion improvements.',
    status: 'placeholder',
    actionTypes: [],
    requiredCapabilities: [],
    prerequisites: [],
    steps: [],
  },
};

/** @type {Record<string, string>} */
const ACTION_TYPE_TO_SKILL = {
  launch_first_offer: 'launch_first_offer',
};

/**
 * @param {string} skillId
 */
export function getSkillContract(skillId) {
  const id = typeof skillId === 'string' ? skillId.trim() : '';
  return id ? SKILL_CONTRACTS[id] ?? null : null;
}

/**
 * @param {string} actionType
 */
export function resolveSkillContractForActionType(actionType) {
  const at = typeof actionType === 'string' ? actionType.trim() : '';
  if (!at) return null;
  const skillId = ACTION_TYPE_TO_SKILL[at];
  return skillId ? getSkillContract(skillId) : null;
}

/**
 * @param {object} plan
 * @param {object} contract
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function validatePlanAgainstSkillContract(plan, contract) {
  if (!contract || contract.status === 'placeholder') {
    return { ok: false, reason: 'skill_placeholder' };
  }
  if (!plan || typeof plan !== 'object') {
    return { ok: false, reason: 'plan_required' };
  }
  const steps = Array.isArray(plan.steps) ? plan.steps : [];
  const template = Array.isArray(contract.steps) ? contract.steps : [];
  if (template.length === 0) {
    return { ok: false, reason: 'skill_has_no_steps' };
  }
  if (steps.length !== template.length) {
    return { ok: false, reason: 'step_count_mismatch' };
  }
  for (let i = 0; i < template.length; i += 1) {
    const expected = template[i];
    const actual = steps[i];
    const expectedCap =
      expected && typeof expected === 'object' ? String(expected.capabilityId ?? '').trim() : '';
    const actualCap =
      actual && typeof actual === 'object' ? String(actual.capabilityId ?? '').trim() : '';
    if (expectedCap && actualCap && expectedCap !== actualCap) {
      return { ok: false, reason: `capability_mismatch:${expectedCap}:${actualCap}` };
    }
  }
  return { ok: true };
}
