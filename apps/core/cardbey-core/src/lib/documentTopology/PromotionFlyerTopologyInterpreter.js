/**
 * Promotion flyer / poster interpreter — headline + offer blocks (structure only).
 */

import { buildDocumentTopologyFromDetected } from './documentTopologyInference.js';
import { registerDocumentInterpreter } from './DocumentInterpreterRegistry.js';

/**
 * @param {import('./documentTopologyTypes.js').DetectedDocumentGrid} detected
 * @param {Record<string, unknown>} [opts]
 */
export function buildFlyerTopologyFromDetected(detected, opts = {}) {
  return buildDocumentTopologyFromDetected(detected, {
    documentType: 'PROMOTION_FLYER',
    source: opts.source ?? 'VISION_EXTRACTED',
  });
}

/** @type {import('./DocumentInterpreterRegistry.js').DocumentInterpreter} */
export const promotionFlyerTopologyInterpreter = {
  documentType: 'PROMOTION_FLYER',
  buildTopologyFromDetected: buildFlyerTopologyFromDetected,
};

registerDocumentInterpreter(promotionFlyerTopologyInterpreter);

export default promotionFlyerTopologyInterpreter;
