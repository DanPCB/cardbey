/**
 * Shared honest executor for booking/growth/offer analysis tools.
 * Validates output before status: 'ok'; optional persistResult for DB evidence.
 */

import {
  defaultRecordsGenerated,
  isEmptyGeneratedResult,
} from './executeContentTool.js';

/**
 * @typedef {object} AnalysisValidation
 * @property {boolean} blocked
 * @property {string} [reason]
 * @property {string} [message]
 */

/**
 * @param {object} options
 * @param {string} options.toolName
 * @param {object} [options.input]
 * @param {object} [options.context]
 * @param {(input: object, context: object) => Promise<unknown>|unknown} options.analyzer
 * @param {(result: unknown) => boolean} [options.isEmpty]
 * @param {(result: unknown) => AnalysisValidation|null|undefined} [options.validateOutput]
 * @param {(result: unknown, context: object, input: object) => Promise<unknown>|unknown} [options.persistResult]
 * @param {(result: unknown) => number|null|undefined} [options.countRecords]
 */
export async function executeAnalysisTool({
  toolName,
  input = {},
  context = {},
  analyzer,
  isEmpty,
  validateOutput,
  persistResult,
  countRecords,
}) {
  try {
    const result = await analyzer(input, context);
    const emptyCheck = isEmpty ?? isEmptyGeneratedResult;

    if (emptyCheck(result)) {
      return {
        status: 'blocked',
        reason: 'no_analysis_results',
        message: `${toolName} produced no output`,
        output: { input, partial: result ?? null },
      };
    }

    const validation = validateOutput?.(result);
    if (validation?.blocked) {
      return {
        status: 'blocked',
        reason: validation.reason ?? 'validation_failed',
        message: validation.message ?? `${toolName} output did not pass validation`,
        output: { partial: result },
      };
    }

    let savedResult = result;
    if (persistResult) {
      savedResult = await persistResult(result, context, input);
    }

    const recordsGenerated = countRecords?.(savedResult) ?? defaultRecordsGenerated(savedResult);
    const output =
      savedResult != null && typeof savedResult === 'object' && !Array.isArray(savedResult)
        ? { ok: true, ...savedResult, recordsGenerated }
        : { ok: true, result: savedResult, recordsGenerated };

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
