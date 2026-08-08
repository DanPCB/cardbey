/**
 * AI Provider Registry — modality-based abstraction.
 * URI services must never import OpenAI/Claude/etc. directly.
 * Routes through llmGateway when available; heuristic fallbacks otherwise.
 */

import { AI_MODALITY } from './types.js';

/** @type {Map<string, { modality: string, id: string, invoke: Function, providerHint?: string }>} */
const registry = new Map();

function key(modality, id = 'default') {
  return `${modality}:${id}`;
}

export function registerAiProvider(modality, entry) {
  if (!Object.values(AI_MODALITY).includes(modality)) {
    throw new Error(`unsupported_modality:${modality}`);
  }
  const id = entry.id || 'default';
  registry.set(key(modality, id), {
    modality,
    id,
    invoke: entry.invoke,
    providerHint: entry.providerHint || 'gateway',
  });
}

export function listAiProviders() {
  return [...registry.values()].map(({ modality, id, providerHint }) => ({
    modality,
    id,
    providerHint,
  }));
}

export function getAiProvider(modality, id = 'default') {
  return registry.get(key(modality, id)) || registry.get(key(modality, 'default')) || null;
}

/**
 * Invoke a modality. Never selects a vendor by name from callers.
 * @param {string} modality
 * @param {object} payload
 * @param {object} [opts]
 */
export async function invokeAiModality(modality, payload = {}, opts = {}) {
  const provider = getAiProvider(modality, opts.providerId);
  if (!provider) {
    return {
      ok: false,
      error: 'modality_not_registered',
      modality,
      tier: 'fallback',
    };
  }
  try {
    const result = await provider.invoke(payload, opts);
    return { ok: true, modality, providerId: provider.id, ...result };
  } catch (e) {
    return {
      ok: false,
      error: e?.message || String(e),
      modality,
      providerId: provider.id,
    };
  }
}

/** Heuristic text classifier — replaceable via registry. */
async function heuristicTextClassify(payload) {
  const text = String(payload.text || payload.prompt || '').toLowerCase();
  const industries = [];
  if (/café|cafe|restaurant|bakery|food|drink/.test(text)) industries.push('food-drink');
  if (/beauty|salon|hair/.test(text)) industries.push('beauty');
  if (/fashion|boutique|retail/.test(text)) industries.push('retail');
  if (/display|screen|signage|playlist/.test(text)) industries.push('display');
  let mediaType = 'image';
  if (/video|clip|motion/.test(text)) mediaType = 'video';
  if (/template|layout/.test(text)) mediaType = 'template';
  if (/audio|music|sound/.test(text)) mediaType = 'audio';
  return {
    tier: 'LIGHT_AI',
    authority: 'heuristic_not_rights',
    classification: {
      industries: industries.length ? industries : ['general'],
      mediaType,
      purpose: /display|screen/.test(text) ? 'digital_display' : 'marketing',
      mood: /relax|calm|cozy|warm/.test(text) ? 'relaxing' : null,
    },
  };
}

async function heuristicEmbed(payload) {
  const text = String(payload.text || '');
  // Deterministic lightweight pseudo-embedding for foundation (not production ML).
  const dims = 16;
  const vec = new Array(dims).fill(0);
  for (let i = 0; i < text.length; i += 1) {
    vec[i % dims] += text.charCodeAt(i) / 255;
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return {
    tier: 'METADATA',
    embedding: vec.map((v) => v / norm),
    authority: 'pseudo_embedding_foundation',
  };
}

let bootstrapped = false;

export function bootstrapDefaultAiProviders() {
  if (bootstrapped) return;
  registerAiProvider(AI_MODALITY.TEXT, {
    id: 'default',
    providerHint: 'gateway_or_heuristic',
    async invoke(payload) {
      // Prefer llmGateway when configured; do not hardcode vendor.
      try {
        const { Features } = await import('../../config/features.js');
        if (Features.llm?.useGateway && Features.llm?.available) {
          const { llmGateway } = await import('../../lib/llm/llmGateway.ts');
          const out = await llmGateway.generate({
            prompt: String(payload.prompt || payload.text || ''),
            maxTokens: 400,
            temperature: 0.2,
          });
          return {
            tier: 'FULL_AI',
            text: out?.text || out?.content || '',
            authority: 'llm_gateway',
          };
        }
      } catch {
        /* fall through */
      }
      return heuristicTextClassify(payload);
    },
  });
  registerAiProvider(AI_MODALITY.CLASSIFICATION, {
    id: 'default',
    providerHint: 'heuristic',
    invoke: heuristicTextClassify,
  });
  registerAiProvider(AI_MODALITY.EMBEDDING, {
    id: 'default',
    providerHint: 'pseudo_or_gateway',
    async invoke(payload) {
      try {
        const { Features } = await import('../../config/features.js');
        if (Features.llm?.useGateway && Features.llm?.available) {
          const { embed } = await import('../../lib/llm/llmGateway.ts');
          const out = await embed({ input: String(payload.text || '') });
          if (out?.embedding) {
            return { tier: 'FULL_AI', embedding: out.embedding, authority: 'llm_gateway' };
          }
        }
      } catch {
        /* fall through */
      }
      return heuristicEmbed(payload);
    },
  });
  registerAiProvider(AI_MODALITY.REASONING, {
    id: 'default',
    providerHint: 'gateway_or_heuristic',
    async invoke(payload) {
      return invokeAiModality(AI_MODALITY.TEXT, payload);
    },
  });
  // Vision/Speech/Translation registered as stubs — not Phase 1 execution
  for (const m of [AI_MODALITY.VISION, AI_MODALITY.SPEECH, AI_MODALITY.TRANSLATION]) {
    registerAiProvider(m, {
      id: 'default',
      providerHint: 'stub',
      async invoke() {
        return { tier: 'METADATA', stub: true, authority: 'not_enabled_phase1' };
      },
    });
  }
  bootstrapped = true;
}

bootstrapDefaultAiProviders();
