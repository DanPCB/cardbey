/**
 * UAF intent routing — maps creation intents to artifact types and unified dispatch.
 */

import { unifiedDispatch } from '../intake/unifiedDispatch.js';
import { resolveArtifactType, ARTIFACT_TYPES } from './artifactTypes.js';
import { isUniversalArtifactFactoryEnabled } from './ArtifactFactory.js';
import { resolveFactoryIntent } from '../factoryRuntime/factoryIntentRegistry.js';

/**
 * @param {string} intentLabel
 * @param {string|null|undefined} userMessage
 */
export function resolveUafArtifactType(intentLabel, userMessage) {
  const fromTool = resolveArtifactType(intentLabel);
  if (fromTool) return fromTool;

  const text = `${intentLabel ?? ''} ${userMessage ?? ''}`.toLowerCase();
  if (/\b(loyalty|stamp card|rewards program)\b/.test(text)) return 'loyalty_program';
  if (/\b(website|landing page|mini site)\b/.test(text)) return 'website';
  if (/\b(menu|catalog)\b/.test(text)) return 'menu';
  if (/\b(poster|flyer|graphic)\b/.test(text)) return 'promotion_graphic';
  if (/\b(slideshow|presentation)\b/.test(text)) return 'slideshow';
  if (/\b(social post|instagram|facebook post)\b/.test(text)) return 'social_post';
  if (/\b(video|reel|story)\b/.test(text)) return 'promotion_video';
  if (/\b(store profile|create store)\b/.test(text)) return 'store_profile';
  return null;
}

/**
 * @param {object} args
 */
export async function tryRouteUniversalArtifactIntent(args) {
  if (!isUniversalArtifactFactoryEnabled()) return null;

  const intentLabel = String(args.intentLabel ?? '').trim();
  const userMessage = typeof args.userMessage === 'string' ? args.userMessage.trim() : '';
  const intent = userMessage || intentLabel;

  const factoryResolved = resolveFactoryIntent({ intentLabel, userMessage }, { intentLabel, userMessage });
  const artifactType =
    resolveUafArtifactType(intentLabel, userMessage) ??
    (factoryResolved?.factoryId?.includes('creative') ? 'promotion_video' : null) ??
    (factoryResolved?.factoryId?.includes('campaign') ? 'promotion_offer' : null);

  if (!artifactType) return null;

  const userId = String(args.userId ?? '').trim();
  const missionId = String(args.missionId ?? '').trim();
  if (!userId || !missionId) {
    return {
      ok: false,
      blocked: true,
      error: { code: 'AUTH_REQUIRED', message: 'Authentication and mission are required' },
    };
  }

  const dispatchResult = await unifiedDispatch(
    {
      type: 'execute_artifact',
      payload: {
        artifactType,
        objective: intent,
        missionId,
        userId,
        storeId: args.storeId ?? args.context?.storeId ?? null,
        context: { ...(args.context ?? {}), intentLabel, userMessage },
        inputs: args.inputs ?? {},
        outputs: args.outputs ?? {},
      },
    },
    { source: 'intake_v2_uaf' },
  );

  return {
    ok: dispatchResult?.status === 'ok',
    routed: 'universal_artifact_factory',
    artifactType,
    dispatchResult,
    missionId,
    userId,
  };
}

export { ARTIFACT_TYPES };
