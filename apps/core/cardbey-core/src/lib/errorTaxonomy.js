/**
 * Error taxonomy for AgentRun failures. Backward compatible: no taxonomy present -> UI shows generic error.
 *
 * @typedef {Object} ErrorTaxonomy
 * @property {'TRANSIENT'|'DEPENDENCY'|'POLICY'|'INPUT'|'SEMANTIC'|'INTERNAL'} category
 * @property {string} code
 * @property {string} message
 * @property {boolean} retryable
 * @property {string} recommendedAction
 * @property {object} [details]
 */

const CATEGORIES = ['TRANSIENT', 'DEPENDENCY', 'POLICY', 'INPUT', 'SEMANTIC', 'INTERNAL'];

/**
 * Map a thrown error or error message to ErrorTaxonomy.
 * If no taxonomy present (legacy), UI can show generic error.
 *
 * @param {Error|string|object} err - Caught error or message
 * @param {{ agentKey?: string, runInput?: object }} [context] - Optional context (e.g. run.input for reviewer)
 * @returns {ErrorTaxonomy}
 */
function mapErrorToTaxonomy(err, context = {}) {
  const msg = err && typeof err === 'object' && err.message != null
    ? String(err.message)
    : (err && String(err)) || 'Unknown error';
  const lower = msg.toLowerCase();
  const code = (err && typeof err === 'object' && err.code) ? String(err.code) : 'UNKNOWN';

  // TRANSIENT: fetch failed, timeout, network
  if (
    /fetch\s*failed|timeout|ETIMEDOUT|ECONNREFUSED|ENOTFOUND|network\s*error|econnreset/i.test(msg) ||
    lower.includes('failed to fetch') ||
    code === 'ETIMEDOUT' || code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'ECONNRESET'
  ) {
    return {
      category: 'TRANSIENT',
      code: code !== 'UNKNOWN' ? code : 'NETWORK_ERROR',
      message: msg.slice(0, 500),
      retryable: true,
      recommendedAction: 'retry',
      details: { raw: msg.slice(0, 200) },
    };
  }

  // DEPENDENCY: API key missing, 401, auth
  if (
    /api\s*key|401|unauthorized|authentication|missing\s*(auth|token|credential)/i.test(msg) ||
    code === 'UNAUTHORIZED' || code === '401' || (err && typeof err === 'object' && err.status === 401)
  ) {
    return {
      category: 'DEPENDENCY',
      code: code !== 'UNKNOWN' ? code : 'AUTH_REQUIRED',
      message: msg.slice(0, 500),
      retryable: false,
      recommendedAction: 'configure',
      details: { raw: msg.slice(0, 200) },
    };
  }

  // POLICY: approval required
  if (/approval\s*required|requires\s*approval|waiting\s*approval/i.test(msg) || code === 'APPROVAL_REQUIRED') {
    return {
      category: 'POLICY',
      code: code !== 'UNKNOWN' ? code : 'APPROVAL_REQUIRED',
      message: msg.slice(0, 500),
      retryable: false,
      recommendedAction: 'request_approval',
      details: { raw: msg.slice(0, 200) },
    };
  }

  // INPUT: missing user inputs (budget, target, hero)
  if (
    /missing\s*(input|budget|target|hero|context)|collect\s*input|provide\s*(budget|target|inputs)/i.test(msg) ||
    code === 'MISSING_INPUT' || code === 'collect_inputs'
  ) {
    return {
      category: 'INPUT',
      code: code !== 'UNKNOWN' ? code : 'MISSING_INPUT',
      message: msg.slice(0, 500),
      retryable: false,
      recommendedAction: 'collect_inputs',
      details: { raw: msg.slice(0, 200) },
    };
  }

  // SEMANTIC: reviewer changes requested
  if (
    /changes\s*requested|revise\s*plan|plan\s*needs\s*review/i.test(msg) ||
    code === 'CHANGES_REQUESTED' || (context.runInput && context.runInput.intent === 'review_plan')
  ) {
    return {
      category: 'SEMANTIC',
      code: code !== 'UNKNOWN' ? code : 'CHANGES_REQUESTED',
      message: msg.slice(0, 500),
      retryable: false,
      recommendedAction: 'revise_plan',
      details: { raw: msg.slice(0, 200) },
    };
  }

  // INTERNAL: everything else
  return {
    category: 'INTERNAL',
    code: code !== 'UNKNOWN' ? code : 'INTERNAL_ERROR',
    message: msg.slice(0, 500),
    retryable: false,
    recommendedAction: 'contact_support',
    details: { raw: msg.slice(0, 200) },
  };
}

/**
 * Normalize taxonomy for storage (ensure category is valid, strings truncated).
 *
 * @param {ErrorTaxonomy} t
 * @returns {ErrorTaxonomy}
 */
function normalizeTaxonomy(t) {
  const category = CATEGORIES.includes(t.category) ? t.category : 'INTERNAL';
  return {
    category,
    code: String(t.code || 'UNKNOWN').slice(0, 64),
    message: String(t.message || 'Unknown error').slice(0, 500),
    retryable: Boolean(t.retryable),
    recommendedAction: String(t.recommendedAction || 'contact_support').slice(0, 64),
    ...(t.details && typeof t.details === 'object' ? { details: t.details } : {}),
  };
}

export { mapErrorToTaxonomy, normalizeTaxonomy, CATEGORIES };
