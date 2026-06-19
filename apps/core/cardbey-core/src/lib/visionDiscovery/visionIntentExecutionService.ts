/**
 * Execute vision intents through governed runtime — never bypasses Performer / mission pipeline.
 */

import type {
  EntityContext,
  VisionIntentExecutionResult,
} from '../intentGraph/types.js';
import { planVisionAction } from '../intentGraph/actionPlanner.js';
import { resolveAgentForIntent } from '../intentGraph/childAgentRouter.js';
import { createMissionPipeline } from '../missionPipelineService.js';
import { getEntityContextById } from './EntityContextRepository.js';
import { promoteVisionScanToDiscovery } from './visionDiscoveryService.js';
import { buildUserSessionContext } from './visionSessionContext.js';
import {
  appendVisionIntentEvent,
  patchVisionIntentEvent,
} from './VisionIntentEventRepository.js';

export async function executeVisionIntent(input: {
  intentId: string;
  entity: EntityContext;
  session: import('../intentGraph/types.js').UserSessionContext;
  confirmed?: boolean;
  suggestionsShown?: string[];
}): Promise<VisionIntentExecutionResult> {
  const intentEvent = await appendVisionIntentEvent({
    scanEventId: input.entity.scanEventId,
    entityContextId: input.entity.id,
    userId: input.session.userId,
    sessionId: input.session.sessionId,
    intentId: input.intentId,
    selected: true,
    agentType: resolveAgentForIntent(input.intentId),
    missionId: null,
    outcome: 'pending',
    feedback: null,
    suggestionsShown: input.suggestionsShown ?? [],
  });

  const plan = planVisionAction({
    intentId: input.intentId,
    entity: input.entity,
    session: input.session,
    confirmed: input.confirmed,
  });

  if ('error' in plan) {
    await patchVisionIntentEvent(intentEvent.id, { outcome: 'failed' });
    return {
      ok: false,
      outcome: 'failed',
      message:
        plan.error === 'confirmation_required'
          ? 'Please confirm before continuing.'
          : 'This action is not available.',
      missionId: null,
      performerPrompt: null,
      clientAction: null,
      requiresConfirmation: plan.error === 'confirmation_required',
      intentEventId: intentEvent.id,
    };
  }

  if (plan.targetRuntime === 'client' && plan.clientAction) {
    let message: string | null = null;
    if (plan.clientAction === 'promote_discovery' && input.entity.scanEventId) {
      const promoted = await promoteVisionScanToDiscovery(
        input.entity.scanEventId,
        input.session.userId,
      );
      if (!promoted.ok) {
        await patchVisionIntentEvent(intentEvent.id, { outcome: 'failed' });
        return {
          ok: false,
          outcome: 'failed',
          message: 'Could not submit for review.',
          missionId: null,
          performerPrompt: null,
          clientAction: null,
          requiresConfirmation: false,
          intentEventId: intentEvent.id,
        };
      }
      message = promoted.userResult?.discoveryMessage ?? 'Thanks. We’ll review this before creating a public listing.';
    }

    await patchVisionIntentEvent(intentEvent.id, { outcome: 'client_handled' });
    return {
      ok: true,
      outcome: 'client_handled',
      message,
      missionId: null,
      performerPrompt: null,
      clientAction: plan.clientAction,
      requiresConfirmation: false,
      intentEventId: intentEvent.id,
    };
  }

  if (plan.runtimeAction === 'promote_discovery' && input.entity.scanEventId) {
    const promoted = await promoteVisionScanToDiscovery(
      input.entity.scanEventId,
      input.session.userId,
    );
    await patchVisionIntentEvent(intentEvent.id, {
      outcome: promoted.ok ? 'completed' : 'failed',
      agentType: plan.agentType,
    });
    return {
      ok: promoted.ok,
      outcome: promoted.ok ? 'completed' : 'failed',
      message:
        promoted.userResult?.discoveryMessage ??
        'Thanks. We’ll review this before creating a public listing.',
      missionId: null,
      performerPrompt: null,
      clientAction: 'promote_discovery',
      requiresConfirmation: false,
      intentEventId: intentEvent.id,
    };
  }

  if (plan.targetRuntime === 'performer') {
    await patchVisionIntentEvent(intentEvent.id, {
      outcome: 'client_handled',
      agentType: plan.agentType,
    });
    return {
      ok: true,
      outcome: 'client_handled',
      message: null,
      missionId: null,
      performerPrompt: plan.performerPrompt ?? null,
      clientAction: 'performer_handoff',
      requiresConfirmation: false,
      intentEventId: intentEvent.id,
    };
  }

  if (plan.targetRuntime === 'mission_pipeline' && input.session.isAuthenticated) {
    try {
      const title = `Vision: ${plan.intentId.replace(/_/g, ' ')} — ${input.entity.entityName ?? 'scan'}`;
      const mission = await createMissionPipeline({
        type: plan.missionType ?? 'vision_intent_mission',
        title,
        targetType: 'vision_scan',
        targetId: input.entity.scanEventId ?? input.entity.id,
        targetLabel: input.entity.entityName ?? 'Vision scan',
        createdBy: input.session.userId!,
        tenantId: input.session.userId!,
        requiresConfirmation: plan.requiresConfirmation,
        executionMode: plan.requiresConfirmation ? 'GUIDED_RUN' : 'AUTO_RUN',
        metadata: {
          ...plan.metadata,
          intentId: plan.intentId,
          missionType: 'vision_intent_mission',
          source: 'vision_scan',
          entityContextId: input.entity.id,
          agentType: plan.agentType,
        },
      });
      await patchVisionIntentEvent(intentEvent.id, {
        missionId: mission.id,
        outcome: 'completed',
        agentType: plan.agentType,
      });
      return {
        ok: true,
        outcome: 'completed',
        message: 'Mission created — follow progress in Performer.',
        missionId: mission.id,
        performerPrompt: plan.performerPrompt ?? null,
        clientAction: null,
        requiresConfirmation: plan.requiresConfirmation,
        intentEventId: intentEvent.id,
      };
    } catch {
      await patchVisionIntentEvent(intentEvent.id, { outcome: 'failed' });
    }
  }

  if (plan.targetRuntime === 'mission_pipeline' && !input.session.isAuthenticated) {
    await patchVisionIntentEvent(intentEvent.id, { outcome: 'client_handled', agentType: plan.agentType });
    return {
      ok: true,
      outcome: 'client_handled',
      message: 'Sign in to run this action, or ask PIL for help.',
      missionId: null,
      performerPrompt: plan.performerPrompt ?? null,
      clientAction: 'performer_handoff',
      requiresConfirmation: plan.requiresConfirmation,
      intentEventId: intentEvent.id,
    };
  }

  await patchVisionIntentEvent(intentEvent.id, { outcome: 'client_handled', agentType: plan.agentType });
  return {
    ok: true,
    outcome: 'client_handled',
    message: null,
    missionId: null,
    performerPrompt: plan.performerPrompt ?? null,
    clientAction: plan.clientAction ?? 'performer_handoff',
    requiresConfirmation: false,
    intentEventId: intentEvent.id,
  };
}

export async function executeVisionIntentByContextId(input: {
  intentId: string;
  entityContextId: string;
  userId?: string | null;
  sessionId?: string | null;
  confirmed?: boolean;
  suggestionsShown?: string[];
}): Promise<VisionIntentExecutionResult | { ok: false; error: string }> {
  const entity = await getEntityContextById(input.entityContextId);
  if (!entity) return { ok: false, error: 'entity_context_not_found' };
  const session = buildUserSessionContext({
    userId: input.userId,
    sessionId: input.sessionId,
  });
  const result = await executeVisionIntent({
    intentId: input.intentId,
    entity,
    session,
    confirmed: input.confirmed,
    suggestionsShown: input.suggestionsShown,
  });
  return result;
}

export { buildUserSessionContext } from './visionSessionContext.js';
