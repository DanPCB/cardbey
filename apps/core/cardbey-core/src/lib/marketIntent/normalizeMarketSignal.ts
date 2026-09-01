import type { ExternalMarketSignal, MarketSignalInput } from './types.js';
import { buildMarketSignalFingerprint, createSignalId } from './signalFingerprint.js';

function detectLanguageHint(text: string, explicit?: string | null): string | null {
  if (explicit?.trim()) return explicit.trim();
  const sample = text.slice(0, 500);
  if (/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(sample)) {
    return 'vi';
  }
  if (/[a-z]/i.test(sample)) return 'en';
  return null;
}

export function validateMarketSignalInput(input: MarketSignalInput): {
  ok: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  if (!input || typeof input !== 'object') {
    return { ok: false, errors: ['input must be an object'] };
  }
  if (!input.rawText || !String(input.rawText).trim()) {
    errors.push('rawText is required');
  }
  if (!input.sourceType || !String(input.sourceType).trim()) {
    errors.push('sourceType is required');
  }
  return { ok: errors.length === 0, errors };
}

export function normalizeMarketSignal(input: MarketSignalInput): ExternalMarketSignal {
  const validation = validateMarketSignalInput(input);
  if (!validation.ok) {
    throw new Error(`INVALID_INPUT: ${validation.errors.join('; ')}`);
  }

  const rawText = String(input.rawText).trim();
  const signalId = createSignalId(input.signalId);
  const fingerprint = buildMarketSignalFingerprint({
    rawText,
    sourceType: input.sourceType,
    sourceRef: input.sourceRef,
  });

  return {
    signalId,
    fingerprint,
    sourceType: input.sourceType,
    sourceRef: input.sourceRef ?? null,
    sourceUrl: input.sourceUrl ?? null,
    observedAt: input.observedAt ?? null,
    capturedAt: new Date().toISOString(),
    rawText,
    language: detectLanguageHint(rawText, input.language),
    actorHint: input.actorHint ?? null,
    locationHint: input.locationHint ?? null,
    provenance: {
      permissionBasis: input.provenance?.permissionBasis ?? null,
      ingestedBy: input.provenance?.ingestedBy ?? null,
      sourcePlatform: input.provenance?.sourcePlatform ?? null,
      ingestChannel: input.provenance?.ingestChannel ?? 'market_intent_g1',
      ...input.provenance,
    },
    metadata: input.metadata ?? {},
    attributionContext: input.attributionContext ?? null,
  };
}
