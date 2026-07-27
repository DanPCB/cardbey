/**
 * Pure helpers for `stepOutputs.code_fix` canonical shape (no LLM / fs).
 * Kept separate so tests and routes do not load `codeFixPerformerService` → llmGateway.
 */

import { parseStoreContentPatchV1 } from './storeContentPatchContract.js';

/** Native Performer step constraints (proposal-only pipeline; matches dashboard `codeFixStepContract.ts`). */
export const CODE_FIX_NATIVE_CONSTRAINTS = Object.freeze({
  proposalOnly: true,
  noFileWrites: true,
  noAutoApply: true,
});

/**
 * @param {number | null | undefined} c
 * @returns {'low' | 'medium' | 'high'}
 */
function riskLevelFromConfidence(c) {
  if (typeof c !== 'number' || !Number.isFinite(c)) return 'medium';
  if (c >= 0.72) return 'low';
  if (c >= 0.4) return 'medium';
  return 'high';
}

/**
 * @param {string} rootCause
 * @returns {string[]}
 */
function rootCauseLines(rootCause) {
  const t = String(rootCause || '').trim();
  if (!t) return [];
  const byNl = t.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  if (byNl.length > 1) return byNl;
  const bySemi = t.split(/;\s+/).map((s) => s.trim()).filter(Boolean);
  return bySemi.length > 1 ? bySemi : [t];
}

/**
 * Build canonical nested `stepOutputs.code_fix` shape for persistence (additive: callers also attach legacy flat fields).
 *
 * @param {{
 *   phase: string,
 *   tool?: string,
 *   rootCause: string,
 *   filesToChange: string[],
 *   proposedPatches: Array<Record<string, unknown>>,
 *   proposedPatchUnified: string,
 *   confidence: number,
 *   issueCategory?: string,
 *   error?: { code?: string, message?: string },
 * }} p
 * @returns {Record<string, unknown>}
 */
export function buildCanonicalCodeFixStepOutput(p) {
  const tool = typeof p.tool === 'string' && p.tool.trim() ? p.tool.trim() : 'code_fix';
  const phase = String(p.phase || 'awaiting_approval');
  const rootCause = String(p.rootCause || '').trim();
  const filesToChange = Array.isArray(p.filesToChange)
    ? p.filesToChange.map((x) => String(x ?? '').trim()).filter(Boolean)
    : [];
  const patches = Array.isArray(p.proposedPatches) ? p.proposedPatches : [];
  const proposedChanges = patches.map((patch) => {
    const d = typeof patch.description === 'string' ? patch.description.trim() : '';
    const fp = typeof patch.filePath === 'string' ? patch.filePath.trim() : '';
    return d || fp || 'Edit';
  });
  const unified = String(p.proposedPatchUnified || '').trim();
  const title =
    rootCause.length > 0
      ? rootCause.slice(0, 120) + (rootCause.length > 120 ? '…' : '')
      : 'Code fix proposal';

  /** @type {Record<string, unknown>} */
  const proposal = {
    title,
    diagnosis: rootCause || '—',
    likelyRootCause: rootCauseLines(rootCause),
    affectedFiles: filesToChange,
    proposedChanges:
      proposedChanges.length > 0
        ? proposedChanges
        : filesToChange.map((f) => `Update ${f}`),
    validationSteps: [],
    riskLevel: riskLevelFromConfidence(p.confidence),
  };
  if (unified) proposal.unifiedDiff = unified;

  /** @type {Record<string, unknown>} */
  const out = {
    phase,
    tool,
    proposal,
    constraints: { ...CODE_FIX_NATIVE_CONSTRAINTS },
  };
  if (typeof p.confidence === 'number' && Number.isFinite(p.confidence)) {
    out.confidence = p.confidence;
  }
  if (typeof p.issueCategory === 'string' && p.issueCategory.trim()) {
    out.issueCategory = p.issueCategory.trim();
  }
  if (p.error && typeof p.error === 'object') {
    out.error = {
      code: String(p.error.code || 'code_fix_error'),
      message: String(p.error.message || 'Analysis failed'),
    };
  }
  return out;
}

/**
 * Canonical error payload for failed analysis (HTTP body; optional — not always written to stepOutputs on early failure).
 *
 * @param {string} message
 * @param {string} [code]
 * @returns {Record<string, unknown>}
 */
export function buildCanonicalCodeFixErrorOutput(message, code = 'code_fix_analysis_failed') {
  const msg = String(message || '').trim() || 'Analysis failed';
  return {
    phase: 'error',
    tool: 'code_fix',
    constraints: { ...CODE_FIX_NATIVE_CONSTRAINTS },
    message: msg,
    error: { code, message: msg },
  };
}

/**
 * @param {unknown} v
 */
function asPlainObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? /** @type {Record<string, unknown>} */ (v) : {};
}

/**
 * Confirm apply: prefer canonical `storeContentPatch`; then `proposedPatch`; else `proposedPatches`.
 * Store sentinel paths (`store:…`) may omit oldStr when newStr / storeContentPatch.newText is set.
 *
 * @param {unknown} cf stepOutputs.code_fix
 * @returns {{ filePath: string, oldStr: string, newStr: string }}
 */
export function resolveCodeFixProposedPatchForApply(cf) {
  const o = asPlainObject(cf);

  const scp = parseStoreContentPatchV1(o.storeContentPatch);
  if (scp.valid) {
    const { targetField, newText } = scp.patch;
    return {
      filePath: `store:${targetField}`,
      oldStr: '',
      newStr: newText,
    };
  }

  const primary = asPlainObject(o.proposedPatch);
  const fp0 = typeof primary.filePath === 'string' ? primary.filePath.trim() : '';
  const os0 = typeof primary.oldStr === 'string' ? primary.oldStr : '';
  const ns0 = typeof primary.newStr === 'string' ? primary.newStr : '';
  if (fp0.startsWith('store:') && ns0.trim()) {
    return { filePath: fp0, oldStr: os0, newStr: ns0 };
  }
  if (fp0 && os0) {
    return {
      filePath: fp0,
      oldStr: os0,
      newStr: ns0,
    };
  }
  const list = Array.isArray(o.proposedPatches) ? o.proposedPatches : [];
  for (const item of list) {
    const p = asPlainObject(item);
    const fp = typeof p.filePath === 'string' ? p.filePath.trim() : '';
    const os = typeof p.oldStr === 'string' ? p.oldStr : '';
    const ns = typeof p.newStr === 'string' ? p.newStr : '';
    if (fp.startsWith('store:') && ns.trim()) {
      return { filePath: fp, oldStr: os, newStr: ns };
    }
    if (fp && os) {
      return {
        filePath: fp,
        oldStr: os,
        newStr: ns,
      };
    }
  }
  return { filePath: '', oldStr: '', newStr: '' };
}
