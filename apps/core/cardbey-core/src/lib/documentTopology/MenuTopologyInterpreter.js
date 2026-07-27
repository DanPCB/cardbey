/**
 * Menu document interpreter — section/list layout (no stamp-grid business logic).
 */

import { buildDocumentTopologyFromDetected } from './documentTopologyInference.js';
import { registerDocumentInterpreter } from './DocumentInterpreterRegistry.js';

/**
 * @param {import('./documentTopologyTypes.js').DetectedDocumentGrid} detected
 * @param {Record<string, unknown>} [opts]
 */
export function buildMenuTopologyFromDetected(detected, opts = {}) {
  return buildDocumentTopologyFromDetected(detected, {
    documentType: 'MENU',
    source: opts.source ?? 'VISION_EXTRACTED',
  });
}

/** @type {import('./DocumentInterpreterRegistry.js').DocumentInterpreter} */
export const menuTopologyInterpreter = {
  documentType: 'MENU',
  buildTopologyFromDetected: buildMenuTopologyFromDetected,
};

registerDocumentInterpreter(menuTopologyInterpreter);

export default menuTopologyInterpreter;
