/**
 * Performer intake spine — single programmatic entry for classify → compile → persist.
 *
 * HTTP surface remains `routes/performerIntakeV2Routes.js`.
 * External callers (e.g. loyalty-from-card) should use `handlePerformerIntake`.
 */

import { getIntentIntegration } from '../intent/intentIntegration.js';
import { getContextProvider } from '../context/contextEngine.js';
import { Features } from '../../config/features.js';
import { generateExecutionPlan } from '../mission/generateExecutionPlan.js';
import { shouldUseMultiAgentCompiler } from '../mission/intentCompilerBridge.js';
import { emitSpinePathTelemetry } from './spinePathTelemetry.js';

/**
 * @param {object} input
 * @param {string} input.text
 * @param {string} [input.userId]
 * @param {string} [input.tenantId]
 * @param {string} [input.storeId]
 * @param {string} [input.sessionId]
 * @param {string} [input.missionId]
 * @param {string} [input.locale]
 * @param {unknown[]} [input.files]
 * @param {Record<string, unknown>} [input.parameters]
 * @param {string} [input.source]
 * @param {string} [input.pathId]
 * @param {import('express').Request} [input.req]
 */
export async function handlePerformerIntake(input = {}) {
  const text = String(input.text ?? '').trim();
  const userId = String(input.userId ?? '').trim() || null;
  const storeId = String(input.storeId ?? '').trim() || null;
  const sessionId = String(input.sessionId ?? '').trim() || null;
  const pathId = String(input.pathId ?? 'performer_intake_spine').trim();
  const source = String(input.source ?? 'handlePerformerIntake').trim();
  const files = Array.isArray(input.files) ? input.files : [];

  if (!text) {
    emitSpinePathTelemetry({
      pathId,
      source,
      ok: false,
      reason: 'missing_text',
    });
    return {
      ok: false,
      pathId,
      error: { code: 'missing_text', message: 'handlePerformerIntake requires text' },
    };
  }

  if (!userId) {
    emitSpinePathTelemetry({ pathId, source, ok: false, reason: 'auth_required' });
    return {
      ok: false,
      pathId,
      error: { code: 'auth_required', message: 'handlePerformerIntake requires userId' },
    };
  }

  const integration = getIntentIntegration({ contextProvider: getContextProvider() });
  const classification = await integration.processIntake({
    userId,
    sessionId: sessionId || `spine:${userId}`,
    input: {
      text,
      files,
      attachments: files,
      ...(input.parameters && typeof input.parameters === 'object' ? { parameters: input.parameters } : {}),
    },
    classifyOpts: {
      userMessage: text,
      currentContext: {
        activeStoreId: storeId,
        ...(input.parameters && typeof input.parameters === 'object' ? input.parameters : {}),
      },
    },
    req: input.req,
  });

  const tool = String(classification?.tool ?? '').trim();
  const compilerEligible = shouldUseMultiAgentCompiler(classification);

  if (!compilerEligible) {
    emitSpinePathTelemetry({
      pathId,
      source,
      ok: true,
      reason: 'classified_not_compiled',
      tool,
      spine: false,
    });
    return {
      ok: true,
      pathId,
      spine: false,
      classified: true,
      compiled: false,
      classification,
      tool,
      message: 'Intent classified but tool is not multi-agent compiler eligible',
    };
  }

  const parameters = {
    ...(classification?.parameters &&
    typeof classification.parameters === 'object' &&
    !Array.isArray(classification.parameters)
      ? classification.parameters
      : {}),
    ...(input.parameters && typeof input.parameters === 'object' ? input.parameters : {}),
    ...(storeId ? { storeId } : {}),
  };

  const planResult = await generateExecutionPlan(
    {
      text,
      tool,
      missionType: resolveSpineMissionType(tool),
      parameters,
    },
    storeId,
    sessionId,
    {
      missionId: input.missionId ?? undefined,
      userId,
      tenantId: input.tenantId ?? userId,
      locale: input.locale ?? 'en',
      title: `Loyalty spine: ${text.slice(0, 60)}`,
    },
  );

  emitSpinePathTelemetry({
    pathId,
    source,
    ok: true,
    reason: 'compiled',
    tool,
    missionId: planResult.missionId,
    spine: true,
    nodeCount: planResult.artifactBundle?.topology?.nodes?.length ?? 0,
    useLoyaltySpine: Features.loyalty.useSpine,
  });

  return {
    ok: true,
    pathId,
    spine: true,
    classified: true,
    compiled: true,
    classification,
    tool,
    missionId: planResult.missionId,
    artifactBundle: planResult.artifactBundle,
    metadata: planResult.metadata,
    response: {
      ...planResult.response,
      storeId,
      source,
      pathId,
      filesAttached: files.length,
    },
  };
}

/**
 * @param {string} tool
 */
function resolveSpineMissionType(tool) {
  if (tool === 'create_campaign') return 'launch_campaign';
  if (tool === 'create_store') return 'create_store';
  if (tool === 'setup_loyalty_program' || tool === 'create_loyalty_program') {
    return 'setup_loyalty_program';
  }
  return tool || 'generic';
}

export { emitSpinePathTelemetry } from './spinePathTelemetry.js';
