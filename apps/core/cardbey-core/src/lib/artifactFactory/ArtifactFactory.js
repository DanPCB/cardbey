/**
 * Universal Artifact Factory — public entry for governed artifact creation.
 */

import { createArtifactDefinition, normalizeArtifactDefinition } from './ArtifactDefinition.js';
import { executeArtifactPipeline, resumeArtifactPipeline, UAF_STATUS_AWAITING_REVIEW } from './ArtifactExecution.js';
import { resolveArtifactType } from './artifactTypes.js';
import { getArtifactAdapter, listRegisteredArtifactTypes } from './ArtifactRegistry.js';
import { loadUafMissionState } from './artifactPersistence.js';
import { registerGeneratedArtifactFromOperational } from '../artifacts/generatedArtifactAuthority.js';
import { createArtifact } from '../artifacts/artifactContract.js';

import { Features } from '../../config/features.js';

export function isUniversalArtifactFactoryEnabled() {
  return Features.uaf.enabled;
}

/**
 * @param {{
 *   artifactType?: string;
 *   type?: string;
 *   storeId?: string;
 *   missionId?: string;
 *   objective?: string;
 *   context?: Record<string, unknown>;
 *   inputs?: Record<string, unknown>;
 *   outputs?: Record<string, unknown>;
 *   owner?: string;
 *   userId?: string;
 *   req?: import('express').Request;
 *   skipReview?: boolean;
 *   autoPublish?: boolean;
 * }} payload
 */
export async function executeArtifact(payload) {
  const type = resolveArtifactType(payload.artifactType ?? payload.type ?? '');
  if (!type) {
    return {
      ok: false,
      error: { code: 'invalid_type', message: 'Unknown or missing artifactType' },
    };
  }

  const adapter = getArtifactAdapter(type);
  if (!adapter) {
    return {
      ok: false,
      error: { code: 'adapter_missing', message: `No adapter registered for ${type}` },
    };
  }

  const owner =
    payload.owner ??
    payload.userId ??
    (payload.req ? String(payload.req.user?.id ?? '').trim() : '') ??
    '';

  if (!owner) {
    return {
      ok: false,
      error: { code: 'auth_required', message: 'Authenticated owner is required' },
    };
  }

  const definition = createArtifactDefinition({
    type,
    objective: payload.objective ?? payload.context?.objective ?? `Create ${type}`,
    owner,
    storeId: payload.storeId ?? payload.context?.storeId,
    missionId: payload.missionId ?? payload.context?.missionId,
    context: payload.context ?? {},
    requiredInputs: payload.inputs ?? {},
    optionalInputs: payload.context?.optionalInputs ?? {},
    outputs: payload.outputs ?? {},
    publishTargets: payload.outputs?.targets ?? payload.context?.publishTargets,
  });

  const result = await executeArtifactPipeline(definition, {
    req: payload.req,
    skipReview: payload.skipReview,
    autoPublish: payload.autoPublish,
  });

  await bridgeToGeneratedArtifactAuthority(result);
  return result;
}

/**
 * @param {import('./ArtifactExecution.js').ArtifactExecutionState} execution
 * @param {{ approved: boolean; req?: import('express').Request; autoPublish?: boolean }} decision
 */
export async function approveArtifactExecution(execution, decision) {
  const result = await resumeArtifactPipeline(execution, decision);
  await bridgeToGeneratedArtifactAuthority(result);
  return result;
}

/**
 * @param {Record<string, unknown>} result
 */
async function bridgeToGeneratedArtifactAuthority(result) {
  if (!result.ok || !result.generated || !result.definition?.missionId) return;
  const generated = result.generated;
  if (generated.factoryExecution) return;

  const operational = createArtifact({
    type: mapUafTypeToContract(result.type),
    title: result.definition.objective,
    missionId: result.definition.missionId,
    status: generated.status === 'ready' ? 'ready' : 'processing',
    url: typeof generated.url === 'string' ? generated.url : undefined,
    previewUrl: typeof generated.previewUrl === 'string' ? generated.previewUrl : undefined,
    sourceTool: `uaf:${result.type}`,
    metadata: {
      artifactId: result.artifactId,
      uafExecutionId: result.executionId,
      blueprintId: result.blueprint?.blueprintId,
    },
  });

  try {
    await registerGeneratedArtifactFromOperational(operational, {
      missionId: result.definition.missionId,
      ownerUserId: result.definition.owner,
      source: 'universal_artifact_factory',
      artifactType: mapUafTypeToGeneratedType(result.type),
    });
  } catch {
    /* non-fatal — mission context UAF record is canonical */
  }
}

/**
 * @param {string} type
 */
function mapUafTypeToContract(type) {
  if (type.includes('video') || type === 'reel' || type === 'story') return 'video';
  if (type.includes('graphic') || type === 'poster' || type === 'flyer') return 'image';
  if (type === 'slideshow' || type === 'presentation') return 'slideshow';
  if (type === 'social_post' || type === 'email_campaign') return 'text_asset';
  if (type === 'loyalty_program') return 'campaign';
  if (type === 'website' || type === 'store_profile') return 'store';
  return 'unknown';
}

/**
 * @param {string} type
 */
function mapUafTypeToGeneratedType(type) {
  if (type.includes('video') || type === 'reel' || type === 'story') return 'generated_video';
  if (type.includes('graphic') || type === 'poster') return 'generated_graphic';
  if (type === 'slideshow') return 'generated_slideshow';
  if (type === 'promotion_offer') return 'campaign_package';
  return 'final_creative_asset';
}

/**
 * @param {string} missionId
 */
export async function listMissionArtifacts(missionId) {
  const state = await loadUafMissionState(missionId);
  return {
    artifacts: state.artifacts,
    executions: state.executions,
    types: listRegisteredArtifactTypes(),
  };
}

/**
 * @param {unknown} body
 */
export function parseCreateArtifactPayload(body) {
  if (!body || typeof body !== 'object') return null;
  const o = /** @type {Record<string, unknown>} */ (body);
  const type = resolveArtifactType(String(o.artifactType ?? o.type ?? ''));
  if (!type) return null;
  return {
    artifactType: type,
    storeId: typeof o.storeId === 'string' ? o.storeId : undefined,
    missionId: typeof o.missionId === 'string' ? o.missionId : undefined,
    objective: typeof o.objective === 'string' ? o.objective : undefined,
    context: o.context && typeof o.context === 'object' ? o.context : {},
    inputs: o.inputs && typeof o.inputs === 'object' ? o.inputs : {},
    outputs: o.outputs && typeof o.outputs === 'object' ? o.outputs : {},
  };
}

export { normalizeArtifactDefinition, listRegisteredArtifactTypes };
