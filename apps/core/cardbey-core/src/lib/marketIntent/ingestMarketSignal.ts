import type { IngestMarketSignalResult, MarketSignalInput } from './types.js';
import { normalizeMarketSignal } from './normalizeMarketSignal.js';
import { analyzeMarketSignal } from './analyzeMarketSignal.js';
import type { LlmGenerateFn } from './extractMarketIntentWithLlm.js';
import {
  detectDuplicateSignalId,
  registerSignalFingerprint,
} from './signalFingerprint.js';

export type IngestMarketSignalOptions = {
  tenantKey?: string;
  llmGenerate?: LlmGenerateFn;
  forceRuleAssisted?: boolean;
  /** Shared map for batch duplicate detection within a pilot run. */
  seenFingerprints?: Map<string, string>;
};

/**
 * Smallest G1 ingestion path: normalize signal → analyze intent → return both.
 * No entity resolution, research, scoring, or outreach.
 */
export async function ingestMarketSignal(
  input: MarketSignalInput,
  options: IngestMarketSignalOptions = {},
): Promise<IngestMarketSignalResult> {
  const signal = normalizeMarketSignal(input);
  const seen = options.seenFingerprints ?? new Map<string, string>();
  const duplicateOfSignalId = detectDuplicateSignalId(signal.fingerprint, seen);
  registerSignalFingerprint(signal.fingerprint, signal.signalId, seen);

  const analysis = await analyzeMarketSignal(signal, {
    tenantKey: options.tenantKey,
    llmGenerate: options.llmGenerate,
    forceRuleAssisted: options.forceRuleAssisted,
  });

  return {
    signal,
    analysis,
    duplicateOfSignalId,
  };
}

/**
 * Batch ingest for pilot cohorts (e.g. 100 signals).
 */
export async function ingestMarketSignalBatch(
  inputs: MarketSignalInput[],
  options: Omit<IngestMarketSignalOptions, 'seenFingerprints'> = {},
): Promise<IngestMarketSignalResult[]> {
  const seenFingerprints = new Map<string, string>();
  const results: IngestMarketSignalResult[] = [];
  for (const input of inputs) {
    results.push(
      await ingestMarketSignal(input, {
        ...options,
        seenFingerprints,
      }),
    );
  }
  return results;
}
