/**
 * Universal Artifact Pipeline execution — canonical stages never change.
 */

import { randomUUID } from 'crypto';
import { ARTIFACT_PIPELINE_STAGES } from './ArtifactDefinition.js';
import { resolveArtifactContext } from './ArtifactContextResolver.js';
import { resolveArtifactAssets } from './ArtifactAssetResolver.js';
import { planArtifactBlueprint } from './ArtifactPlanner.js';
import { generateArtifact } from './ArtifactGenerator.js';
import { validateArtifact } from './ArtifactValidator.js';
import { publishArtifact } from './ArtifactPublisher.js';
import { recordArtifactLearning } from './ArtifactLearning.js';
import { getArtifactAdapter } from './ArtifactRegistry.js';
import { persistArtifactExecution } from './artifactPersistence.js';

export const UAF_STATUS_RUNNING = 'running';
export const UAF_STATUS_AWAITING_REVIEW = 'awaiting_owner_review';
export const UAF_STATUS_AWAITING_APPROVAL = 'awaiting_approval';
export const UAF_STATUS_COMPLETED = 'completed';
export const UAF_STATUS_FAILED = 'failed';

/**
 * @typedef {Object} ArtifactStageResult
 * @property {boolean} ok
 * @property {boolean} [awaitingApproval]
 * @property {Record<string, unknown>} [data]
 * @property {{ code?: string; message?: string; findings?: unknown[] }} [error]
 */

/**
 * @typedef {Object} ArtifactExecutionContext
 * @property {import('./ArtifactContextResolver.js').ResolvedArtifactContext} resolvedContext
 * @property {import('express').Request} [req]
 * @property {ArtifactExecutionState} execution
 * @property {Record<string, unknown>} [research]
 * @property {{ assets: import('./ArtifactAssetResolver.js').ResolvedAsset[]; byRole: Record<string, import('./ArtifactAssetResolver.js').ResolvedAsset[]> }} [assetBundle]
 */

/**
 * @typedef {Object} ArtifactExecutionState
 * @property {string} executionId
 * @property {import('./ArtifactDefinition.js').ArtifactDefinition} definition
 * @property {string} status
 * @property {string[]} completedStages
 * @property {string|null} currentStage
 * @property {Record<string, unknown>|null} generated
 * @property {Record<string, unknown>|null} validation
 * @property {Record<string, unknown>[]|null} publications
 * @property {Record<string, unknown>|null} approval
 * @property {number|null} timingMs
 * @property {Record<string, unknown>|null} factoryResumeState
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * @param {import('./ArtifactDefinition.js').ArtifactDefinition} definition
 * @param {{ req?: import('express').Request; resumeState?: ArtifactExecutionState; skipReview?: boolean; autoPublish?: boolean }} [options]
 */
export async function executeArtifactPipeline(definition, options = {}) {
  const started = Date.now();
  const execution =
    options.resumeState ??
    createExecutionState(definition);

  const ctx = await buildExecutionContext(definition, execution, options.req);

  try {
    for (const stage of ARTIFACT_PIPELINE_STAGES) {
      if (execution.completedStages.includes(stage)) continue;
      execution.currentStage = stage;
      execution.updatedAt = new Date().toISOString();

      const result = await runStage(stage, definition, ctx, execution, options);
      if (result.awaitingApproval) {
        execution.status = stage === 'owner_review' ? UAF_STATUS_AWAITING_REVIEW : UAF_STATUS_AWAITING_APPROVAL;
        execution.approval = {
          stage,
          requestedAt: new Date().toISOString(),
          blueprint: definition.blueprint,
          generated: execution.generated,
        };
        execution.timingMs = Date.now() - started;
        await persistArtifactExecution(execution);
        return finalize(execution, true);
      }
      if (!result.ok) {
        execution.status = UAF_STATUS_FAILED;
        execution.timingMs = Date.now() - started;
        await persistArtifactExecution(execution);
        return finalize(execution, false, result.error);
      }

      execution.completedStages.push(stage);
      if (result.data) applyStageData(stage, execution, definition, result.data);
    }

    execution.status = UAF_STATUS_COMPLETED;
    execution.timingMs = Date.now() - started;
    await persistArtifactExecution(execution);
    await recordArtifactLearning({
      definition,
      execution,
      generated: execution.generated ?? undefined,
      validation: execution.validation ?? undefined,
      publications: execution.publications ?? undefined,
    });
    return finalize(execution, true);
  } catch (err) {
    execution.status = UAF_STATUS_FAILED;
    execution.timingMs = Date.now() - started;
    await persistArtifactExecution(execution);
    return finalize(execution, false, {
      code: 'pipeline_error',
      message: err?.message ?? String(err),
    });
  }
}

/**
 * @param {import('./ArtifactDefinition.js').ArtifactDefinition} definition
 */
