/**
 * Phase 3 — multimodal intent: NL, reference image, URL, Cardbey asset, store/project context.
 */

import { buildCanonicalIntent } from './intentEngine.js';
import { MULTIMODAL_INPUT } from './types.js';

/**
 * Normalize multimodal inputs into a canonical Intent + modality context.
 * @param {object} input
 */
export async function buildMultimodalIntent(input = {}) {
  const modalities = detectModalities(input);
  const utterance = deriveUtterance(input, modalities);
  const base = await buildCanonicalIntent({
    ...input,
    utterance,
    intent: {
      ...(input.intent || {}),
      ...contextIntentHints(input),
    },
  });

  if (!base.ok) return base;

  const reference = buildReferenceContext(input, modalities);
  const intent = {
    ...base.intent,
    modalities,
    multimodal: true,
    reference,
    storeContext: input.storeContext || input.store || null,
    projectContext: input.projectContext || input.project || null,
    similarity: reference.imageUrl || reference.assetId
      ? { mode: 'similar_to_reference', strength: 0.7 }
      : null,
    audioForVideo: Boolean(
      /music|audio|soundtrack|spa video|background music/i.test(utterance) ||
        input.preferAudio === true,
    ),
    findAlternativeTo: input.unavailableResourceId || input.findAlternativeTo || null,
  };

  return {
    ok: true,
    intent,
    modalities,
    authority: 'multimodal_intent_engine',
  };
}

function detectModalities(input) {
  const out = [];
  if (input.utterance || input.query || input.text) out.push(MULTIMODAL_INPUT.NATURAL_LANGUAGE);
  if (input.referenceImageUrl || input.referenceImage || input.imageUrl) {
    out.push(MULTIMODAL_INPUT.REFERENCE_IMAGE);
  }
  if (input.sourceUrl || input.pastedUrl || input.url) out.push(MULTIMODAL_INPUT.SOURCE_URL);
  if (input.cardbeyAssetId || input.assetId || input.universalAssetId) {
    out.push(MULTIMODAL_INPUT.CARDBEY_ASSET);
  }
  if (input.storeContext || input.storeId || input.store) out.push(MULTIMODAL_INPUT.STORE_CONTEXT);
  if (input.projectContext || input.projectId || input.project) {
    out.push(MULTIMODAL_INPUT.PROJECT_CONTEXT);
  }
  if (!out.length) out.push(MULTIMODAL_INPUT.NATURAL_LANGUAGE);
  return out;
}

function deriveUtterance(input, modalities) {
  let u = String(input.utterance || input.query || input.text || '').trim();
  if (!u && modalities.includes(MULTIMODAL_INPUT.REFERENCE_IMAGE)) {
    u = 'Find videos similar to this image';
  }
  if (!u && modalities.includes(MULTIMODAL_INPUT.SOURCE_URL)) {
    u = 'Find a commercial-use alternative to this source';
  }
  if (!u && modalities.includes(MULTIMODAL_INPUT.CARDBEY_ASSET)) {
    u = 'Find matching resources for this Cardbey asset';
  }
  if (input.unavailableResourceId && !/alternative/i.test(u)) {
    u = `${u || 'Find'} a commercial-use alternative to this unavailable clip`.trim();
  }
  return u;
}

function contextIntentHints(input) {
  const store = input.storeContext || input.store || {};
  const hints = {};
  if (store.industry) hints.industry = store.industry;
  if (store.channel) hints.channel = store.channel;
  if (input.mediaType) hints.mediaType = input.mediaType;
  if (/spa|wellness|relax/i.test(String(store.industry || input.utterance || ''))) {
    hints.industry = hints.industry || 'health-beauty';
    hints.preferences = { mood: 'calm' };
  }
  if (/café|cafe|bakery|restaurant/i.test(String(store.industry || input.utterance || ''))) {
    hints.industry = hints.industry || 'food-drink';
  }
  return hints;
}

function buildReferenceContext(input, modalities) {
  return {
    imageUrl: input.referenceImageUrl || input.referenceImage || input.imageUrl || null,
    sourceUrl: input.sourceUrl || input.pastedUrl || input.url || null,
    assetId: input.cardbeyAssetId || input.assetId || input.universalAssetId || null,
    unavailableResourceId: input.unavailableResourceId || null,
    modalities,
  };
}
