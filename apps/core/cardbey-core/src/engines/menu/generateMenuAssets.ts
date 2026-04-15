/**
 * Generate Menu Assets Tool
 * Generate menu signage assets (posters, boards, item cards)
 */

import type { GenerateMenuAssetsInput, GenerateMenuAssetsOutput } from './types.js';
import { getEventEmitter, MENU_EVENTS } from './events.js';

/**
 * Context interface for engine tools
 */
interface EngineContext {
  services: {
    images?: {
      generateMenuPosters: (params: { storeId: string; theme?: string | null }) => Promise<string[]>;
      generateMenuBoards: (params: { storeId: string; theme?: string | null }) => Promise<string[]>;
      generateItemCards: (params: { storeId: string; theme?: string | null }) => Promise<string[]>;
    };
    events: ReturnType<typeof getEventEmitter>;
  };
}

/**
 * Generate menu assets
 * Creates posters, menu boards, and item cards based on requested types
 */
export const generateMenuAssets = async (
  input: GenerateMenuAssetsInput,
  ctx?: EngineContext
): Promise<GenerateMenuAssetsOutput> => {
  const { tenantId, storeId, theme, types } = input;

  const events = ctx?.services?.events || getEventEmitter();
  const imagesService = ctx?.services?.images;

  const publicBaseUrl = process.env.PUBLIC_BASE_URL || process.env.PUBLIC_API_BASE || 'http://localhost:3000';

  // Generate posters if requested
  let posterUrls: string[] = [];
  if (types.includes('poster')) {
    if (imagesService) {
      posterUrls = await imagesService.generateMenuPosters({ storeId, theme });
    } else {
      // Fallback: Placeholder URLs
      posterUrls = [`${publicBaseUrl}/api/menu/posters/${storeId}?theme=${theme || 'default'}`];
    }
  }

  // Generate menu boards if requested
  let boardUrls: string[] = [];
  if (types.includes('menu_board')) {
    if (imagesService) {
      boardUrls = await imagesService.generateMenuBoards({ storeId, theme });
    } else {
      // Fallback: Placeholder URLs
      boardUrls = [`${publicBaseUrl}/api/menu/boards/${storeId}?theme=${theme || 'default'}`];
    }
  }

  // Generate item cards if requested
  let cardUrls: string[] = [];
  if (types.includes('item_card')) {
    if (imagesService) {
      cardUrls = await imagesService.generateItemCards({ storeId, theme });
    } else {
      // Fallback: Placeholder URLs
      cardUrls = [`${publicBaseUrl}/api/menu/cards/${storeId}?theme=${theme || 'default'}`];
    }
  }

  // Emit event
  await events.emit(MENU_EVENTS.SIGNAGE_GENERATED, {
    tenantId,
    storeId,
  });

  return {
    ok: true,
    data: {
      posterUrls,
      boardUrls,
      cardUrls,
    },
  };
};



