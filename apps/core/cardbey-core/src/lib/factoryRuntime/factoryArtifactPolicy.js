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
      return { stageId, artifact, url };
    }
    if (url) {
      return { stageId, artifact: out, url };
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
    record = await registerGeneratedArtifactFromOperational(
      { ...artifact, missionId: state.missionId },
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
