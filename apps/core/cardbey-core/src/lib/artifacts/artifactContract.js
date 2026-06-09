/**
 * Universal operational artifact contract (SSE mission.artifact + intake responses).
 * No usable result → no "Completed."
 */

import { randomUUID } from 'crypto';

/** @typedef {'requested' | 'processing' | 'ready' | 'failed' | 'unavailable' | 'blocked'} ArtifactStatus */

/** @typedef {'video' | 'image' | 'slideshow' | 'text_asset' | 'store' | 'campaign' | 'qr' | 'smart_object' | 'unknown'} ArtifactType */

/**
 * @typedef {Object} OperationalArtifact
 * @property {string} id
 * @property {string} [missionId]
 * @property {ArtifactType} type
 * @property {string} [subtype]
 * @property {string} title
 * @property {ArtifactStatus} status
 * @property {string} [url]
 * @property {string} [thumbnailUrl]
 * @property {string} [previewUrl]
 * @property {string} [provider]
 * @property {string} [sourceTool]
 * @property {string} [message]
 * @property {string} [error]
 * @property {boolean} [retryable]
 * @property {string} createdAt
 * @property {string} [updatedAt]
 * @property {Record<string, unknown>} [metadata]
 */

const TERMINAL_FAILURE_STATUSES = new Set(['failed', 'unavailable', 'blocked']);

/**
 * @param {unknown} raw
 * @returns {OperationalArtifact | null}
 */
export function normalizeArtifact(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = /** @type {Record<string, unknown>} */ (raw);
  const typeRaw = String(o.type ?? o.artifactType ?? 'unknown').trim().toLowerCase();
  const type = /** @type {ArtifactType} */ (
    [
      'video',
      'image',
      'slideshow',
      'text_asset',
      'store',
      'campaign',
      'qr',
      'smart_object',
    ].includes(typeRaw)
      ? typeRaw
      : 'unknown'
  );
  const statusRaw = String(o.status ?? '').trim().toLowerCase();
  let status = /** @type {ArtifactStatus} */ (
    ['requested', 'processing', 'ready', 'failed', 'unavailable', 'blocked'].includes(statusRaw)
      ? statusRaw
      : o.url || o.previewUrl
        ? 'ready'
        : 'unavailable'
  );
  const id =
    typeof o.id === 'string' && o.id.trim() ? o.id.trim() : `${type}-${randomUUID()}`;
  const now = new Date().toISOString();
  return {
    id,
    missionId: typeof o.missionId === 'string' && o.missionId.trim() ? o.missionId.trim() : undefined,
    type,
    subtype: typeof o.subtype === 'string' ? o.subtype : undefined,
    title: typeof o.title === 'string' && o.title.trim() ? o.title.trim() : defaultTitle(type),
    status,
    url: typeof o.url === 'string' ? o.url : null,
    thumbnailUrl:
      typeof o.thumbnailUrl === 'string'
        ? o.thumbnailUrl
        : typeof o.thumbnail === 'string'
          ? o.thumbnail
          : null,
    previewUrl: typeof o.previewUrl === 'string' ? o.previewUrl : null,
    provider: typeof o.provider === 'string' ? o.provider : null,
    sourceTool: typeof o.sourceTool === 'string' ? o.sourceTool : null,
    message: typeof o.message === 'string' ? o.message : null,
    error: typeof o.error === 'string' ? o.error : null,
    retryable: o.retryable === true,
    createdAt: typeof o.createdAt === 'string' && o.createdAt.trim() ? o.createdAt : now,
    updatedAt: typeof o.updatedAt === 'string' ? o.updatedAt : now,
    metadata:
      o.metadata && typeof o.metadata === 'object' && !Array.isArray(o.metadata)
        ? /** @type {Record<string, unknown>} */ (o.metadata)
        : undefined,
  };
}

/**
 * @param {ArtifactType} type
 */
function defaultTitle(type) {
  switch (type) {
    case 'video':
      return 'Promotional video';
    case 'slideshow':
      return 'Slideshow';
    case 'image':
      return 'Generated image';
    case 'text_asset':
      return 'Text asset';
    case 'campaign':
      return 'Campaign asset';
    default:
      return 'Artifact';
  }
}

/**
 * @param {Partial<OperationalArtifact> & { type: ArtifactType; status: ArtifactStatus }} fields
 * @returns {OperationalArtifact}
 */
export function createArtifact(fields) {
  const now = new Date().toISOString();
  const base = normalizeArtifact({
    id: fields.id,
    missionId: fields.missionId,
    type: fields.type,
    subtype: fields.subtype,
    title: fields.title,
    status: fields.status,
    url: fields.url ?? null,
    thumbnailUrl: fields.thumbnailUrl ?? null,
    previewUrl: fields.previewUrl ?? null,
    provider: fields.provider ?? null,
    sourceTool: fields.sourceTool ?? null,
    message: fields.message ?? null,
    error: fields.error ?? null,
    retryable: fields.retryable,
    createdAt: fields.createdAt ?? now,
    updatedAt: now,
    metadata: fields.metadata,
  });
  if (!base) {
    throw new Error('[artifactContract] createArtifact: invalid fields');
  }
  assertArtifactTruthful(base);
  return base;
}

/**
 * @param {OperationalArtifact} artifact
 */
