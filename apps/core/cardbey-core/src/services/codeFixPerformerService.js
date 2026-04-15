/**
 * LLM-backed code fix proposal for Performer proactive runway (no disk writes).
 * Uses llmGateway (default: xAI grok; override via CODE_FIX_PROVIDER / CODE_FIX_MODEL).
 *
 * Two execution paths:
 *   1. Store content fix — detected from description keywords, no LLM/filesystem needed.
 *      patch.filePath = "store:<field>" sentinel → confirm route calls applyStoreContentPatch.
 *   2. Source code fix — LLM analysis, reads relevant files, proposes unified diff.
 *      patch.filePath = real monorepo-relative path → confirm route calls applySrcPatchWrite.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { llmGateway } from '../lib/llm/llmGateway.ts';
import { buildRepoLayoutSnippet, getMonorepoRoot } from '../lib/dev/repoLayoutSnippet.js';
import { buildCanonicalCodeFixStepOutput } from './codeFixCanonicalOutput.js';
import { detectStoreContentFix } from './storeContentFixDetect.js';
import { buildStoreContentPatchV1FromLegacyDetect } from './storeContentPatchContract.js';
import { logStoreContentFixLegacyRegexDetector } from './storeContentFixMetrics.js';

export { tryBuildStoreContentFixOutputFromIntakePatch } from './storeContentFixFromIntakePatch.js';

const MAX_FILE_SIZE_CHARS = 8000;
const MAX_FILES_TO_READ = 4;

// ── Filesystem helpers ───────────────────────────────────────────────────────

/**
 * True if `candidateAbs` is inside `rootAbs` (prevents path traversal).
 * @param {string} rootAbs
 * @param {string} candidateAbs
 */
