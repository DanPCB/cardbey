/**
 * code_fix — governed content/text fix proposals (approval required before apply).
 * Routes through standard tool dispatcher; no proactive-only bypass.
 */

import { EXECUTION_STATES } from '../../telemetry/executionStates.js';
import {
  runCodeFixAnalysis,
  tryBuildStoreContentFixOutputFromIntakePatch,
} from '../../../services/codeFixPerformerService.js';
import { buildCanonicalCodeFixErrorOutput } from '../../../services/codeFixCanonicalOutput.js';

const SOURCE_FILE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|cs|rb|php)$/i;

/**
 * @param {object} input
 * @param {object} [context]
 */
export async function execute(input = {}, context = {}) {
  const description =
    (typeof input?.description === 'string' ? input.description.trim() : '') ||
    (typeof input?.prompt === 'string' ? input.prompt.trim() : '') ||
    (typeof context?.intent === 'string' ? context.intent.trim() : '');

  const storeId =
    (typeof input?.storeId === 'string' ? input.storeId.trim() : '') ||
    (typeof context?.storeId === 'string' ? context.storeId.trim() : '') ||
    null;

  const userId =
    (typeof input?.userId === 'string' ? input.userId.trim() : '') ||
    (typeof context?.userId === 'string' ? context.userId.trim() : '') ||
    null;

  const filePaths = Array.isArray(input?.filePaths)
    ? input.filePaths
    : Array.isArray(context?.filePaths)
      ? context.filePaths
      : [];

  const repoContext =
    (typeof input?.repoContext === 'string' ? input.repoContext.trim() : '') ||
    (typeof context?.repoContext === 'string' ? context.repoContext.trim() : '') ||
    undefined;

  const governanceTrace = {
    bypass: true,
    reason: 'Code fixes require explicit user approval before apply',
    tool: 'code_fix',
    timestamp: new Date().toISOString(),
    userId,
    storeId,
    source: context?.source ?? 'tool_dispatcher',
  };

  if (!description) {
    return {
      status: 'blocked',
      blocker: {
        code: 'DESCRIPTION_REQUIRED',
        message: 'description is required for code fixes',
      },
      output: { executionState: EXECUTION_STATES.BLOCKED, governanceTrace },
    };
  }

  const hasSourceFilePaths = filePaths.some((p) =>
    SOURCE_FILE_EXT.test(String(p ?? '').trim()),
  );

  const intakePatch = input?.storeContentPatch ?? context?.storeContentPatch;
  const fromIntake = tryBuildStoreContentFixOutputFromIntakePatch({
    storeContentPatch: intakePatch,
    description,
  });

  if (fromIntake && !hasSourceFilePaths) {
    return {
      status: 'ok',
      output: {
        ...fromIntake.output,
        governanceTrace,
        executionState: EXECUTION_STATES.EXECUTED,
      },
    };
  }

  const analysis = await runCodeFixAnalysis({ description, filePaths, repoContext });

  if (!analysis.ok) {
    const errOut = buildCanonicalCodeFixErrorOutput(analysis.message);
    return {
      status: 'failed',
      error: {
        code: 'CODE_FIX_ANALYSIS_FAILED',
        message: analysis.message,
      },
      output: {
        ...errOut,
        governanceTrace,
        executionState: EXECUTION_STATES.FAILED,
      },
    };
  }

  return {
    status: 'ok',
    output: {
      ...analysis.output,
      governanceTrace,
      executionState: EXECUTION_STATES.EXECUTED,
    },
  };
}

export default execute;
