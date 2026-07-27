/**
 * Structured trace logs for activation store build runway.
 */

export type StoreBuildTraceEvent =
  | 'STORE_BUILD_START'
  | 'STORE_BUILD_RUNTIME_CALL'
  | 'STORE_BUILD_CAPABILITY'
  | 'STORE_BUILD_MISSION_CREATED'
  | 'STORE_BUILD_DRAFT_CREATED'
  | 'STORE_BUILD_DRAFT_GENERATED'
  | 'STORE_BUILD_REDIRECT'
  | 'STORE_BUILD_FAILED';

export type StoreBuildTraceFields = {
  seedId?: string | null;
  missionId?: string | null;
  draftId?: string | null;
  userId?: string | null;
  storeId?: string | null;
  spaceId?: string | null;
  stage?: string | null;
  completenessScore?: number | null;
  message?: string | null;
  source?: string | null;
};

export function logStoreBuild(event: StoreBuildTraceEvent, fields: StoreBuildTraceFields = {}): void {
  const payload = {
    event,
    seedId: fields.seedId ?? null,
    missionId: fields.missionId ?? null,
    draftId: fields.draftId ?? null,
    userId: fields.userId ?? null,
    storeId: fields.storeId ?? null,
    spaceId: fields.spaceId ?? null,
    stage: fields.stage ?? null,
    completenessScore: fields.completenessScore ?? null,
    message: fields.message ?? null,
    source: fields.source ?? null,
    at: new Date().toISOString(),
  };
  if (event === 'STORE_BUILD_FAILED') {
    console.warn(`[${event}]`, payload);
  } else {
    console.log(`[${event}]`, payload);
  }
}
