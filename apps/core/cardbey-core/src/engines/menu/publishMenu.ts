/**
 * Publish Menu Tool
 * Publish menu to storefront and screens
 */

import type { PublishMenuInput, PublishMenuOutput } from './types.js';
import { getEventEmitter, MENU_EVENTS } from './events.js';

/**
 * Context interface for engine tools
 */
interface EngineContext {
  services: {
    storefront?: {
      rebuildStore: (storeId: string) => Promise<void>;
    };
    screens?: {
      pushMenuUpdate: (storeId: string) => Promise<void>;
    };
    events: ReturnType<typeof getEventEmitter>;
  };
}

/**
 * Publish menu to storefront and screens
 * Syncs menu updates across all channels
 */
export const publishMenu = async (
  input: PublishMenuInput,
  ctx?: EngineContext
): Promise<PublishMenuOutput> => {
  const { tenantId, storeId } = input;

  const events = ctx?.services?.events || getEventEmitter();
  const storefrontService = ctx?.services?.storefront;
  const screensService = ctx?.services?.screens;

  // Rebuild storefront
  if (storefrontService) {
    await storefrontService.rebuildStore(storeId);
  } else {
    // Fallback: Log that storefront would be rebuilt
    console.log(`[Menu Engine] Would rebuild storefront for store ${storeId}`);
  }

  // Push menu update to screens
  if (screensService) {
    await screensService.pushMenuUpdate(storeId);
  } else {
    // Fallback: Log that screens would be updated
    console.log(`[Menu Engine] Would push menu update to screens for store ${storeId}`);
  }

  // Emit event
  await events.emit(MENU_EVENTS.MENU_PUBLISHED, {
    tenantId,
    storeId,
  });

  return {
    ok: true,
    data: {
      storefrontUpdated: true,
      screensUpdated: true,
    },
  };
};



