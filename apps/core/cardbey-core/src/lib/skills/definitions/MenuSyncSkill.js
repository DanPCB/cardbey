/**
 * Menu sync — validate, import, diff, and publish catalog items.
 * DANH: skill-round2-menu
 */

import { skillRegistry } from '../SkillRegistry.js';

/** @type {import('../types.js').SkillDefinition} */
export const MenuSyncSkill = {
  name: 'menu_sync',
  version: '1.0',
  description: 'Sync menu/catalog from external sources, validate, and publish.',
  triggers: [
    'sync_menu',
    'menu_sync',
    'import_menu',
    'update_menu',
    'sync_catalog',
    'menu_update',
    'refresh_menu',
    'menu',
  ],
  requiredContext: ['storeId', 'userId'],
  observable: true,
  steps: [
    {
      id: 'menu_action',
      name: 'Menu sync action',
      tool: 'manage_menu_sync',
      required: true,
      buildInput: (ctx) => ({
        storeId: ctx.storeId,
        action: ctx.toolInput?.action || ctx.toolInput?.subIntent || 'validate',
        source: ctx.toolInput?.source,
        items: ctx.toolInput?.items,
        incoming: ctx.toolInput?.incoming,
      }),
    },
  ],
  retryPolicy: {
    maxAttempts: 2,
    backoffMs: 1500,
    shouldRetry: (error) =>
      error?.code !== 'VALIDATION_ERROR' && error?.code !== 'PERMISSION_DENIED',
  },
};

if (!skillRegistry.has(MenuSyncSkill.name)) {
  skillRegistry.register(MenuSyncSkill);
}
