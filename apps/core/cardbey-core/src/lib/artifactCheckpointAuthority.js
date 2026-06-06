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

/**
 * Resolve mission pipeline id for hero upload side effects.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{ missionId?: string|null, generationRunId?: string|null, storeId?: string|null, draftId?: string|null }} ctx
 */
export async function resolveMissionIdForHeroUpload(prisma, ctx = {}) {
  const explicit = typeof ctx.missionId === 'string' ? ctx.missionId.trim() : '';
  if (explicit) return explicit;

  const runId = typeof ctx.generationRunId === 'string' ? ctx.generationRunId.trim() : '';
  if (runId) {
    const tasks = await prisma.orchestratorTask.findMany({
      where: { missionId: { not: null } },
      orderBy: { createdAt: 'desc' },
      take: 80,
      select: { missionId: true, request: true },
    });
    for (const t of tasks) {
      const req = t.request && typeof t.request === 'object' ? t.request : null;
      if (req?.generationRunId === runId && t.missionId) {
        return String(t.missionId).trim();
      }
    }
  }

  const storeId = typeof ctx.storeId === 'string' ? ctx.storeId.trim() : '';
  if (storeId && storeId !== 'temp') {
    const pipeline = await prisma.missionPipeline.findFirst({
      where: { targetType: 'store', targetId: storeId },
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    });
    if (pipeline?.id) return String(pipeline.id).trim();
  }

  const draftId = typeof ctx.draftId === 'string' ? ctx.draftId.trim() : '';
  if (draftId) {
    const pipeline = await prisma.missionPipeline.findFirst({
      where: { targetType: 'draft_store', targetId: draftId },
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    });
    if (pipeline?.id) return String(pipeline.id).trim();
  }

  return null;
}

/**
 * Record hero artifact URLs on mission pipeline outputs so checkpoint authority resolves.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{ missionId: string, heroImageUrl?: string|null, heroVideoUrl?: string|null, heroMediaType?: string|null }} args
 */
export async function recordHeroArtifactCheckpoint(prisma, args) {
  const missionId = typeof args.missionId === 'string' ? args.missionId.trim() : '';
  if (!missionId) return { recorded: false, reason: 'missing_mission_id' };

  const pipeline = await prisma.missionPipeline.findUnique({
    where: { id: missionId },
    select: { id: true, outputsJson: true },
  });
  if (!pipeline) return { recorded: false, reason: 'pipeline_not_found' };

  const heroImageUrl =
    typeof args.heroImageUrl === 'string' && args.heroImageUrl.trim() ? args.heroImageUrl.trim() : null;
  const heroVideoUrl =
    typeof args.heroVideoUrl === 'string' && args.heroVideoUrl.trim() ? args.heroVideoUrl.trim() : null;
  if (!heroImageUrl && !heroVideoUrl) {
    return { recorded: false, reason: 'missing_hero_urls' };
  }

  const prev =
    pipeline.outputsJson && typeof pipeline.outputsJson === 'object' && !Array.isArray(pipeline.outputsJson)
      ? { ...pipeline.outputsJson }
      : {};
  const merged = { ...prev, heroUploadStatus: 'uploaded' };

  if (heroVideoUrl) {
    merged.heroVideoUrl = heroVideoUrl;
    merged.videoUrl = heroVideoUrl;
    merged.assetUrl = heroVideoUrl;
  }
  if (heroImageUrl) {
    merged.heroImageUrl = heroImageUrl;
    merged.imageUrl = heroImageUrl;
    merged.heroUrl = heroImageUrl;
    if (!heroVideoUrl) merged.assetUrl = heroImageUrl;
  }
  if (args.heroMediaType) merged.heroMediaType = args.heroMediaType;

  await prisma.missionPipeline.update({
    where: { id: missionId },
    data: { outputsJson: merged },
  });

  return { recorded: true, missionId, outputsJson: merged };
}