export function isUsableArtifact(artifact) {
  if (!artifact || TERMINAL_FAILURE_STATUSES.has(artifact.status)) return false;
  if (artifact.status === 'processing' || artifact.status === 'requested') return false;
  if (artifact.status !== 'ready') return false;
  const url = String(artifact.url ?? artifact.previewUrl ?? '').trim();
  if (url) return true;
  const meta = artifact.metadata;
  if (meta && typeof meta === 'object') {
    if (meta.deck && typeof meta.deck === 'object') return true;
    if (meta.inlinePayload && typeof meta.inlinePayload === 'object') return true;
    if (Array.isArray(meta.slides) && meta.slides.length > 0) return true;
  }
  return false;
}

/**
 * @param {OperationalArtifact} artifact
 */
export function assertArtifactTruthful(artifact) {
  if (artifact.status === 'ready' && !isUsableArtifact(artifact)) {
    throw new Error(
      `[artifactContract] status=ready requires url, previewUrl, or usable inline metadata (id=${artifact.id})`,
    );
  }
  if (TERMINAL_FAILURE_STATUSES.has(artifact.status)) {
    const msg = String(artifact.message ?? artifact.error ?? '').trim();
    if (!msg) {
      throw new Error(
        `[artifactContract] status=${artifact.status} requires user-facing message (id=${artifact.id})`,
      );
    }
  }
}

/**
 * @param {Partial<OperationalArtifact> & { type: ArtifactType; missionId?: string; sourceTool?: string }} fields
 */
export function artifactProcessing(fields) {
  return createArtifact({
    ...fields,
    status: 'processing',
    message: fields.message ?? 'Processing your request…',
  });
}

/**
 * @param {Partial<OperationalArtifact> & { type: ArtifactType; missionId?: string; sourceTool?: string }} fields
 */
export function artifactReady(fields) {
  return createArtifact({
    ...fields,
    status: 'ready',
    message: fields.message ?? 'Your artifact is ready.',
  });
}

/**
 * @param {Partial<OperationalArtifact> & { type: ArtifactType; missionId?: string; sourceTool?: string }} fields
 */
export function artifactFailed(fields) {
  return createArtifact({
    ...fields,
    status: 'failed',
    retryable: fields.retryable !== false,
    message: fields.message ?? 'This operation failed.',
    error: fields.error ?? fields.message ?? 'failed',
  });
}

/**
 * @param {Partial<OperationalArtifact> & { type: ArtifactType; missionId?: string; sourceTool?: string }} fields
 */
export function artifactUnavailable(fields) {
  return createArtifact({
    ...fields,
    status: 'unavailable',
    retryable: fields.retryable !== false,
    message: fields.message ?? 'This capability is not connected yet.',
    error: fields.error ?? 'CAPABILITY_UNAVAILABLE',
  });
}

/**
 * @param {object | null | undefined} toolResult
 * @returns {string | null}
 */
export function resolveSkillExecutionSummaryMessage(toolResult) {
  const execution = toolResult?.output?.skillExecution;
  if (!execution?.stepResults || typeof execution.stepResults !== 'object') return null;
  const summaryStep = execution.stepResults.generate_execution_summary;
  const raw = summaryStep?.output;
  const out =
    raw?.output && typeof raw.output === 'object' && !Array.isArray(raw.output) ? raw.output : raw;
  const summary = typeof out?.summary === 'string' ? out.summary.trim() : '';
  return summary || null;
}

/**
 * @param {object | null | undefined} toolResult
 * @param {string} [locale]
 */
export function resolveIntakeMessageFromToolResult(toolResult, locale = 'en') {
  const artifact = normalizeArtifact(toolResult?.output?.artifact);
  if (artifact?.message) return artifact.message;
  if (toolResult?.output?.message) return String(toolResult.output.message);
  if (toolResult?.blocker?.message) return String(toolResult.blocker.message);
  if (toolResult?.error?.message) return String(toolResult.error.message);

  const skillSummary = resolveSkillExecutionSummaryMessage(toolResult);
  if (skillSummary) return skillSummary;

  if (artifact) {
    switch (artifact.status) {
      case 'processing':
        return 'I started this and will show the artifact when it is ready.';
      case 'ready':
        return locale === 'vi' ? 'Xong.' : 'Done.';
      case 'unavailable':
        return artifact.message ?? 'This capability is not connected yet.';
      case 'failed':
        return artifact.message ?? 'This failed. You can try again.';
      case 'blocked':
        return artifact.message ?? 'This action is blocked until requirements are met.';
      default:
        break;
    }
  }

  if (toolResult?.status === 'ok') {
    return locale === 'vi' ? 'Xong.' : 'Done.';
  }
  return locale === 'vi' ? 'Không thể hoàn tất.' : 'Could not complete that action.';
}

/**
 * @param {object | null | undefined} toolResult
 */
export function deriveIntakeSuccessFromToolResult(toolResult) {
  if (!toolResult) return false;
  if (toolResult.status === 'failed' || toolResult.status === 'blocked') return false;
  const artifact = normalizeArtifact(toolResult?.output?.artifact);
  if (artifact) {
    if (TERMINAL_FAILURE_STATUSES.has(artifact.status)) return false;
    if (artifact.status === 'processing' || artifact.status === 'requested') return true;
    if (artifact.status === 'ready') return isUsableArtifact(artifact);
  }
  return toolResult.status === 'ok';
}
