/**
 * Route classified vision events to storefront, document ingestion, or stub actions.
 */

import { recoverStoreId } from '../runwayContext.js';
import { matchStoreByVisionExtraction } from '../ghostStore/storeMatchByVision.js';
import { resolveDeepLink } from './visionDeepLinkResolver.js';
import { dispatchDocumentIngestionFromVision } from './documentIngestionFromVision.js';
import { normalizeVisionIntent } from './visionEventContract.js';

const UNSUPPORTED_MESSAGES = {
  receipt:
    'Receipt capture is not supported yet. Try photographing a menu, flyer, or store sign.',
  unknown:
    'We could not tell what this photo is for. Try a clearer shot of a store sign, menu, or flyer.',
};

/**
 * @param {import('./visionEventContract.js').VisionEvent} event
 * @param {object} [options]
 * @param {string|null} [options.userId]
 * @param {string|null} [options.storeIdHint]
 * @param {string|null} [options.missionId]
 */
export async function routeVisionEvent(event, options = {}) {
  const intent = normalizeVisionIntent(event?.intent);
  const extraction = event?.extraction ?? {};
  const location = event?.location ?? null;
  const userId = options.userId ?? event?.userId ?? null;
  const storeIdHint = options.storeIdHint ?? event?.storeIdHint ?? null;
  const resolvedStoreId = recoverStoreId({
    storeId: storeIdHint,
    activeStoreId: storeIdHint,
    userId,
  });

  switch (intent) {
    case 'qr_payload': {
      const payload = event?.decodedPayload ?? extraction?.notes ?? '';
      return resolveDeepLink(payload);
    }
    case 'flyer_menu': {
      if (resolvedStoreId) {
        return dispatchDocumentIngestionFromVision({
          storeId: resolvedStoreId,
          userId,
          missionId: options.missionId ?? null,
          imagePaths: event?.imagePaths ?? [],
        });
      }
      const matched = await matchStoreByVisionExtraction(extraction.businessName, location);
      if (matched) {
        // Consumer capture — do not dispatch ingestion on behalf of a stranger's store.
        return {
          action: 'open_store',
          storeId: matched.id,
          slug: matched.slug,
          storeName: matched.name,
          matchedFrom: 'flyer_menu',
        };
      }
      return {
        action: 'ghost_store_candidate',
        intent: 'flyer_menu',
        extraction,
        location,
      };
    }
    case 'store_sign': {
      const matched = await matchStoreByVisionExtraction(extraction.businessName, location);
      if (matched) {
        return {
          action: 'open_store',
          storeId: matched.id,
          slug: matched.slug,
          storeName: matched.name,
        };
      }
      return {
        action: 'ghost_store_candidate',
        extraction,
        location,
      };
    }
    case 'product_photo': {
      if (resolvedStoreId) {
        return {
          action: 'product_capture_candidate',
          storeId: resolvedStoreId,
          extraction,
        };
      }
      return {
        action: 'needs_store_context',
        intent,
        message: 'Open a store dashboard before capturing product photos.',
      };
    }
    case 'receipt':
    case 'unknown':
    default:
      return {
        action: 'unsupported',
        intent,
        message: UNSUPPORTED_MESSAGES[intent] ?? UNSUPPORTED_MESSAGES.unknown,
      };
  }
}
