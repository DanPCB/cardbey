/**
 * Shared honest executor for campaign/display tools that generate in-memory content
 * without persistence. Validates output before returning status: 'ok'.
 */

/**
 * @param {unknown} result
 * @returns {boolean}
 */
export function isEmptyGeneratedResult(result) {
  if (result == null) return true;
  if (Array.isArray(result)) return result.length === 0;
  if (typeof result === 'string') return !result.trim();
  if (typeof result === 'object') return Object.keys(result).length === 0;
  return false;
}

/**
 * @param {unknown} result
 * @returns {number}
 */
export function defaultRecordsGenerated(result) {
  if (Array.isArray(result)) return result.length;
  return 1;
}

/**
 * @typedef {object} ContentValidation
 * @property {boolean} blocked
 * @property {string} [reason]
 * @property {string} [message]
 */

/**
 * @param {object} options
 * @param {string} options.toolName
 * @param {object} [options.input]
 * @param {object} [options.context]
 * @param {(input: object, context: object) => Promise<unknown>|unknown} options.processor
 * @param {(result: unknown) => boolean} [options.isEmpty] — default isEmptyGeneratedResult
 * @param {(result: unknown) => ContentValidation|null|undefined} [options.validateResult]
 * @param {(result: unknown) => number|null|undefined} [options.countRecords]
 */
export async function executeContentTool({
  toolName,
  input = {},
  context = {},
  processor,
  isEmpty,
  validateResult,
  countRecords,
}) {
  try {
    const result = await processor(input, context);
    const emptyCheck = isEmpty ?? isEmptyGeneratedResult;

    if (emptyCheck(result)) {
      return {
        status: 'blocked',
        reason: 'no_content_generated',
        message: `${toolName} produced no output`,
        output: { input, partial: result ?? null },
      };
    }

    const validation = validateResult?.(result);
    if (validation?.blocked) {
      return {
        status: 'blocked',
        reason: validation.reason ?? 'validation_failed',
        message: validation.message ?? `${toolName} output did not pass validation`,
        output: { partial: result },
      };
    }

    const recordsGenerated = countRecords?.(result) ?? defaultRecordsGenerated(result);
    const output =
      result != null && typeof result === 'object' && !Array.isArray(result)
        ? { ok: true, ...result, recordsGenerated }
        : { ok: true, result, recordsGenerated };

    return { status: 'ok', output };
  } catch (err) {
    console.error(`[${toolName}] failed:`, err?.message || err);
    const message = err?.message || String(err);
    return {
      status: 'failed',
      reason: 'execution_error',
      message,
      error: { code: 'EXECUTION_ERROR', message },
      output: { ok: false, error: message },
    };
  }
}
