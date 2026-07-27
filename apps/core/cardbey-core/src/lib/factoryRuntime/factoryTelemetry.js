/**
 * Factory Runtime telemetry — health probes + blackboard events.
 */

import { appendEvent } from '../missionBlackboard.js';
import { emitHealthProbe } from '../telemetry/healthProbes.js';
import { recordRuntimeAuthorityPathUsed } from '../runtime/performerRuntime/runtimeAuthorityGuard.js';

const PROBE_PREFIX = 'factory.runtime';

/**
 * @param {string} event
 * @param {Record<string, unknown>} fields
 */
export function emitFactoryTelemetry(event, fields = {}) {
  const payload = {
    event,
    runtimeAuthority: true,
    ...fields,
  };

  recordRuntimeAuthorityPathUsed({
    route: `factory_runtime/${event}`,
    toolName: typeof fields.factoryId === 'string' ? fields.factoryId : 'factory',
    userId: typeof fields.userId === 'string' ? fields.userId : null,
    missionId: typeof fields.missionId === 'string' ? fields.missionId : null,
    source: 'factory_runtime',
  });

  emitHealthProbe(`${PROBE_PREFIX}.${event.toLowerCase()}`, {
    status: event.includes('FAILED') ? 'fail' : 'pass',
    ...payload,
  });

  const missionId = typeof fields.missionId === 'string' ? fields.missionId.trim() : '';
  if (missionId) {
    void appendEvent(missionId, event, payload, { agentId: 'factory_runtime' }).catch(() => {});
  }
}

export function emitFactoryExecutionStarted(fields) {
  emitFactoryTelemetry('FACTORY_EXECUTION_STARTED', fields);
}

export function emitFactoryStageStarted(fields) {
  emitFactoryTelemetry('FACTORY_STAGE_STARTED', fields);
}

export function emitFactoryStageCompleted(fields) {
  emitFactoryTelemetry('FACTORY_STAGE_COMPLETED', fields);
}

export function emitFactoryStageFailed(fields) {
  emitFactoryTelemetry('FACTORY_STAGE_FAILED', fields);
}

export function emitFactoryExecutionPaused(fields) {
  emitFactoryTelemetry('FACTORY_EXECUTION_PAUSED', fields);
}

export function emitFactoryExecutionResumed(fields) {
  emitFactoryTelemetry('FACTORY_EXECUTION_RESUMED', fields);
}

export function emitFactoryExecutionCompleted(fields) {
  emitFactoryTelemetry('FACTORY_EXECUTION_COMPLETED', fields);
}

export function emitCreativeFactoryResearchCompleted(fields) {
  emitFactoryTelemetry('CREATIVE_FACTORY_RESEARCH_COMPLETED', fields);
}

export function emitCreativeFactoryScriptCompleted(fields) {
  emitFactoryTelemetry('CREATIVE_FACTORY_SCRIPT_COMPLETED', fields);
}

export function emitCreativeFactoryAssetSearchCompleted(fields) {
  emitFactoryTelemetry('CREATIVE_FACTORY_ASSET_SEARCH_COMPLETED', fields);
}

export function emitCreativeFactoryVideoPlanReady(fields) {
  emitFactoryTelemetry('CREATIVE_FACTORY_VIDEO_PLAN_READY', fields);
}

export function emitFactoryStageTimeout(fields) {
  emitFactoryTelemetry('FACTORY_STAGE_TIMEOUT', fields);
}

export function emitFactoryRequiredArtifactMissing(fields) {
  emitFactoryTelemetry('FACTORY_REQUIRED_ARTIFACT_MISSING', fields);
}

export function emitCreativeFactorySubtitleReady(fields) {
  emitFactoryTelemetry('CREATIVE_FACTORY_SUBTITLE_READY', fields);
}

export function emitCreativeFactoryMusicSelected(fields) {
  emitFactoryTelemetry('CREATIVE_FACTORY_MUSIC_SELECTED', fields);
}

export function emitCreativeFactoryPublishHandoffReady(fields) {
  emitFactoryTelemetry('CREATIVE_FACTORY_PUBLISH_HANDOFF_READY', fields);
}

export function emitCreativeFactoryFinalApprovalPaused(fields) {
  emitFactoryTelemetry('CREATIVE_FACTORY_FINAL_APPROVAL_PAUSED', fields);
}

/** Intake → factory intent router — route attempt (before registry match). */
export function emitFactoryRouteAttempted(fields) {
  emitFactoryTelemetry('FACTORY_ROUTE_ATTEMPTED', fields);
}

/** Registry matched + context ok — proceeding to run_factory. */
export function emitFactoryRouteAccepted(fields) {
  emitFactoryTelemetry('FACTORY_ROUTE_ACCEPTED', fields);
}

/** No match, missing context, or runtime could not start factory execution. */
export function emitFactoryRouteRejected(fields) {
  emitFactoryTelemetry('FACTORY_ROUTE_REJECTED', fields);
}

export function emitFactoryContextRecovered(fields) {
  emitFactoryTelemetry('FACTORY_CONTEXT_RECOVERED', fields);
}

export function emitFactoryContextMissing(fields) {
  emitFactoryTelemetry('FACTORY_CONTEXT_MISSING', fields);
}

export function emitFactoryMissionCreatedForFactory(fields) {
  emitFactoryTelemetry('FACTORY_MISSION_CREATED_FOR_FACTORY', fields);
}
