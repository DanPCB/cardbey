/**
 * qa_campaign_package — Validate campaign brief, graphics, and copy completeness.
 */

/**
 * @param {object} [input]
 * @param {object} [input.brief]
 * @param {object[]} [input.graphics]
 * @param {object} [input.copy]
 */
export async function execute(input = {}) {
  try {
    const brief = input?.brief && typeof input.brief === 'object' ? input.brief : {};
    const graphics = Array.isArray(input?.graphics) ? input.graphics : [];
    const copy = input?.copy && typeof input.copy === 'object' ? input.copy : {};

    /** @type {string[]} */
    const issues = [];

    if (!String(brief?.objective ?? '').trim()) {
      issues.push('brief.objective is empty');
    }
    if (graphics.length < 1) {
      issues.push('graphics has no results');
    }
    if (!String(copy?.headline ?? '').trim()) {
      issues.push('copy.headline is empty');
    }
    if (!String(copy?.cta ?? '').trim()) {
      issues.push('copy.cta is empty');
    }

    const passed = issues.length === 0;

    return {
      status: 'ok',
      output: {
        ok: true,
        passed,
        issues,
      },
    };
  } catch (err) {
    const message = err?.message || String(err);
    return {
      status: 'failed',
      error: { code: 'QA_FAILED', message },
      output: { ok: false, passed: false, issues: [message] },
    };
  }
}

export default execute;
