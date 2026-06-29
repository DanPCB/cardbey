/**
 * Deterministic next-step rules for post–store-build missions (no LLM).
 */
/** @typedef {{ tool: string, ui: string | null, label: string, prompt: string, rationale?: string, actionId?: string }} NextStep */

/** @param {{ step: NextStep & { actionId?: string } }} r */
function ruleDoneKey(r) {
  const t = String(r.step.tool ?? '').trim();
  const a = r.step.actionId != null ? String(r.step.actionId).trim() : '';
  return a ? `${t}:${a}` : t;
}

const RULES = [
  {
    id: 'upload_logo',
    priority: 10,
    condition: (f) => !f.hasLogo && !f.logoSkipped,
    step: {
      tool: 'upload_store_asset',
      ui: 'logo_upload',
      label: 'Upload logo & avatar →',
      prompt: 'I want to upload a logo and avatar for my store',
      rationale: 'No logo uploaded yet',
    },
  },
  {
    id: 'change_hero',
    priority: 9,
    condition: (f) => !f.hasCustomHero,
    step: {
      tool: 'update_store_hero',
      ui: 'hero_customizer',
      label: 'Upload hero video →',
      prompt: 'I want to upload or change my store hero background video',
      rationale: 'Hero background is still default or generic',
    },
  },
  {
    id: 'change_headline',
    priority: 8,
    condition: (f) => Boolean(f.storeId || f.draftId),
    step: {
      tool: 'change_hero_headline',
      ui: 'headline_editor',
      label: 'Change headline →',
      prompt: 'I want to change my store headline and tagline',
      rationale: 'Personalize your store message',
    },
  },
  {
    id: 'add_real_products',
    priority: 7,
    condition: (f) => Boolean(f.storeId) && !f.hasRealProducts,
    step: {
      tool: 'replace_store_catalog',
      ui: 'product_import',
      label: 'Add real menu items →',
      prompt: 'I want to add my real products to my store catalog',
      rationale: 'Catalog still looks like placeholders',
    },
  },
  {
    id: 'publish_store',
    priority: 6,
    condition: (f) => Boolean(f.storeId) && !f.isPublished,
    step: {
      tool: 'publish_store',
      ui: null,
      label: 'Publish my store →',
      prompt: 'I want to publish my store',
      rationale: 'Store is ready but not yet published',
    },
  },
  {
    id: 'custom_domain',
    priority: 6,
    condition: (f) => f.isPublished && !f.hasCustomDomain,
    step: {
      tool: 'general_chat',
      ui: null,
      actionId: 'custom_domain',
      label: 'Set custom domain →',
      prompt: 'I want to set a custom domain for my store',
      rationale: 'Store is live — connect a custom domain when ready',
    },
  },
  {
    id: 'run_promotion',
    priority: 5,
    condition: (f) => f.isPublished && f.hasRealProducts,
    step: {
      tool: 'launch_campaign',
      ui: null,
      label: 'Run a promotion →',
      prompt: 'I want to run a promotion for my store',
      rationale: 'Store is live with real products — ready to market',
    },
  },
  {
    id: 'view_analytics',
    priority: 4,
    condition: (f) => f.isPublished,
    step: {
      tool: 'analyze_store',
      ui: null,
      label: 'View store analytics →',
      prompt: 'Show me how my store is performing',
      rationale: 'Store is live — review performance',
    },
  },
];

/**
 * @param {Awaited<ReturnType<typeof import('./buildMissionFactSnapshot.js').buildMissionFactSnapshot>>} facts
 * @param {number} [maxSteps]
 * @returns {NextStep[]}
 */
export function evaluateNextStepPolicy(facts, maxSteps = 3) {
  const done = new Set(facts.completedActions ?? []);
  const pickedKeys = new Set();
  const sorted = [...RULES].sort((a, b) => b.priority - a.priority);
  /** @type {NextStep[]} */
  const out = [];
  for (const r of sorted) {
    if (out.length >= maxSteps) break;
    if (!r.condition(facts)) continue;
    const key = ruleDoneKey(r);
    if (done.has(key)) continue;
    if (pickedKeys.has(key)) continue;
    pickedKeys.add(key);
    const { actionId, ...rest } = r.step;
    out.push({
      ...rest,
      ...(actionId ? { actionId } : {}),
    });
  }
  return out;
}
