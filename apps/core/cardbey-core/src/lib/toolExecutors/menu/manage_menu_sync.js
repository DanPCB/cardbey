/**
 * manage_menu_sync — validate, sync, diff, and publish store menu (Round 2).
 * DANH: skill-round2-menu
 */

import { getPrismaClient } from '../../prisma.js';
import {
  getMenuDiff,
  publishMenu,
  syncFromSource,
  validateMenu,
} from '../../menu/menuSyncService.js';

/**
 * @param {object} [input]
 * @param {object} [context]
 */
export async function execute(input = {}, context = {}) {
  const storeId =
    (typeof input?.storeId === 'string' && input.storeId.trim()) ||
    (typeof context?.storeId === 'string' && context.storeId.trim()) ||
    null;

  if (!storeId) {
    return {
      status: 'failed',
      error: { code: 'VALIDATION_ERROR', message: 'storeId is required' },
      output: { ok: false, error: 'storeId is required' },
    };
  }

  const action = String(input?.action ?? 'validate').trim();
  const prisma = getPrismaClient();

  try {
    switch (action) {
      case 'sync_from_source': {
        const result = await syncFromSource(prisma, storeId, {
          source: input?.source,
          items: input?.items ?? [],
        });
        if (!result.ok) {
          return {
            status: 'blocked',
            reason: 'no_items',
            message: result.message,
            output: { ok: false, skillId: 'menu_sync', subIntent: 'sync_from_source', ...result },
          };
        }
        // Side effect: upserted Product rows from incoming menu items.
        return {
          status: 'ok',
          output: {
            ok: true,
            skillId: 'menu_sync',
            subIntent: 'sync_from_source',
            synced: result.synced,
            source: result.source,
            message: `Synced ${result.synced} items from ${result.source}`,
          },
        };
      }
      case 'get_diff': {
        const diff = await getMenuDiff(prisma, storeId, { incoming: input?.incoming ?? [] });
        // Side effect: compared incoming items against active Product rows (read-only).
        return {
          status: 'ok',
          output: {
            ok: true,
            skillId: 'menu_sync',
            subIntent: 'get_diff',
            ...diff,
            message: `Diff: +${diff.added.length} -${diff.removed.length} ~${diff.changed.length} changed`,
          },
        };
      }
      case 'publish': {
        const result = await publishMenu(prisma, storeId);
        // Side effect: set isPublished=true on all active products for store.
        return {
          status: 'ok',
          output: {
            ok: true,
            skillId: 'menu_sync',
            subIntent: 'publish',
            published: result.published,
            message: `Published ${result.published} menu items`,
          },
        };
      }
      case 'validate':
      default: {
        const validation = await validateMenu(prisma, storeId);
        // Side effect: scanned active Product rows for menu validation issues.
        return {
          status: 'ok',
          output: {
            ok: true,
            skillId: 'menu_sync',
            subIntent: 'validate',
            ...validation,
            message:
              validation.issues.length === 0
                ? `Menu valid: ${validation.total} items`
                : `Menu has ${validation.issues.length} issues to fix`,
          },
        };
      }
    }
  } catch (err) {
    return {
      status: 'failed',
      error: { message: err?.message ?? String(err) },
      output: { ok: false },
    };
  }
}

export default execute;
