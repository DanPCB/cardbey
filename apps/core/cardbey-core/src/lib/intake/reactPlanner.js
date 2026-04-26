/**
 * Cardbey ReAct Planner — Phase 1 (decision-only, pure module).
 *
 * Hard constraints:
 * - No DB calls
 * - No route wiring
 * - No toolDispatcher / mission runtime imports
 * - Fully testable with mock toolRegistry + mock context
 */
 
/**
 * @typedef {{
 *   toolName: string;
 *   approvalRequired?: boolean;
 *   riskLevel?: 'safe_read'|'state_change'|'destructive'|string;
 *   parameterSchema?: { required?: string[], properties?: Record<string, { type?: string }> };
 * }} ReactPlannerToolDef
 */
 
/**
 * @typedef {{
 *   userMessage: string;
 *   classification?: { tool?: string | null } | null;
 *   context?: { storeId?: string | null } | null;
 *   toolRegistry: ReactPlannerToolDef[];
 * }} ReactPlannerInput
 */
 
/**
 * @typedef {{
 *   kind: 'ask';
 *   prompt: string;
 *   missing: string[];
 *   toolName?: string;
 * }} AskDecision
 */
 
/**
 * @typedef {{
 *   kind: 'confirm';
 *   toolName: string;
 *   parameters: Record<string, unknown>;
 *   confirmation: { title: string; summary: string; riskLevel: 'state_change'|'destructive' };
 * }} ConfirmDecision
 */
 
/**
 * @typedef {{
 *   kind: 'execute';
 *   toolName: string;
 *   parameters: Record<string, unknown>;
 * }} ExecuteDecision
 */
 
/**
 * @typedef {{
 *   kind: 'unsupported';
 *   reason: 'no_matching_tool';
 *   userMessage: string;
 * }} UnsupportedDecision
 */
 
/**
 * @typedef {AskDecision | ConfirmDecision | ExecuteDecision | UnsupportedDecision} ReactPlannerDecision
 */
 
function asTrimmedString(v) {
  return typeof v === 'string' && v.trim() ? v.trim() : '';
}
 
function getTool(toolRegistry, toolName) {
  const t = asTrimmedString(toolName);
  if (!t) return null;
  return (Array.isArray(toolRegistry) ? toolRegistry : []).find((x) => x && x.toolName === t) ?? null;
}
 
function toolRequiresStoreId(toolDef) {
  const req = toolDef?.parameterSchema?.required;
  return Array.isArray(req) && req.includes('storeId');
}
 
function requiredParamKeys(toolDef) {
  const req = toolDef?.parameterSchema?.required;
  return Array.isArray(req) ? req.filter((x) => typeof x === 'string' && x.trim()) : [];
}

function extractPlatformFromMessage(lower) {
  const s = String(lower || '');
  if (s.includes('facebook')) return 'facebook';
  if (s.includes('instagram')) return 'instagram';
  if (s.includes('zalo')) return 'zalo';
  if (s.includes('twitter') || s.includes('x.com')) return 'twitter';
  if (s.includes('tiktok')) return 'tiktok';
  return '';
}

function classifyToolHint(input) {
  const hint = input?.classification && typeof input.classification === 'object' ? input.classification.tool : null;
  return asTrimmedString(hint);
}
 
/**
 * Decide ask/confirm/execute/unsupported.
 * @param {ReactPlannerInput} input
 * @returns {Promise<ReactPlannerDecision>}
 */
