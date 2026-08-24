/**
 * Hard mismatch guards — conflicting images must never be accepted.
 */

import { normalizeServiceKey } from './serviceImageIntentResolver.js';

/** @typedef {{ require?: string[], reject?: string[] }} MismatchGuard */

/** @type {Record<string, MismatchGuard>} */
const SERVICE_MISMATCH_GUARDS = {
  'fence repair': {
    require: ['fence', 'fence panel', 'fence post', 'timber boundary', 'wooden fence', 'picket'],
    reject: ['tap', 'faucet', 'sink', 'indoor office', 'salon', 'bicycle', 'bedroom'],
  },
  'gutter cleaning': {
    require: ['gutter', 'roof', 'downpipe', 'ladder', 'rain gutter'],
    reject: ['salon', 'restaurant', 'beauty', 'haircut', 'spa', 'makeup'],
  },
  'tv wall mounting': {
    require: ['television', 'tv', 'wall bracket', 'wall mount', 'media wall', 'mounted tv'],
    reject: ['bed only', 'plumbing', 'outdoor fence', 'salon', 'no television'],
  },
  'flyscreen repair': {
    require: ['screen', 'flyscreen', 'mesh', 'window screen', 'screen door'],
    reject: ['office meeting', 'conference table', 'business meeting', 'restaurant dining'],
  },
  'deck maintenance': {
    require: ['deck', 'decking', 'timber deck', 'wooden deck', 'patio deck'],
    reject: ['ornamental doorway', 'interior architecture', 'front door only', 'salon'],
  },
  'door repair': {
    require: ['door', 'hinge', 'handle', 'door frame', 'doorway'],
    reject: ['fire alarm', 'smoke detector', 'chef', 'restaurant kitchen', 'bicycle'],
  },
  'tile repair': {
    require: ['tile', 'ceramic', 'grout', 'floor tile', 'wall tile'],
    reject: ['office furniture', 'desk chair', 'sofa', 'living room couch'],
  },
  'cabinet installation': {
    require: ['cabinet', 'cupboard', 'kitchen cabinet', 'storage cabinet'],
    reject: ['salon', 'office meeting', 'unrelated appliance'],
  },
  'shelf installation': {
    require: ['shelf', 'floating shelf', 'wall shelf', 'bookshelf'],
    reject: ['exterior pipe', 'plumbing pipe', 'outdoor gutter'],
  },
  'minor plumbing repairs': {
    require: ['plumb', 'tap', 'faucet', 'sink', 'pipe', 'toilet', 'leak'],
    reject: ['fence', 'deck', 'television', 'salon'],
  },
  'minor electrical assistance': {
    require: ['electric', 'outlet', 'switch', 'wiring', 'light', 'fixture', 'rope'],
    reject: ['outdoor furniture', 'deck patio', 'salon', 'restaurant', 'coiled rope', 'rope coil'],
  },
  'window cleaning': {
    require: ['window', 'glass', 'squeegee', 'cleaner', 'pane'],
    reject: ['drill', 'wood drilling', 'saw', 'woodworking'],
  },
  'pressure washing': {
    require: ['pressure washer', 'water jet', 'surface cleaning', 'driveway', 'deck'],
    reject: ['road maintenance truck', 'road truck', 'asphalt truck'],
  },
  'interior painting': {
    require: ['paint', 'roller', 'wall', 'painter', 'brush'],
    reject: ['ceiling fresco', 'ornate mural', 'classical ceiling'],
  },
  'picture hanging': {
    require: ['picture', 'frame', 'wall', 'hanging', 'artwork', 'mirror'],
    reject: ['chandelier', 'lobby', 'luxury gallery'],
  },
  'furniture assembly': {
    require: ['furniture', 'assembly', 'flat pack', 'ikea', 'wardrobe', 'desk'],
    reject: ['photography studio', 'studio lights', 'backdrop'],
  },
  'flat pack assembly': {
    require: ['flat pack', 'furniture', 'assembly', 'wardrobe', 'desk'],
    reject: ['laptop', 'electronic device', 'medical lab'],
  },
  'general home maintenance': {
    require: ['handyman', 'toolbox', 'maintenance', 'home repair', 'tools'],
    reject: ['paint roller only', 'office meeting'],
  },
  'book our consultations': {
    require: ['office', 'meeting', 'advisor', 'consultation', 'finance', 'business', 'document'],
    reject: [
      'handyman',
      'truck',
      'sanitation',
      'garbage',
      'pressure wash',
      'gutter',
      'fence',
      'plumber',
      'high visibility',
      'hi-vis',
    ],
  },
};

/**
 * @param {string} text
 */
function norm(text) {
  return String(text ?? '').toLowerCase();
}

/**
 * @param {string} canonicalTitle
 * @param {string} candidateText
 * @returns {{ pass: boolean, conflicts: string[], missingRequired: boolean }}
 */
export function evaluateServiceMismatchGuard(canonicalTitle, candidateText) {
  const key = normalizeServiceKey(canonicalTitle);
  const guard = SERVICE_MISMATCH_GUARDS[key];
  if (!guard) return { pass: true, conflicts: [], missingRequired: false };

  const text = norm(candidateText);
  const conflicts = (guard.reject ?? []).filter((term) => text.includes(norm(term)));

  const required = guard.require ?? [];
  const hasRequired =
    required.length === 0 || required.some((term) => text.includes(norm(term)));

  if (conflicts.length > 0) {
    return { pass: false, conflicts, missingRequired: !hasRequired };
  }
  if (!hasRequired) {
    return { pass: false, conflicts: [], missingRequired: true };
  }
  return { pass: true, conflicts: [], missingRequired: false };
}
