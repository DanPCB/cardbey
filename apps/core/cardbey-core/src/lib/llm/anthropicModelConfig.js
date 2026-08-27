/**
 * Central Anthropic model id resolution — pass configured ids verbatim after normalization only.
 */

/** Current default Sonnet 4.6 id (no date suffix). */
export const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-4-6';

/** Fast tier for enrichment / batch synthesis (override via ANTHROPIC_FAST_MODEL). */
export const DEFAULT_ANTHROPIC_FAST_MODEL =
  String(process.env.ANTHROPIC_FAST_MODEL ?? '').trim() || DEFAULT_ANTHROPIC_MODEL;

/** @type {Record<string, string>} */
const TIER_ALIASES = {
  fast: DEFAULT_ANTHROPIC_FAST_MODEL,
  thinking: String(process.env.ANTHROPIC_THINKING_MODEL ?? '').trim() || DEFAULT_ANTHROPIC_MODEL,
};

/** @type {Record<string, string>} */
const LEGACY_MODEL_ALIASES = {
  'claude-sonnet-4-20250514': DEFAULT_ANTHROPIC_MODEL,
  'claude-sonnet-4-6-20250514': DEFAULT_ANTHROPIC_MODEL,
  'claude-claude-sonnet-4-6-20250514': DEFAULT_ANTHROPIC_MODEL,
};

let startupLogged = false;
let invalidModelWarned = false;

/**
 * Strip accidental double `claude-` prefixes and map retired ids.
 * @param {string | null | undefined} raw
 * @returns {string}
 */
export function normalizeAnthropicModelId(raw) {
  let model = String(raw ?? '').trim();
  if (!model) return DEFAULT_ANTHROPIC_MODEL;

  while (/^claude-claude-/i.test(model)) {
    model = model.replace(/^claude-/i, '');
  }

  const alias = LEGACY_MODEL_ALIASES[model];
  if (alias) return alias;

  return model;
}

/**
 * Resolve model from env overrides (ANTHROPIC_MODEL wins over LLM_DEFAULT_MODEL).
 * @param {string | null | undefined} [explicit]
 * @returns {string}
 */
export function resolveAnthropicModel(explicit) {
  const fromExplicit = typeof explicit === 'string' && explicit.trim() ? explicit.trim() : '';
  if (fromExplicit) {
    const tier = TIER_ALIASES[fromExplicit.toLowerCase()];
    if (tier) return normalizeAnthropicModelId(tier);
    return normalizeAnthropicModelId(fromExplicit);
  }

  const fromAnthropic = String(process.env.ANTHROPIC_MODEL ?? '').trim();
  if (fromAnthropic) return normalizeAnthropicModelId(fromAnthropic);

  const fromDefault = String(process.env.LLM_DEFAULT_MODEL ?? '').trim();
  if (fromDefault) return normalizeAnthropicModelId(fromDefault);

  return DEFAULT_ANTHROPIC_MODEL;
}

/** Log resolved model once at process startup. */
export function logAnthropicModelOnce() {
  if (startupLogged) return;
  startupLogged = true;
  const resolved = resolveAnthropicModel();
  console.log(`[anthropicModel] resolved model: ${resolved}`);
}

/**
 * Warn once when API returns not_found for the configured model.
 * @param {string} model
 * @param {unknown} apiError
 */
export function warnAnthropicModelNotFoundOnce(model, apiError) {
  if (invalidModelWarned) return;
  const type = apiError && typeof apiError === 'object' ? apiError.type || apiError.error?.type : null;
  const message = apiError && typeof apiError === 'object' ? apiError.message || apiError.error?.message : String(apiError ?? '');
  const blob = `${type ?? ''} ${message ?? ''}`.toLowerCase();
  if (!/not_found|model not found|invalid_model/.test(blob)) return;
  invalidModelWarned = true;
  console.error(
    `[anthropicModel] Model not found: "${model}". Set ANTHROPIC_MODEL=${DEFAULT_ANTHROPIC_MODEL} in .env and restart.`,
  );
}
