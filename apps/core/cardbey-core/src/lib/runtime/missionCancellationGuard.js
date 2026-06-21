/**
 * Shared mission cancellation guards — all mission types (store, campaign, video, proactive runway).
 */

const DEFAULT_MISSION_TIMEOUT_MS = 30 * 60 * 1000;

export function getMissionTimeoutMs() {
  const raw = Number(process.env.MISSION_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 60_000 ? raw : DEFAULT_MISSION_TIMEOUT_MS;
}

/**
 * @param {{ status?: unknown; runState?: unknown }} row
 */
export function isMissionPipelineCancelledRow(row) {
  if (!row) return false;
  const st = String(row.status ?? '').toLowerCase();
  const rs = String(row.runState ?? '').toLowerCase();
  return (
    st === 'cancelled' ||
    st === 'canceled' ||
    rs === 'cancelled' ||
    rs === 'canceled' ||
    (rs === 'done' && (st === 'cancelled' || st === 'canceled'))
  );
}

/**
 * @param {unknown} status
 */
export function isMissionPipelineActiveStatus(status) {
  const s = String(status ?? '').toLowerCase();
  return [
    'requested',
    'planned',
    'awaiting_confirmation',
    'queued',
    'executing',
    'awaiting_input',
    'paused',
  ].includes(s);
}

/**
 * @param {{ createdAt?: Date; updatedAt?: Date; metadataJson?: unknown }} row
 */
export function getMissionElapsedMs(row) {
  if (!row) return 0;
  const meta =
    row.metadataJson && typeof row.metadataJson === 'object' && !Array.isArray(row.metadataJson)
      ? row.metadataJson
      : {};
  const startedAtRaw = meta.executionStartedAt ?? meta.startedAt ?? null;
  const startedAt = startedAtRaw ? new Date(startedAtRaw) : null;
  const anchor =
    startedAt && !Number.isNaN(startedAt.getTime())
      ? startedAt
      : row.updatedAt instanceof Date
        ? row.updatedAt
        : row.createdAt instanceof Date
          ? row.createdAt
          : null;
  if (!anchor || Number.isNaN(anchor.getTime())) return 0;
  return Math.max(0, Date.now() - anchor.getTime());
}

/**
 * @param {import('../prismaClient.js').PrismaClient} prisma
 * @param {string} missionId
 */
export async function loadMissionCancellationState(prisma, missionId) {
  const id = String(missionId ?? '').trim();
  if (!id) return { cancelled: false, timedOut: false, mission: null };

  const mission = await prisma.missionPipeline.findUnique({
    where: { id },
    select: {
      id: true,
      type: true,
      status: true,
      runState: true,
      createdAt: true,
      updatedAt: true,
      metadataJson: true,
    },
  });

  if (!mission) return { cancelled: false, timedOut: false, mission: null };

  const cancelled = isMissionPipelineCancelledRow(mission);
  const elapsedMs = getMissionElapsedMs(mission);
  const timedOut =
    !cancelled &&
    isMissionPipelineActiveStatus(mission.status) &&
    elapsedMs > getMissionTimeoutMs();

  return { cancelled, timedOut, mission, elapsedMs };
}

/**
 * @param {import('../prismaClient.js').PrismaClient} prisma
 * @param {string} missionId
 * @returns {Promise<{ cancelled: true, code: string, message: string } | null>}
 */
export async function assertMissionNotCancelled(prisma, missionId) {
  const state = await loadMissionCancellationState(prisma, missionId);
  if (state.cancelled) {
    return {
      cancelled: true,
      code: 'MISSION_CANCELLED',
      message: 'Mission was cancelled',
    };
  }
  return null;
}

/**
 * Auto-cancel missions that exceed MISSION_TIMEOUT_MS while still active.
 * @param {import('../prismaClient.js').PrismaClient} prisma
 * @param {string} missionId
 */
export async function maybeCancelMissionForTimeout(prisma, missionId) {
  const state = await loadMissionCancellationState(prisma, missionId);
  if (!state.mission || !state.timedOut) {
    return { cancelled: false, timedOut: false };
  }

  const { cancelMissionPipeline } = await import('../missionPipelineService.js');
  await cancelMissionPipeline(missionId, {
    reason: `Mission timed out after ${Math.round(getMissionTimeoutMs() / 60_000)} minutes`,
  });
  console.warn('[missionCancellation] auto-cancelled for timeout', {
    missionId,
    type: state.mission.type,
    elapsedMs: state.elapsedMs,
  });
  return { cancelled: true, timedOut: true };
}
