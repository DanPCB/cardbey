/**
 * Extract Menu Tool
 * Extract menu items from image using OCR/vision
 */

import type { ExtractInput, ExtractOutput } from './types.js';
import { getEventEmitter, MENU_EVENTS } from './events.js';
import { Vision } from '../../orchestrator/services/vision.js';

/**
 * Context interface for engine tools
 */
interface EngineContext {
  services: {
    vision?: {
      parseMenu: (imageUrl: string) => Promise<{
        rawLines: string[];
        structured: Array<{
          name: string;
          category: string | null;
          price: number | null;
          currency: string | null;
          description: string | null;
        }>;
      }>;
    };
    events: ReturnType<typeof getEventEmitter>;
  };
}

/**
 * Extract menu from image
 * Uses vision service to parse menu image and extract structured items
 */
export const extractMenu = async (
  input: ExtractInput,
  ctx?: EngineContext
): Promise<ExtractOutput> => {
  const { tenantId, imageUrl } = input;

  const events = ctx?.services?.events || getEventEmitter();
  const visionService = ctx?.services?.vision;

  // Use provided vision service or fallback to Vision service
  let parsed;
  if (visionService) {
    parsed = await visionService.parseMenu(imageUrl);
  } else {
    // Fallback to orchestrator Vision service
    parsed = await Vision.parseMenu(imageUrl);
  }

  // Emit event
  await events.emit(MENU_EVENTS.MENU_EXTRACTED, {
    tenantId,
    imageUrl,
    itemCount: parsed.structured.length,
  });

  return {
    ok: true,
    data: {
      rawLines: parsed.rawLines,
      structuredItems: parsed.structured,
    },
  };
};

