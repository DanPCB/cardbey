/**
 * Resolve userId / storeId / missionId before factory routing.
 * Does not call run_factory — context only.
 */

import { resolveStoreAmbiguity, tryAutoResolveSingleStoreId } from '../intake/resolveStoreAmbiguity.js';
import { resolveFactoryIntent } from './factoryIntentRegistry.js';
import {
  emitFactoryContextMissing,
  emitFactoryContextRecovered,
  emitFactoryMissionCreatedForFactory,
} from './factoryTelemetry.js';

export const PLACEHOLDER_STORE_IDS = new Set(['temp', 'draft', 'placeholder', 'none', 'null', 'undefined']);

const STORE_CHECKPOINT_MESSAGE =
  'Please select a store first so I can create the promotional video for it.';

/**
 * @param {unknown} storeId
 * @returns {boolean}
 */
export function isPlaceholderStoreId(storeId) {
  const normalized = String(storeId ?? '')
    .trim()
    .toLowerCase();
  return !normalized || PLACEHOLDER_STORE_IDS.has(normalized);
}

/**
 * @param {unknown} storeId
 * @returns {string | null}
 */
export function resolveRealStoreId(storeId) {
  if (isPlaceholderStoreId(storeId)) return null;
  return String(storeId).trim();
}

/**
 * @param {{
 *   intentLabel?: string | null;
 *   userMessage?: string | null;
 *   userId?: string | null;
 *   missionId?: string | null;
 *   storeId?: string | null;
 *   tenantId?: string | null;
 *   context?: Record<string, unknown>;
 * }} args
 * @returns {Promise<
 *   | { ok: true; userId: string; storeId: string; missionId: string; factoryId: string; missionCreated: boolean; missionRecovered: boolean }
 *   | { ok: false; code: 'NOT_FACTORY_INTENT' }
 *   | { ok: false; code: 'AUTH_REQUIRED'; message: string }
 *   | { ok: false; code: 'STORE_SELECTION_REQUIRED'; message: string; checkpoint: object }
 * >}
 */
export async function resolveFactoryRoutingContext(args) {
  const intentLabel = String(args.intentLabel ?? '').trim();
  const userMessage = String(args.userMessage ?? '').trim();
  const userId = String(args.userId ?? '').trim();
  let missionId = String(args.missionId ?? '').trim();
  let storeId = resolveRealStoreId(args.storeId);
  const context = args.context && typeof args.context === 'object' ? args.context : {};

  const resolved = resolveFactoryIntent(
    { intentLabel, userMessage, goal: userMessage, message: userMessage },
    context,
  );
  if (!resolved?.factoryId) {
    return { ok: false, code: 'NOT_FACTORY_INTENT' };
  }

  if (!userId) {
    emitFactoryContextMissing({
      reason: 'userId',
      factoryId: resolved.factoryId,
      intentLabel,
      intent: userMessage || intentLabel,
    });
    return {
      ok: false,
      code: 'AUTH_REQUIRED',
      message: 'Please sign in to create promotional videos for your store.',
    };
  }

  if (!storeId) {
    storeId = resolveRealStoreId(context.storeId ?? context.activeStoreId) ?? null;
  }
  if (!storeId) {
    storeId = await tryAutoResolveSingleStoreId(userId);
  }

  if (!storeId) {
    const ambiguity = await resolveStoreAmbiguity({
      userId,
      effectiveStoreId: null,
      intentRequiresStore: true,
      userMessage: userMessage || intentLabel,
    });
    emitFactoryContextMissing({
      reason: ambiguity ? 'store_ambiguous' : 'storeId',
      factoryId: resolved.factoryId,
      intentLabel,
      intent: userMessage || intentLabel,
      userId,
    });
    if (ambiguity?.needsClarification) {
      return {
        ok: false,
        code: 'STORE_SELECTION_REQUIRED',
        message: STORE_CHECKPOINT_MESSAGE,
        checkpoint: {
          checkpoint: 'store_selection',
          clarifyType: ambiguity.clarifyType ?? 'store_picker',
          response: STORE_CHECKPOINT_MESSAGE,
          options: ambiguity.options.map((o) => ({
            label: o.label,
            tool: intentLabel || 'create_video',
            parameters: {
              storeId: o.value,
            },
          })),
          pendingIntent: {
            ...ambiguity.pendingIntent,
            tool: intentLabel || 'create_video',
            intentLabel: intentLabel || 'create_video',
            factoryId: resolved.factoryId,
          },
        },
      };
    }
    return {
      ok: false,
      code: 'STORE_SELECTION_REQUIRED',
      message: STORE_CHECKPOINT_MESSAGE,
      checkpoint: {
        checkpoint: 'store_selection',
        clarifyType: 'store_picker',
        response: STORE_CHECKPOINT_MESSAGE,
        options: [],
        pendingIntent: {
          userMessage: userMessage || intentLabel,
          tool: intentLabel || 'create_video',
          intentLabel: intentLabel || 'create_video',
          factoryId: resolved.factoryId,
        },
      },
    };
  }

  let missionCreated = false;
  const missionRecovered = Boolean(missionId);

  if (!missionId) {
    const { createMissionPipeline } = await import('../missionPipelineService.js');
    const tenantId = String(args.tenantId ?? '').trim() || userId;
    const titleSource = userMessage || intentLabel || 'Creative factory';
    const pipeline = await createMissionPipeline({
      type: 'generic',
      title: titleSource.slice(0, 180),
      targetType: 'store',
      targetId: storeId,
      targetLabel: null,
      metadata: {
        source: 'performer_intake_v2',
        intentLabel: intentLabel || 'create_video',
        factoryId: resolved.factoryId,
        rawUserText: userMessage || intentLabel,
        storeId,
      },
      requiresConfirmation: false,
      executionMode: 'AUTO_RUN',
      tenantId,
      createdBy: userId,
    });
    missionId = String(pipeline.id ?? '').trim();
    missionCreated = Boolean(missionId);
    if (!missionId) {
      emitFactoryContextMissing({
        reason: 'mission_create_failed',
        factoryId: resolved.factoryId,
        intentLabel,
        intent: userMessage || intentLabel,
        userId,
        storeId,
      });
      return {
        ok: false,
        code: 'MISSION_CREATE_FAILED',
        message: 'Could not start a mission for factory routing. Please try again.',
      };
    }
    emitFactoryMissionCreatedForFactory({
      factoryId: resolved.factoryId,
      missionId,
      userId,
      storeId,
      intentLabel: intentLabel || 'create_video',
      intent: userMessage || intentLabel,
    });
  } else {
    emitFactoryContextRecovered({
      factoryId: resolved.factoryId,
      missionId,
      userId,
      storeId,
      intentLabel: intentLabel || 'create_video',
      intent: userMessage || intentLabel,
    });
  }

  return {
    ok: true,
    userId,
    storeId,
    missionId,
    factoryId: resolved.factoryId,
    missionCreated,
    missionRecovered,
  };
}
