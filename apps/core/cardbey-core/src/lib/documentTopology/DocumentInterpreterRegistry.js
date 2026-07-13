/**
 * Document interpreter registry — routes extracted topology to business interpreters.
 */

/** @typedef {import('./documentTopologyTypes.js').DocumentType} DocumentType */

/** @typedef {{
 *   documentType: DocumentType;
 *   buildTopologyFromDetected: (detected: import('./documentTopologyTypes.js').DetectedDocumentGrid, opts?: Record<string, unknown>) => unknown;
 *   inferBusinessRule?: (topology: unknown, hints?: Record<string, unknown>) => unknown;
 * }} DocumentInterpreter
 */

/** @type {Map<DocumentType, DocumentInterpreter>} */
const registry = new Map();

/**
 * @param {DocumentInterpreter} interpreter
 */
export function registerDocumentInterpreter(interpreter) {
  if (!interpreter?.documentType) {
    throw new Error('registerDocumentInterpreter requires documentType');
  }
  registry.set(interpreter.documentType, interpreter);
}

/**
 * @param {DocumentType} documentType
 */
export function getDocumentInterpreter(documentType) {
  return registry.get(documentType) ?? registry.get('UNKNOWN') ?? null;
}

/**
 * @param {import('./documentTopologyTypes.js').DetectedDocumentGrid} detected
 * @param {DocumentType} documentType
 * @param {Record<string, unknown>} [opts]
 */
export function interpretDetectedDocument(detected, documentType, opts = {}) {
  const interpreter = getDocumentInterpreter(documentType);
  if (!interpreter) return { ok: false, error: 'no_interpreter' };

  const topology = interpreter.buildTopologyFromDetected(detected, opts);
  if (!topology) return { ok: false, error: 'empty_topology' };

  const rule = interpreter.inferBusinessRule
    ? interpreter.inferBusinessRule(topology, opts)
    : null;

  return { ok: true, topology, rule, documentType };
}

export function listRegisteredDocumentTypes() {
  return [...registry.keys()];
}

export default {
  registerDocumentInterpreter,
  getDocumentInterpreter,
  interpretDetectedDocument,
  listRegisteredDocumentTypes,
};
