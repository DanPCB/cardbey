import { createHash } from 'node:crypto';
import type { MarketSignalInput } from './types.js';

function normalizeForFingerprint(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Deterministic fingerprint for exact-duplicate detection in pilot batches.
 * Not semantic clustering — same sourceRef always maps to same fingerprint component.
 */
export function buildMarketSignalFingerprint(input: {
  rawText: string;
  sourceType: string;
  sourceRef?: string | null;
}): string {
  const payload = [
    input.sourceType,
    (input.sourceRef ?? '').trim(),
    normalizeForFingerprint(input.rawText),
  ].join('::');
  return createHash('sha256').update(payload).digest('hex').slice(0, 24);
}

export function detectDuplicateSignalId(
  fingerprint: string,
  seenFingerprints: Map<string, string>,
): string | null {
  return seenFingerprints.get(fingerprint) ?? null;
}

export function registerSignalFingerprint(
  fingerprint: string,
  signalId: string,
  seenFingerprints: Map<string, string>,
): void {
  if (!seenFingerprints.has(fingerprint)) {
    seenFingerprints.set(fingerprint, signalId);
  }
}

export function createSignalId(seed?: string | null): string {
  if (seed && seed.trim()) return seed.trim();
  return `msig_${createHash('sha256').update(`${Date.now()}-${Math.random()}`).digest('hex').slice(0, 16)}`;
}
