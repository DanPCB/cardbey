/**
 * Platform activity events for Business Activation Runway V2.1.
 */

/**
 * @param {import('../platformActivity/platformActivityTypes.js').PlatformActivityEvent & { type: string }} input
 */
export async function emitActivationActivity(input) {
  const { emitPlatformActivity } = await import('../platformActivity/platformActivityEmitter.js');
  return emitPlatformActivity(input);
}

/**
 * @param {{
 *   type: string;
 *   seed: import('./types.js').IngestedSeedRecord;
 *   actorId?: string | null;
 *   severity?: string;
 *   title: string;
 *   message: string;
 *   metadata?: Record<string, unknown>;
 * }} params
 */
export function emitSeedActivationActivity(params) {
  const seed = params.seed;
  const businessName = seed.normalized?.businessName ?? 'Business';
  const region = seed.normalized?.country ?? seed.normalized?.city ?? null;
  void emitActivationActivity({
    type: params.type,
    severity: params.severity ?? 'info',
    actorType: params.actorId ? 'user' : 'system',
    actorId: params.actorId ?? null,
    entityType: 'business_seed',
    entityId: seed.id,
    title: params.title,
    message: params.message,
    route: `/activate-business/${seed.id}`,
    actionLabel: 'View activation',
    region,
    metadata: {
      businessName,
      claimStartedAt: seed.claimStartedAt ?? null,
      verifiedAt: seed.verifiedAt ?? null,
      activatedAt: seed.activatedAt ?? null,
      verificationDurationMs: seed.verificationDurationMs ?? null,
      activationDurationMs: seed.activationDurationMs ?? null,
      ...(params.metadata ?? {}),
    },
  }).catch(() => {});
}
