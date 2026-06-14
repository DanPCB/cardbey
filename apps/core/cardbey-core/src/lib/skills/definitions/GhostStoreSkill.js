/**
 * Ghost store creation + enrichment from community vision captures.
 */

import { skillRegistry } from '../SkillRegistry.js';

/** @type {import('../types.js').SkillDefinition} */
export const GhostStoreSkill = {
  name: 'ghost_store',
  version: '1.0',
  description: 'Create and enrich unverified community-captured ghost stores.',
  triggers: ['create_ghost_store', 'ghost_store', 'confirm_ghost_store'],
  requiredContext: ['userId'],
  observable: true,
  displayResultType: 'ghost_store_result',
  steps: [
    {
      id: 'create_ghost_store',
      name: 'Create ghost store',
      tool: 'create_ghost_store',
      required: true,
      buildInput: (ctx) => ({
        extraction: ctx.toolInput?.extraction ?? {},
        location: ctx.toolInput?.location ?? null,
        visionEventId: ctx.toolInput?.visionEventId ?? ctx.toolInput?.eventId ?? null,
        imagePaths: ctx.toolInput?.imagePaths ?? [],
        userId: ctx.userId ?? null,
        missionId: ctx.missionId ?? null,
      }),
    },
  ],
  retryPolicy: {
    maxAttempts: 1,
    backoffMs: 0,
    shouldRetry: () => false,
  },
};

if (!skillRegistry.has(GhostStoreSkill.name)) {
  skillRegistry.register(GhostStoreSkill);
}
