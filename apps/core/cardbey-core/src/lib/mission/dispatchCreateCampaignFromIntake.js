/**
 * Campaign intake dispatch — compiler when enabled, checkpoint fallback.
 */

import { Features } from '../../config/features.js';
import {
  runMultiAgentCompilerFromIntake,
  respondMultiAgentCompilerDispatch,
  shouldDispatchCampaignViaCompiler,
} from './dispatchMultiAgentCompilerFromIntake.js';
import {
  respondCreateCampaignCheckpointDispatch,
  runCreateCampaignViaUnifiedDispatch,
} from '../intake/createCampaignCheckpointDispatch.js';
import { getPrismaClient } from '../prisma.js';

/**
 * @param {object} deps
 * @param {string} auditSource
 */
export async function dispatchCreateCampaignFromIntake(deps, auditSource) {
  const classification = deps.classification ?? {};

  if (Features.compiler.useForCampaigns && shouldDispatchCampaignViaCompiler(classification)) {
    try {
      const compilerResult = await runMultiAgentCompilerFromIntake({
        ...deps,
        auditSource,
      });
      if (compilerResult.kind !== 'failed') {
        return { channel: 'compiler', result: compilerResult };
      }
      console.error(
        '[CreateCampaignDispatch] compiler failed, falling back to checkpoint:',
        compilerResult.responseBody?.error ?? compilerResult.responseBody?.message,
      );
    } catch (err) {
      console.error(
        '[CreateCampaignDispatch] compiler error, falling back to checkpoint:',
        err?.message ?? err,
      );
    }
  }

  const prisma = deps.prisma ?? getPrismaClient();
  let createMissionPipeline = deps.createMissionPipeline;
  if (!createMissionPipeline) {
    ({ createMissionPipeline } = await import('../missionPipelineService.js'));
  }

  const checkpointResult = await runCreateCampaignViaUnifiedDispatch(
    { ...deps, prisma, createMissionPipeline },
    auditSource,
  );
  return { channel: 'checkpoint', result: checkpointResult };
}

/**
 * @param {import('express').Response} res
 * @param {Awaited<ReturnType<typeof dispatchCreateCampaignFromIntake>>} outcome
 * @param {{ locale: string; safeJson: Function }} ctx
 */
export async function respondCreateCampaignFromIntake(res, outcome, ctx) {
  if (outcome.channel === 'compiler') {
    return respondMultiAgentCompilerDispatch(res, outcome.result, ctx);
  }
  return respondCreateCampaignCheckpointDispatch(res, outcome.result, ctx);
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {object} deps
 * @param {string} auditSource
 */
export async function dispatchAndRespondCreateCampaign(req, res, deps, auditSource) {
  const outcome = await dispatchCreateCampaignFromIntake(deps, auditSource);
  return respondCreateCampaignFromIntake(res, outcome, {
    locale: deps.locale,
    safeJson: deps.safeJson,
  });
}
