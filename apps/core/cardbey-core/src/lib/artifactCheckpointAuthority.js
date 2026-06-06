/**
 * Central authority for artifact-required mission checkpoints.
 * A checkpoint resolves only when required artifact payload exists or user explicitly skips.
 */

/** Stable English values — conditionals and UI must match these literals. */
export const ARTIFACT_DEFERRED_RESPONSES = new Set([
  'Upload now',
  'Upload file',
  'Choose from library',
  'Choose asset',
]);

export const ARTIFACT_SKIP_RESPONSES = new Set(['Skip', 'Skip for now']);

/** outputKey → any of these data fields satisfies the artifact requirement. */
export const ARTIFACT_PAYLOAD_FIELDS_BY_OUTPUT_KEY = {
  logoChoice: ['logoUrl'],
  heroImageChoice: ['heroImageUrl', 'heroUrl', 'assetUrl', 'imageUrl'],
  heroVideoChoice: ['heroVideoUrl', 'videoUrl', 'assetUrl'],
  graphicChoice: ['graphicUrl', 'assetUrl', 'imageUrl'],
  contentChoice: ['contentUrl', 'assetUrl', 'imageUrl'],
  fileChoice: ['fileId', 'fileUrl', 'assetUrl'],
};

export function artifactPayloadFieldsForOutputKey(outputKey) {
  const key = String(outputKey ?? '').trim();
  if (!key) return [];
  const direct = ARTIFACT_PAYLOAD_FIELDS_BY_OUTPUT_KEY[key];
  if (direct) return direct;
  if (key.endsWith('Choice') || key.endsWith('Asset')) {
    return ['assetUrl', 'assetId', 'fileId', 'fileUrl', 'logoUrl', 'imageUrl', 'videoUrl'];
  }
  return [];
}

export function isArtifactCheckpointOutputKey(outputKey) {
  return artifactPayloadFieldsForOutputKey(outputKey).length > 0;
}

export function readArtifactPayloadValue(data = {}, fields = []) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return '';
  for (const field of fields) {
    const v = data[field];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  }
  return '';
}

export function isExplicitArtifactSkip(response, data = {}) {
  const responseStr = typeof response === 'string' ? response.trim() : '';
  if (ARTIFACT_SKIP_RESPONSES.has(responseStr)) return true;
  const status = typeof data.artifactUploadStatus === 'string' ? data.artifactUploadStatus.trim() : '';
  if (status === 'skipped') return true;
  const logoStatus = typeof data.logoUploadStatus === 'string' ? data.logoUploadStatus.trim() : '';
  return logoStatus === 'skipped';
}

export function isArtifactCheckpointResolved(outputKey, response, data = {}, stepOutput = {}) {
  const fields = artifactPayloadFieldsForOutputKey(outputKey);
  if (!fields.length) return true;
  if (isExplicitArtifactSkip(response, data)) return true;
  const merged = { ...(stepOutput && typeof stepOutput === 'object' ? stepOutput : {}), ...data };
  return Boolean(readArtifactPayloadValue(merged, fields));
}

export function isArtifactCheckpointDeferredRespond(outputKey, response, data = {}) {
  const fields = artifactPayloadFieldsForOutputKey(outputKey);
  if (!fields.length) return false;
  const responseStr = typeof response === 'string' ? response.trim() : '';
  if (!ARTIFACT_DEFERRED_RESPONSES.has(responseStr)) return false;
  if (isExplicitArtifactSkip(response, data)) return false;
  return !readArtifactPayloadValue(data, fields);
}

export function isUploadPathArtifactChoice(choice) {
  const c = String(choice ?? '').trim();
  return ARTIFACT_DEFERRED_RESPONSES.has(c);
}

export function shouldBlockStoreBuildForMissingArtifact(outputs = {}) {
  for (const [outputKey, fields] of Object.entries(ARTIFACT_PAYLOAD_FIELDS_BY_OUTPUT_KEY)) {
    const choice = outputs[outputKey] != null ? String(outputs[outputKey]).trim() : '';
    if (!choice || !isUploadPathArtifactChoice(choice)) continue;
    if (!readArtifactPayloadValue(outputs, fields)) {
      return { blocked: true, outputKey, choice, fields };
    }
  }
  return { blocked: false };
}
