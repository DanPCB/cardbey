/**
 * Definition-driven artifact finalization policy.
 */

import { randomUUID } from 'crypto';
import { registerGeneratedArtifactV1, registerGeneratedArtifactFromOperational } from '../artifacts/generatedArtifactAuthority.js';
import { getPath } from './factoryPathUtils.js';
import { resolvePlanFromState } from './factoryApprovalPolicy.js';

/**
 * @param {object|null|undefined} definition
 */
export function resolveArtifactPolicy(definition) {
  const policy = definition?.artifactPolicy ?? {};
  return {
    finalizeStageId: policy.finalizeStageId ?? 'artifact_finalize',
    sourceStageIds: Array.isArray(policy.sourceStageIds) ? policy.sourceStageIds : [],
    artifactType: policy.artifactType ?? 'generated_video',
    artifactTypeResolver: policy.artifactTypeResolver ?? 'policy',
    requiredFields: Array.isArray(policy.requiredFields) ? policy.requiredFields : [],
    persist: policy.persist !== false,
    persistOnComplete: policy.persistOnComplete !== false,
  };
}

/**
 * @param {object} state
 * @param {object|null|undefined} definition
 */
export function extractArtifactCandidate(state, definition) {
  const policy = resolveArtifactPolicy(definition);
  const stageIds =
    policy.sourceStageIds.length > 0
      ? policy.sourceStageIds
      : Object.keys(state.stageOutputs ?? {}).filter((id) => id !== policy.finalizeStageId);

  for (const stageId of stageIds) {
    const out = state.stageOutputs?.[stageId];
    if (!out || typeof out !== 'object') continue;
    if (out.finalBundle && typeof out.finalBundle === 'object') {
      const bundle = out.finalBundle;
      return {
        stageId,
        artifact: {
          ...bundle,
          artifactType: 'final_creative_asset',
          publishOptions: out.publishOptions ?? [],
        },
        url: bundle.videoUrl ?? null,
      };
    }
    const artifact = out.artifact ?? out.package ?? out;
    const url = out.videoUrl ?? out.url ?? artifact?.url ?? artifact?.previewUrl ?? null;
    if (artifact && typeof artifact === 'object') {
      return { stageId, artifact, url, ...pickMediaFields(out) };
    }
    if (url) {
      return { stageId, artifact: out, url, ...pickMediaFields(out) };
    }
  }
  return { stageId: null, artifact: null, url: null };
}

/**
 * @param {object} candidate
 * @param {object|null|undefined} definition
 */
export function resolveArtifactType(candidate, definition) {
  const policy = resolveArtifactPolicy(definition);
  const artifact = candidate?.artifact;
  if (policy.artifactTypeResolver === 'from_output' && artifact?.artifactType) {
    return String(artifact.artifactType);
  }
  if (policy.artifactTypeResolver === 'from_output' && artifact?.type) {
    const t = String(artifact.type);
    if (t === 'campaign') return 'campaign_package';
    return t;
  }
  return policy.artifactType ?? 'generated_video';
}

/**
 * @param {object} stage
 * @param {object} state
 * @param {object|null|undefined} definition
 */