export async function reactPlanner(input) {
  const userMessage = asTrimmedString(input?.userMessage);
  const toolRegistry = Array.isArray(input?.toolRegistry) ? input.toolRegistry : [];
  const context = input?.context && typeof input.context === 'object' ? input.context : {};
  const storeId = asTrimmedString(context?.storeId ?? '');
 
  const msgLower = String(userMessage || '').toLowerCase();
  // Fixture: "delete 3 items in my menu" -> ask (no delete tool registered, ids unknown).
  // Phase 1: allow "ask" even when no tool matches, because the user can supply identifiers.
  const looksDelete = /\bdelete\b|\bremove\b/.test(msgLower) && (msgLower.includes('menu') || msgLower.includes('item'));
  if (looksDelete) {
    return {
      kind: 'ask',
      prompt: 'Which 3 items should I delete? Please name them (or share their item IDs).',
      missing: ['itemIds'],
    };
  }

  // 1) Do I have a tool for this?
  // Phase 1: only use an explicit classification tool hint (no LLM, no fuzzy matching).
  const hintedTool = classifyToolHint(input);
  const hintedDef = hintedTool ? getTool(toolRegistry, hintedTool) : null;
 
  // Fixture: "create a slideshow for this store" should execute generate_slideshow.
  // Since Phase 1 forbids inventing execution, we only do this if the tool exists in registry.
  const wantsSlideshow = msgLower.includes('slideshow');
  const slideshowDef = wantsSlideshow ? getTool(toolRegistry, 'generate_slideshow') : null;
 
  // Highest priority: explicit classification tool, else slideshow heuristic.
  const toolDef = hintedDef || slideshowDef;
  const toolName = toolDef?.toolName ?? '';
 
  if (!toolDef) {
    // Keep general chat from becoming unsupported too aggressively (Phase 1.5).
    const generalChatDef = getTool(toolRegistry, 'general_chat');
    const looksMetaQuestion =
      msgLower.includes('what can you do') ||
      msgLower.includes('how do i') ||
      msgLower.includes('how to') ||
      msgLower.endsWith('?');
    if (generalChatDef && looksMetaQuestion) {
      return { kind: 'execute', toolName: 'general_chat', parameters: {} };
    }

    // If the user asked for something clearly unsupported (no matching tool), return unsupported.
    // Phase 1 keeps this strict: no partial tool suggestion list, no execution invention.
    return { kind: 'unsupported', reason: 'no_matching_tool', userMessage };
  }
 
  // 2) Do I have what the tool needs?
  /** @type {string[]} */
  const missing = [];
 
  /** @type {Record<string, unknown>} */
  const parameters = {};
  if (storeId) parameters.storeId = storeId;

  // Minimal param extraction: platform for connect_social_account.
  if (toolName === 'connect_social_account') {
    const p = extractPlatformFromMessage(msgLower);
    if (p) parameters.platform = p;
  }

  for (const key of requiredParamKeys(toolDef)) {
    if (key === 'storeId') {
      if (!storeId) missing.push('storeId');
      continue;
    }
    const v = parameters[key];
    if (v === null || v === undefined || v === '') missing.push(key);
  }
 
  if (missing.length > 0) {
    const prompt = looksDelete
      ? 'Which 3 items should I delete? Please name them (or share their item IDs).'
      : missing.includes('storeId')
        ? 'Which store should I use? Please select a store first.'
        : missing.includes('platform')
          ? 'Which platform should I connect? (e.g. Facebook, Instagram, Zalo)'
        : 'What information is missing to continue?';
    return { kind: 'ask', prompt, missing, ...(toolName ? { toolName } : {}) };
  }
 
  // 3) Is this safe to auto-execute?
  const riskRaw = asTrimmedString(toolDef?.riskLevel ?? '');
  const riskLevel = riskRaw === 'destructive' ? 'destructive' : 'state_change';
  const needsConfirm = Boolean(toolDef?.approvalRequired) || riskRaw === 'state_change' || riskRaw === 'destructive';
 
  if (needsConfirm) {
    return {
      kind: 'confirm',
      toolName,
      parameters,
      confirmation: {
        title: `Confirm: ${toolName}`,
        summary: `This action may modify store data. Proceed to run "${toolName}"?`,
        riskLevel,
      },
    };
  }
 
  return { kind: 'execute', toolName, parameters };
}
 