function isPathInsideMonorepo(rootAbs, candidateAbs) {
  const root = path.resolve(rootAbs);
  const abs = path.resolve(candidateAbs);
  const rel = path.relative(root, abs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return false;
  return true;
}

/**
 * Read source files from the monorepo and return formatted content blocks.
 * Skips files that don't exist or are outside the monorepo root (safety).
 * @param {string[]} filePaths
 * @param {string} monorepoRoot
 * @returns {Promise<string>}
 */
async function readRelevantFiles(filePaths, monorepoRoot) {
  if (!Array.isArray(filePaths) || filePaths.length === 0) return '';

  const root = path.resolve(monorepoRoot);
  const results = [];
  const toRead = filePaths.slice(0, MAX_FILES_TO_READ);

  for (const raw of toRead) {
    const relPath = String(raw ?? '')
      .trim()
      .replace(/^[/\\]+/, '');
    if (!relPath) continue;

    try {
      const abs = path.resolve(root, relPath);
      if (!isPathInsideMonorepo(root, abs)) {
        results.push(`### ${relPath}\n[SKIPPED: path outside monorepo root]`);
        continue;
      }

      const content = await fs.readFile(abs, 'utf8');
      const truncated =
        content.length > MAX_FILE_SIZE_CHARS
          ? `${content.slice(0, MAX_FILE_SIZE_CHARS)}\n... [truncated]`
          : content;

      results.push(`### ${relPath}\n\`\`\`\n${truncated}\n\`\`\``);
    } catch (err) {
      const code = err && typeof err === 'object' && 'code' in err ? err.code : null;
      results.push(`### ${relPath}\n[Could not read: ${code ?? err?.message ?? 'unknown'}]`);
    }
  }

  return results.join('\n\n');
}

// ── Patch normalisation ──────────────────────────────────────────────────────

/**
 * @param {unknown} v
 * @returns {{ filePath: string, oldStr: string, newStr: string, description?: string } | null}
 */
function normalizePatchEntry(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = /** @type {Record<string, unknown>} */ (v);
  const filePath = typeof o.filePath === 'string' ? o.filePath.trim() : '';
  const oldStr = typeof o.oldStr === 'string' ? o.oldStr : '';
  const newStr = typeof o.newStr === 'string' ? o.newStr : '';
  const description = typeof o.description === 'string' ? o.description.trim() : '';
  if (!filePath || !oldStr) return null;
  return {
    filePath,
    oldStr,
    newStr,
    ...(description ? { description } : {}),
  };
}

// ── Main export ──────────────────────────────────────────────────────────────

/**
 * Analyse a fix request and return a canonical proposal for the approval card.
 *
 * Two internal paths:
 *   • Store content fix (headline/text change) → instant structured response, no LLM.
 *   • Source code fix → LLM call + optional filesystem verification.
 *
 * @param {{ description: string, filePaths?: string[], repoContext?: string }} params
 * @returns {Promise<{ ok: true, output: Record<string, unknown> } | { ok: false, message: string }>}
 */
export async function runCodeFixAnalysis({ description, filePaths: filePathsIn, repoContext: repoContextIn }) {
  const bug = String(description || '').trim();
  if (!bug) {
    return { ok: false, message: 'description is required' };
  }

  const filePaths = (Array.isArray(filePathsIn) ? filePathsIn : [])
    .map((p) => String(p ?? '').trim().replace(/^[/\\]+/, ''))
    .filter(Boolean);

  // ── Path 1: Store content fix (no LLM, no filesystem) ─────────────────────
  const contentFix = detectStoreContentFix(bug, filePaths);
  if (contentFix.isContentFix) {
    const { oldValue, newValue, field } = contentFix;

    logStoreContentFixLegacyRegexDetector({
      route: 'code_fix_analysis',
      field,
      hasNewText: Boolean(newValue),
      source: 'detectStoreContentFix',
    });

    const storeContentPatch = buildStoreContentPatchV1FromLegacyDetect(field, newValue, bug);

    // "store:<field>" sentinel + canonical payload; oldStr optional for store (unreliable from regex).
    const patch = {
      filePath: `store:${field}`,
      oldStr: oldValue,
      newStr: newValue,
      description: bug,
      verified: true,
    };

    const hasNewValue = Boolean(newValue);
    const confidence = hasNewValue ? 0.92 : 0.6;
    const unifiedDiff =
      hasNewValue && oldValue ? `- ${oldValue}\n+ ${newValue}` : hasNewValue ? `+ ${newValue}` : '';

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
        storeContentPatch,
      },
    };
  }

  // ── Path 2: Source code fix (LLM + optional filesystem read) ──────────────
  const repoContext =
    typeof repoContextIn === 'string' && repoContextIn.trim() ? repoContextIn.trim() : '';

  const monorepoRoot = getMonorepoRoot();
  const fileContentsBlock = await readRelevantFiles(filePaths, monorepoRoot);
  const hasFileContents = fileContentsBlock.length > 0;

  const repoLayout = buildRepoLayoutSnippet({ maxLines: 200, maxDepth: 3 });

  const systemPrompt = `You are a senior engineer working on a JavaScript/TypeScript monorepo (Cardbey).
You must propose a minimal, safe fix based on the bug report, repository layout, and any file contents provided.
Rules:
- Return ONLY valid JSON (no markdown fences, no commentary).
- Paths must be relative to the monorepo root using forward slashes.
- Every path in filesToChange and proposedPatches[].filePath must contain a /src/ segment.
- proposedPatches[].oldStr MUST be an exact verbatim substring from the file content provided above (when file contents are shown) — copy character-for-character including whitespace and indentation. If you only have layout + description, infer carefully and set confidence low if unsure.
- proposedPatches[].newStr must preserve surrounding indentation style.
- If you are not confident, set confidence below 0.4 and explain uncertainty in rootCause.

JSON shape:
{
  "rootCause": "string",
  "filesToChange": ["path/under/repo/..."],
  "proposedPatches": [
    {
      "filePath": "relative file path from repo root",
      "oldStr": "exact excerpt from file (or best effort if no file contents)",
      "newStr": "replacement",
      "description": "what this change does and why"
    }
  ],
  "proposedPatchUnified": "optional short unified-style diff text for humans",
  "confidence": 0.0
}

You may include a single patch or multiple. Prefer the smallest set of edits that fixes the bug.

Repository layout (truncated):
${repoLayout}`;

  const userMessage = `Bug description: ${bug}

${repoContext ? `Additional context:\n${repoContext}\n\n` : ''}${
    hasFileContents
      ? `## Actual file contents\n\nRead these files carefully — your proposedPatches[].oldStr must match the actual code exactly:\n\n${fileContentsBlock}\n\n`
      : `No file contents available — infer from description and repo layout.\n\n`
  }${filePaths.length > 0 ? `Files mentioned: ${filePaths.join(', ')}\n\n` : ''}Analyze this bug using the actual file contents when provided. Your proposedPatches[].oldStr MUST be an exact substring of the file content shown above when file contents are included. If you cannot find an exact match, set confidence low and explain in rootCause.