export async function finalizeFactoryArtifactFromPolicy(stage, state, definition) {
  const policy = resolveArtifactPolicy(definition);
  const candidate = extractArtifactCandidate(state, definition);
  const artifact = candidate.artifact;
  const url = candidate.url;

  for (const field of policy.requiredFields) {
    const val = field === 'url' ? url : artifact?.[field];
    if (val == null || (typeof val === 'string' && !val.trim())) {
      return {
        ok: false,
        error: {
          code: 'artifact_required_field_missing',
          message: `Artifact finalize missing required field: ${field}`,
        },
      };
    }
  }

  const artifactType = resolveArtifactType(candidate, definition);
  let record = null;

  if (artifact && typeof artifact === 'object' && artifact.missionId) {
    const mediaMeta = extractMediaMetadata(candidate, artifact);
    record = await registerGeneratedArtifactFromOperational(
      {
        ...artifact,
        missionId: state.missionId,
        url: url ?? artifact.url,
        metadata: {
          ...(artifact.metadata && typeof artifact.metadata === 'object' ? artifact.metadata : {}),
          ...mediaMeta,
        },
      },
      {
        ownerUserId: state.userId,
        source: `factory:${state.factoryId}`,
      },
    );
  }

  if (!record && policy.persist) {
    record = await registerGeneratedArtifactV1({
      artifactId: `gart-${randomUUID()}`,
      artifactType,
      missionId: state.missionId,
      ownerUserId: state.userId,
      source: `factory:${state.factoryId}`,
      status: url ? 'ready' : 'processing',
      url,
      payload: {
        factoryId: state.factoryId,
        stageId: policy.finalizeStageId,
        executionId: state.executionId,
        sourceStageId: candidate.stageId,
        plan: resolvePlanFromState(state, definition),
        artifact: artifact && typeof artifact === 'object' ? artifact : null,
        hasAudio: resolveMediaFlag(candidate, artifact, 'hasAudio'),
        captionUrl: resolveMediaString(candidate, artifact, 'captionUrl'),
        captionMode: resolveMediaString(candidate, artifact, 'captionMode'),
        validationStatus: resolveMediaString(candidate, artifact, 'validationStatus'),
        audioStreamCount: resolveMediaNumber(candidate, artifact, 'audioStreamCount'),
        videoStreamCount: resolveMediaNumber(candidate, artifact, 'videoStreamCount'),
        outcomeReport: resolveOutcomeReport(candidate, artifact),
      },
    });
  }

  if (!record) {
    return {
      ok: false,
      error: { code: 'artifact_persist_failed', message: 'Could not persist factory artifact' },
    };
  }

  return {
    ok: true,
    output: {
      artifactId: record.artifactId,
      url: record.url ?? url,
      status: record.status,
      artifactType: record.artifactType,
      factoryId: state.factoryId,
      stageId: policy.finalizeStageId,
    },
    artifactRef: record.artifactId,
  };
}

function pickMediaFields(out) {
  if (!out || typeof out !== 'object') return {};
  return {
    hasAudio: out.hasAudio,
    captionUrl: out.captionUrl,
    captionMode: out.captionMode,
    validationStatus: out.validationStatus,
    audioStreamCount: out.audioStreamCount,
    videoStreamCount: out.videoStreamCount,
    outcomeReport: out.outcomeReport,
  };
}

function extractMediaMetadata(candidate, artifact) {
  return {
    hasAudio: resolveMediaFlag(candidate, artifact, 'hasAudio'),
    captionUrl: resolveMediaString(candidate, artifact, 'captionUrl'),
    captionMode: resolveMediaString(candidate, artifact, 'captionMode'),
    validationStatus: resolveMediaString(candidate, artifact, 'validationStatus'),
    audioStreamCount: resolveMediaNumber(candidate, artifact, 'audioStreamCount'),
    videoStreamCount: resolveMediaNumber(candidate, artifact, 'videoStreamCount'),
    outcomeReport: resolveOutcomeReport(candidate, artifact),
  };
}

function sourceBlob(candidate, artifact) {
  const out = candidate && typeof candidate === 'object' ? candidate : {};
  const art = artifact && typeof artifact === 'object' ? artifact : {};
  const meta = art.metadata && typeof art.metadata === 'object' ? art.metadata : {};
  return { out, art, meta };
}

function resolveMediaFlag(candidate, artifact, key) {
  const { out, art, meta } = sourceBlob(candidate, artifact);
  if (typeof out[key] === 'boolean') return out[key];
  if (typeof art[key] === 'boolean') return art[key];
  if (typeof meta[key] === 'boolean') return meta[key];
  return null;
}

function resolveMediaString(candidate, artifact, key) {
  const { out, art, meta } = sourceBlob(candidate, artifact);
  if (typeof out[key] === 'string' && out[key].trim()) return out[key].trim();
  if (typeof art[key] === 'string' && art[key].trim()) return art[key].trim();
  if (typeof meta[key] === 'string' && meta[key].trim()) return meta[key].trim();
  return null;
}

function resolveMediaNumber(candidate, artifact, key) {
  const { out, art, meta } = sourceBlob(candidate, artifact);
  const n = Number(out[key] ?? art[key] ?? meta[key]);
  return Number.isFinite(n) ? n : null;
}

function resolveOutcomeReport(candidate, artifact) {
  const { out, art, meta } = sourceBlob(candidate, artifact);
  const report = out.outcomeReport ?? art.outcomeReport ?? meta.outcomeReport;
  return report && typeof report === 'object' ? report : null;
}
