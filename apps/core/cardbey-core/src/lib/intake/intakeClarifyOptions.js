/**
 * Contextual clarify chips — keyword + registry proximity, no generic-only fallbacks.
 */

import { INTAKE_TOOL_REGISTRY, getToolEntry, isRegisteredTool } from './intakeToolRegistry.js';

const PCT_RE = /(\d+(?:\.\d+)?)\s*%/i;

function tokenize(lower) {
  return lower
    .split(/[^a-z0-9%]+/i)
    .map((t) => t.trim())
    .filter((t) => t.length > 2);
}

/**
 * @param {string} toolName
 * @param {string} userMessage
 * @param {string} locale
 */
function labelForTool(toolName, userMessage, locale) {
  const entry = getToolEntry(toolName);
  const labelBase = entry?.label ?? toolName;
  const lower = userMessage.toLowerCase();
  const pct = userMessage.match(PCT_RE);

  if (toolName === 'create_offer' && pct) {
    return locale === 'vi'
      ? `Tạo ưu đãi giảm ${pct[1]}%`
      : `Create a ${pct[1]}% discount offer`;
  }
  if (toolName === 'orders_report') {
    return locale === 'vi' ? 'Xem báo cáo bán hàng' : 'View sales / orders report';
  }
  if (toolName === 'code_fix') {
    return locale === 'vi' ? 'Sửa nội dung / văn bản' : 'Fix headline or text';
  }
  if (toolName === 'create_promotion') {
    return locale === 'vi' ? 'Tạo khuyến mãi' : 'Create a promotion';
  }
  if (toolName === 'launch_campaign') {
    return locale === 'vi' ? 'Chạy chiến dịch' : 'Launch a campaign';
  }
  if (toolName === 'smart_visual') {
    return locale === 'vi' ? 'Tạo hình ảnh / moodboard' : 'Generate a visual';
  }
  if (toolName === 'signage.list-devices') {
    return locale === 'vi' ? 'Xem màn hình cửa hàng' : 'List in-store screens';
  }
  if (toolName === 'signage.publish-to-devices') {
    return locale === 'vi' ? 'Đẩy nội dung lên màn hình' : 'Push content to screens';
  }
  if (/\b(store|shop|analyze)\b/.test(lower) && toolName === 'analyze_store') {
    return locale === 'vi' ? 'Phân tích cửa hàng' : 'Analyze my store';
  }
  return locale === 'vi' ? `Chạy: ${labelBase}` : `Use ${labelBase}`;
}

function scoreEntry(entry, tokens, lower, seedTools) {
  let s = 0;
  if (seedTools.includes(entry.toolName)) s += 8;
  const examples = entry.examples ?? [];
  for (const ex of examples) {
    const el = String(ex).toLowerCase();
    for (const t of tokens) {
      if (t.length > 3 && el.includes(t)) s += 3;
    }
  }
  const desc = String(entry.semanticDescription ?? '').toLowerCase();
  for (const t of tokens) {
    if (t.length > 4 && desc.includes(t)) s += 1;
  }
  if (entry.toolName === 'create_offer' && PCT_RE.test(lower)) s += 6;
  if (entry.toolName === 'orders_report' && /\b(report|sales|revenue|orders)\b/.test(lower)) s += 6;
  if (entry.toolName === 'code_fix' && /\b(headline|title|text|fix|rewrite)\b/.test(lower)) s += 6;
  if (entry.executionPath === 'chat') s -= 2;
  return s;
}

/**
 * @param {{ userMessage: string, locale?: string, seedTools?: string[], limit?: number }} args
 * @returns {Array<{ label: string, tool: string, parameters: Record<string, unknown> }>}
 */
export function buildContextualClarifyOptions(args) {
  const userMessage = String(args?.userMessage ?? '').trim();
  const locale = String(args?.locale ?? 'en');
  const limit = Math.min(Math.max(Number(args?.limit) || 3, 2), 3);
  const seedTools = Array.isArray(args?.seedTools) ? args.seedTools.filter((t) => isRegisteredTool(t)) : [];

  const lower = userMessage.toLowerCase();
  const tokens = tokenize(lower);

  const ranked = INTAKE_TOOL_REGISTRY.filter((e) => e.executionPath !== 'chat' || e.toolName === 'general_chat')
    .map((e) => ({ e, s: scoreEntry(e, tokens, lower, seedTools) }))
    .filter((x) => x.e.toolName !== 'general_chat')
    .sort((a, b) => b.s - a.s);

  const out = [];
  const seen = new Set();

  for (const seed of seedTools) {
    if (out.length >= limit) break;
    if (!isRegisteredTool(seed) || seen.has(seed)) continue;
    seen.add(seed);
    out.push({
      label: labelForTool(seed, userMessage, locale),
      tool: seed,
      parameters: {},
    });
  }

  for (const { e, s } of ranked) {
    if (out.length >= limit) break;
    if (s < 1 && out.length > 0) break;
    if (seen.has(e.toolName)) continue;
    seen.add(e.toolName);
    out.push({
      label: labelForTool(e.toolName, userMessage, locale),
      tool: e.toolName,
      parameters: {},
    });
  }

  while (out.length < 2) {
    const fallback =
      !seen.has('orders_report') && isRegisteredTool('orders_report')
        ? 'orders_report'
        : !seen.has('create_promotion') && isRegisteredTool('create_promotion')
          ? 'create_promotion'
          : 'analyze_store';
    if (seen.has(fallback)) break;
    seen.add(fallback);
    out.push({
      label: labelForTool(fallback, userMessage, locale),
      tool: fallback,
      parameters: {},
    });
  }

  if (out.length < 2 && isRegisteredTool('general_chat')) {
    out.push({
      label: locale === 'vi' ? 'Hỏi thêm chi tiết' : 'Ask a different question',
      tool: 'general_chat',
      parameters: { response: userMessage },
    });
  }

  return out.slice(0, limit);
}

/**
 * Build clarify chips from resolver candidate tools (ontology-aligned).
 * @param {{ candidateTools?: string[] }} resolution
 * @param {string} userMessage
 * @param {string} locale
 * @param {number} [limit]
 * @returns {Array<{ label: string, tool: string, parameters: Record<string, unknown> }>}
 */
export function buildClarifyOptionsFromResolution(resolution, userMessage, locale, limit = 3) {
  const tools = (resolution?.candidateTools || []).filter((t) => isRegisteredTool(t)).slice(0, limit);
  if (tools.length === 0) return [];
  return tools.map((t) => ({
    label: labelForTool(t, userMessage, locale),
    tool: t,
    parameters: {},
  }));
}

/**
 * Prefer resolver candidates, then contextual keyword ranking; max `limit` options.
 * @param {{ candidateTools?: string[] }} resolution
 * @param {string} userMessage
 * @param {string} locale
 * @param {string[]} [extraSeedTools]
 * @param {number} [limit]
 */
export function mergeClarifyOptionsFromResolution(resolution, userMessage, locale, extraSeedTools = [], limit = 3) {
  const fromRes = buildClarifyOptionsFromResolution(resolution, userMessage, locale, limit);
  const seeds = [...(resolution?.candidateTools || []).filter((t) => isRegisteredTool(t)), ...extraSeedTools].filter(
    Boolean,
  );
  const ctx = buildContextualClarifyOptions({ userMessage, locale, seedTools: seeds, limit });
  const seen = new Set();
  const out = [];
  for (const o of [...fromRes, ...ctx]) {
    if (seen.has(o.tool)) continue;
    seen.add(o.tool);
    out.push(o);
    if (out.length >= limit) break;
  }
  return out.slice(0, limit);
}
