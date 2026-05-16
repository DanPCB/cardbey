/**
 * Build durable `stepOutputs.code_fix` from intake/client StoreContentPatchV1 (no LLM, no regex detector).
 */
import { buildCanonicalCodeFixStepOutput } from './codeFixCanonicalOutput.js';
import {
  parseStoreContentPatchV1,
  STORE_CONTENT_PATCH_KIND,
  STORE_CONTENT_PATCH_VERSION,
} from './storeContentPatchContract.js';
import { logStoreContentFixIntakeStructured } from './storeContentFixMetrics.js';

/**
 * @param {{ storeContentPatch: unknown, description?: string }} params
 * @returns {{ ok: true, output: Record<string, unknown> } | null}
 */
export function tryBuildStoreContentFixOutputFromIntakePatch({ storeContentPatch, description }) {
  const parsed = parseStoreContentPatchV1(storeContentPatch);
  if (!parsed.valid) return null;

  logStoreContentFixIntakeStructured({ targetField: parsed.patch.targetField });

  const field = parsed.patch.targetField;
  const newValue = parsed.patch.newText;
  const bug =
    String(description ?? '').trim() ||
    (typeof parsed.patch.sourceDescription === 'string' ? parsed.patch.sourceDescription.trim() : '') ||
    newValue;

  const patch = {
    filePath: `store:${field}`,
    oldStr: '',
    newStr: newValue,
    description: bug,
    verified: true,
  };

  /** @type {Record<string, unknown>} */
  const canonicalPatch = {
    kind: STORE_CONTENT_PATCH_KIND,
    version: STORE_CONTENT_PATCH_VERSION,
    targetField: field,
    newText: newValue,
  };
  if (parsed.patch.sourceDescription) {
    canonicalPatch.sourceDescription = parsed.patch.sourceDescription;
  }

  const hasNewValue = Boolean(newValue);
  const confidence = 0.94;
  const unifiedDiff = hasNewValue ? `+ ${newValue}` : '';

  const canonical = buildCanonicalCodeFixStepOutput({
    phase: 'awaiting_approval',
    tool: 'code_fix',
    rootCause: bug,
    filesToChange: [`store:${field}`],
    proposedPatches: [patch],
    proposedPatchUnified: unifiedDiff,
    confidence,
  });

  return {
    ok: true,
    output: {
      ...canonical,
      rootCause: bug,
      filesToChange: [`store:${field}`],
      proposedPatch: patch,
      proposedPatches: [patch],
      proposedPatchUnified: unifiedDiff,
      confidence,
      bugDescription: bug,
      hadFileContents: false,
      isStoreContentFix: true,
      storeContentPatch: canonicalPatch,
    },
  };
}