function createExecutionState(definition) {
  const now = new Date().toISOString();
  return {
    executionId: `uaf-${randomUUID()}`,
    definition,
    status: UAF_STATUS_RUNNING,
    completedStages: [],
    currentStage: null,
    generated: null,
    validation: null,
    publications: null,
    approval: null,
    timingMs: null,
    factoryResumeState: null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * @param {import('./ArtifactDefinition.js').ArtifactDefinition} definition
 * @param {ArtifactExecutionState} execution
 * @param {import('express').Request} [req]
 */
async function buildExecutionContext(definition, execution, req) {
  const resolvedContext = await resolveArtifactContext({
    req,
    userId: definition.owner,
    storeId: definition.storeId,
    missionId: definition.missionId,
    context: definition.context,
  });
  return { resolvedContext, req, execution };
}

/**
 * @param {string} stage
 * @param {import('./ArtifactDefinition.js').ArtifactDefinition} definition
 * @param {ArtifactExecutionContext} ctx
 * @param {ArtifactExecutionState} execution
 * @param {{ skipReview?: boolean; autoPublish?: boolean }} options
 * @returns {Promise<ArtifactStageResult>}
 */
async function runStage(stage, definition, ctx, execution, options) {
  switch (stage) {
    case 'resolve_context':
      return { ok: true, data: { resolvedContext: ctx.resolvedContext } };

    case 'research': {
      const adapter = getArtifactAdapter(definition.type);
      const prepared = adapter ? await adapter.prepare(definition, ctx) : { ok: true, data: {} };
      ctx.research = prepared.data ?? {};
      return { ok: prepared.ok !== false, data: ctx.research, error: prepared.error };
    }

    case 'collect_inputs': {
      const bundle = await resolveArtifactAssets(ctx.resolvedContext, {
        ...definition.requiredInputs,
        ...definition.optionalInputs,
      });
      ctx.assetBundle = bundle;
      return { ok: true, data: bundle };
    }

    case 'create_blueprint': {
      const blueprint = planArtifactBlueprint(
        definition,
        ctx.resolvedContext,
        ctx.assetBundle ?? { assets: [], byRole: {} },
        ctx.research ?? {},
      );
      definition.blueprint = blueprint;
      return { ok: true, data: { blueprint } };
    }

    case 'owner_review':
      if (options.skipReview) return { ok: true, data: { skipped: true } };
      return { ok: true, awaitingApproval: true, data: { blueprint: definition.blueprint } };

    case 'generate': {
      const gen = await generateArtifact(definition, ctx);
      if (gen.awaitingApproval) {
        execution.generated = gen.data ?? null;
        if (gen.data?.factoryExecution) {
          execution.factoryResumeState = gen.data.factoryExecution.state ?? gen.data.factoryExecution;
        }
        return { ok: true, awaitingApproval: true, data: gen.data };
      }
      if (!gen.ok) return gen;
      execution.generated = gen.data ?? null;
      return gen;
    }

    case 'validate': {
      const val = await validateArtifact(definition, ctx, execution.generated ?? {});
      execution.validation = val.data ?? null;
      return val;
    }

    case 'revision':
      return { ok: true, data: { skipped: !execution.validation?.errors?.length } };

    case 'approval':
      if (options.autoPublish || options.skipReview) return { ok: true, data: { skipped: true } };
      if (execution.generated && !execution.approval?.approvedAt) {
        return { ok: true, awaitingApproval: true, data: { generated: execution.generated } };
      }
      return { ok: true, data: {} };

    case 'publish': {
      if (!options.autoPublish && !execution.approval?.approvedAt && !options.skipReview) {
        return { ok: true, data: { skipped: true } };
      }
      const pub = await publishArtifact(definition, ctx, execution.generated ?? {});
      execution.publications = pub.data?.publications ?? null;
      return pub;
    }

    case 'learn':
      return { ok: true, data: {} };

    default:
      return { ok: true, data: {} };
  }
}

/**
 * @param {string} stage
 * @param {ArtifactExecutionState} execution
 * @param {import('./ArtifactDefinition.js').ArtifactDefinition} definition
 * @param {Record<string, unknown>} data
 */
function applyStageData(stage, execution, definition, data) {
  if (stage === 'generate') execution.generated = data;
  if (stage === 'create_blueprint' && data.blueprint) definition.blueprint = data.blueprint;
}

/**
 * @param {ArtifactExecutionState} execution
 * @param {boolean} ok
 * @param {{ code?: string; message?: string }} [error]
 */
function finalize(execution, ok, error) {
  return {
    ok,
    status: execution.status,
    executionId: execution.executionId,
    artifactId: execution.definition.artifactId,
    type: execution.definition.type,
    definition: execution.definition,
    execution,
    generated: execution.generated,
    blueprint: execution.definition.blueprint,
    validation: execution.validation,
    publications: execution.publications,
    approval: execution.approval,
    error: error ?? null,
  };
}

/**
 * Resume after owner/approval decision.
 * @param {ArtifactExecutionState} execution
 * @param {{ approved: boolean; req?: import('express').Request; autoPublish?: boolean }} decision
 */
export async function resumeArtifactPipeline(execution, decision) {
  if (!decision.approved) {
    execution.status = UAF_STATUS_FAILED;
    execution.approval = {
      ...(execution.approval ?? {}),
      rejectedAt: new Date().toISOString(),
    };
    await persistArtifactExecution(execution);
    return finalize(execution, false, { code: 'rejected', message: 'Artifact rejected by owner' });
  }

  execution.approval = {
    ...(execution.approval ?? {}),
    approvedAt: new Date().toISOString(),
  };

  const stage = execution.currentStage;
  if (stage === 'owner_review' && !execution.completedStages.includes('owner_review')) {
    execution.completedStages.push('owner_review');
  }
  if (stage === 'approval' && !execution.completedStages.includes('approval')) {
    execution.completedStages.push('approval');
  }

  return executeArtifactPipeline(execution.definition, {
    resumeState: execution,
    req: decision.req,
    autoPublish: decision.autoPublish,
    skipReview: true,
  });
}
