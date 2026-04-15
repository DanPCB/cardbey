/**
 * Wave 2 — canonical MissionPipeline result shape.
 *
 * Rules:
 * - `outputsJson` is the canonical aggregate (tool keys, `_failed`, orchestra ids, `result`, etc.).
 * - `metadataJson.stepOutputs` is a legacy / parallel bucket used by performer and some clients.
 * - Dual-write mirrors into `stepOutputs` only when `PIPELINE_OUTPUT_DUAL_WRITE=true` (additive; never removes keys).
 * - OrchestratorTask → MissionPipeline status/outputs persistence: `lib/orchestraMirror.js` (not this file).
 *
 * @see docs/ORCHESTRATION_RESULT_MODEL.md
 */

/** Mirror key for non-runner orchestra store-build payloads (POST /missions/:id/run). */
export const ORCHESTRA_STORE_BUILD_STEP_KEY = 'orchestra_store_build';

export function isPipelineOutputDualWriteEnabled() {
  return String(process.env.PIPELINE_OUTPUT_DUAL_WRITE || '').trim().toLowerCase() === 'true';
}

function asObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

/**
 * Shallow merge for top-level keys of `outputsJson` (canonical).
 * @param {unknown} existingOutputs
 * @param {Record<string, unknown>} patch
 * @returns {Record<string, unknown>}
 */
export function mergeCanonicalOutputs(existingOutputs, patch) {
  const base = asObject(existingOutputs);
  const p = asObject(patch);
  return { ...base, ...p };
}

/**
 * Mirror a snapshot under `metadataJson.stepOutputs[stepKey]` without removing other keys.
 * @param {unknown} existingMetadataJson
 * @param {string} stepKey
 * @param {Record<string, unknown>} snapshot — usually same as canonical outputs slice or full outputsJson
 * @returns {Record<string, unknown>}
 */
export function mergeDualWriteMetadata(existingMetadataJson, stepKey, snapshot) {
  const meta = asObject(existingMetadataJson);
  const stepOutputs = asObject(meta.stepOutputs);
  const snap = asObject(snapshot);
  return {
    ...meta,
    stepOutputs: {
      ...stepOutputs,
      [stepKey]: { ...snap },
    },
  };
}

/**
 * Mirror runner aggregate (`outputsJson` shape) into `metadataJson.stepOutputs` by shallow-merging each tool key.
 * Preserves unrelated `metadataJson` keys and merges new tool outputs over existing `stepOutputs` keys.
 * @param {unknown} existingMetadataJson
 * @param {Record<string, unknown>} outputsToPersist — same object persisted to outputsJson
 * @returns {Record<string, unknown>}
 */
export function mergeRunnerOutputsIntoMetadataStepOutputs(existingMetadataJson, outputsToPersist) {
  const meta = asObject(existingMetadataJson);
  const stepOutputs = asObject(meta.stepOutputs);
  const persist = asObject(outputsToPersist);
  return {
    ...meta,
    stepOutputs: { ...stepOutputs, ...persist },
  };
}

/**
 * Load latest metadata from DB, then merge runner outputs into stepOutputs (avoids stale mission snapshot).
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} missionId
 * @param {unknown} metadataFallback
 * @param {Record<string, unknown>} outputsToPersist
 * @returns {Promise<Record<string, unknown>|undefined>} `metadataJson` payload or undefined if dual-write off
 */
export async function buildRunnerDualWriteMetadataJson(prisma, missionId, metadataFallback, outputsToPersist) {
  if (!isPipelineOutputDualWriteEnabled()) return undefined;
  const id = typeof missionId === 'string' ? missionId.trim() : '';
  if (!id) return undefined;
  const fresh = await prisma.missionPipeline
    .findUnique({ where: { id }, select: { metadataJson: true } })
    .catch(() => null);
  const metaSource = fresh?.metadataJson != null ? fresh.metadataJson : metadataFallback;
  return mergeRunnerOutputsIntoMetadataStepOutputs(metaSource, outputsToPersist);
}

/**
 * Build `{ outputsJson, metadataJson? }` for orchestra store-build style updates.
 * @param {{
 *   existingOutputsJson: unknown,
 *   existingMetadataJson: unknown,
 *   outputsPatch: Record<string, unknown>,
 *   dualWrite: boolean,
 * }} args
 */
export function buildStoreOrchestrationPipelineWrites({
  existingOutputsJson,
  existingMetadataJson,
  outputsPatch,
  dualWrite,
}) {
  const outputsJson = mergeCanonicalOutputs(existingOutputsJson, outputsPatch);
  if (!dualWrite) {
    return { outputsJson };
  }
  return {
    outputsJson,
    metadataJson: mergeDualWriteMetadata(
      existingMetadataJson,
      ORCHESTRA_STORE_BUILD_STEP_KEY,
      outputsJson,
    ),
  };
}

/**
 * Recover a consistent `{ outputsJson, metadataJson? }` for polling callers by merging `outputsPatch`
 * into DB `outputsJson`, and mirroring into `metadataJson.stepOutputs` when dual-write is enabled.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} missionId
 * @param {Record<string, unknown>} outputsPatch
 * @param {Record<string, unknown>|null} outputsFallback
 * @returns {Promise<{ outputsJson: Record<string, unknown>, metadataJson?: Record<string, unknown> }>}
 */
export async function recoverStoreOrchestrationPollWrites(prisma, missionId, outputsPatch, outputsFallback) {
  const id = typeof missionId === 'string' ? missionId.trim() : '';
  const patch = asObject(outputsPatch);
  const dualWrite = isPipelineOutputDualWriteEnabled();

  if (!dualWrite) {
    return { outputsJson: mergeCanonicalOutputs(outputsFallback, patch) };
  }

  const row = id
    ? await prisma.missionPipeline
        .findUnique({ where: { id }, select: { outputsJson: true, metadataJson: true } })
        .catch(() => null)
    : null;

  const baseOutputs = row?.outputsJson ?? outputsFallback ?? {};
  const baseMeta = row?.metadataJson ?? {};
  const outputsJson = mergeCanonicalOutputs(baseOutputs, patch);
  return {
    outputsJson,
    metadataJson: mergeDualWriteMetadata(baseMeta, ORCHESTRA_STORE_BUILD_STEP_KEY, outputsJson),
  };
}