Respond with JSON only using the shape described in the system message.`;

  const combinedPrompt = `${systemPrompt}\n\n---\n\n${userMessage}`;

  const provider = process.env.CODE_FIX_PROVIDER ?? 'xai';
  const model = process.env.CODE_FIX_MODEL ?? 'grok-3-beta';

  let text = '';
  try {
    const llmResult = await llmGateway.generate({
      purpose: 'code_fix_analysis',
      prompt: combinedPrompt,
      tenantKey: 'code-fix-agent',
      model,
      provider,
      maxTokens: 2000,
      responseFormat: 'json',
      temperature: 0.1,
    });
    text = llmResult.text ?? '';
  } catch (e) {
    console.error('[codeFixPerformerService] llmGateway.generate failed', e);
    return { ok: false, message: 'code_fix_llm_failed' };
  }

  if (!text) {
    return { ok: false, message: 'code_fix_llm_failed' };
  }

  /** @type {Record<string, unknown> | null} */
  let analysisResult = null;
  try {
    analysisResult = JSON.parse(String(text).replace(/```json|```/g, '').trim());
  } catch {
    return { ok: false, message: 'code_fix_invalid_json' };
  }

  const parsed =
    analysisResult && typeof analysisResult === 'object' && !Array.isArray(analysisResult)
      ? analysisResult
      : null;
  if (!parsed) {
    return { ok: false, message: 'code_fix_invalid_json' };
  }

  const rootCause = typeof parsed.rootCause === 'string' ? parsed.rootCause : '';
  const filesToChange = Array.isArray(parsed.filesToChange)
    ? parsed.filesToChange.map((x) => String(x ?? '').trim()).filter(Boolean)
    : [];

  /** @type {Array<{ filePath: string, oldStr: string, newStr: string, description?: string }>} */
  let patchList = [];
  if (Array.isArray(parsed.proposedPatches)) {
    for (const p of parsed.proposedPatches) {
      const n = normalizePatchEntry(p);
      if (n) patchList.push(n);
    }
  }
  const legacy =
    parsed.proposedPatch &&
    typeof parsed.proposedPatch === 'object' &&
    !Array.isArray(parsed.proposedPatch)
      ? normalizePatchEntry(parsed.proposedPatch)
      : null;
  if (patchList.length === 0 && legacy) {
    patchList = [legacy];
  }

  const proposedPatchUnified =
    typeof parsed.proposedPatchUnified === 'string' ? parsed.proposedPatchUnified : '';
  let confidence =
    typeof parsed.confidence === 'number' && Number.isFinite(parsed.confidence)
      ? parsed.confidence
      : 0;

  if (!rootCause || patchList.length === 0) {
    return { ok: false, message: 'code_fix_incomplete_response' };
  }

  // ── Filesystem verification (only when file contents were provided) ────────
  /** @type {Array<Record<string, unknown>>} */
  let proposedPatchesOut = patchList.map((p) => ({ ...p }));

  if (hasFileContents && patchList.length > 0) {
    const root = path.resolve(monorepoRoot);
    proposedPatchesOut = [];
    for (const patch of patchList) {
      const relPath = patch.filePath;
      try {
        const abs = path.resolve(root, relPath.replace(/^[/\\]+/, ''));
        if (!isPathInsideMonorepo(root, abs)) {
          proposedPatchesOut.push({
            ...patch,
            verified: false,
            verificationNote: 'path outside monorepo root',
          });
          continue;
        }
        const content = await fs.readFile(abs, 'utf8').catch(() => null);
        if (content && content.includes(patch.oldStr)) {
          proposedPatchesOut.push({ ...patch, verified: true });
        } else {
          proposedPatchesOut.push({
            ...patch,
            verified: false,
            verificationNote: content
              ? 'oldStr not found in file — patch may be inaccurate'
              : 'file not readable for verification',
          });
        }
      } catch {
        proposedPatchesOut.push({
          ...patch,
          verified: false,
          verificationNote: 'verification failed',
        });
      }
    }

    const anyUnverified = proposedPatchesOut.some((p) => !p.verified);
    if (anyUnverified && confidence >= 0.8) {
      confidence = Math.min(confidence, 0.65);
    }
  }

  // ── Build primary patch ───────────────────────────────────────────────────
  const firstVerified = hasFileContents
    ? proposedPatchesOut.find((p) => p.verified === true)
    : null;
  const primary = firstVerified || proposedPatchesOut[0];

  const proposedPatch = {
    filePath: String(primary.filePath || '').trim(),
    oldStr: typeof primary.oldStr === 'string' ? primary.oldStr : '',
    newStr: typeof primary.newStr === 'string' ? primary.newStr : '',
    ...(typeof primary.description === 'string' && primary.description
      ? { description: primary.description }
      : {}),
    ...(hasFileContents && typeof primary.verified === 'boolean'
      ? { verified: primary.verified }
      : {}),
    ...(hasFileContents &&
    typeof primary.verificationNote === 'string' &&
    primary.verificationNote
      ? { verificationNote: primary.verificationNote }
      : {}),
  };

  if (!proposedPatch.filePath || !proposedPatch.oldStr) {
    return { ok: false, message: 'code_fix_incomplete_response' };
  }

  // ── Build canonical output ────────────────────────────────────────────────
  const canonical = buildCanonicalCodeFixStepOutput({
    phase: 'awaiting_approval',
    tool: 'code_fix',
    rootCause,
    filesToChange,
    proposedPatches: proposedPatchesOut,
    proposedPatchUnified,
    confidence,
  });

  return {
    ok: true,
    output: {
      ...canonical,
      rootCause,
      filesToChange,
      proposedPatch,
      proposedPatches: proposedPatchesOut,
      proposedPatchUnified,
      confidence,
      bugDescription: bug,
      hadFileContents: hasFileContents,
      isStoreContentFix: false,
    },
  };
}

// ── Re-exports for callers that import from this module ──────────────────────
export {
  CODE_FIX_NATIVE_CONSTRAINTS,
  buildCanonicalCodeFixStepOutput,
  buildCanonicalCodeFixErrorOutput,
  resolveCodeFixProposedPatchForApply,
} from './codeFixCanonicalOutput.js';
export { detectStoreContentFix } from './storeContentFixDetect.js';