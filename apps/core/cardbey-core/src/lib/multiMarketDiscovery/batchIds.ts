/**
 * Deterministic batch / job identifiers for multi-market discovery.
 */

import { createHash, randomUUID } from 'node:crypto';
import type { MarketCountryCode } from '../marketRegistry/types.js';

export function marketLabel(countryCode: MarketCountryCode): 'australia' | 'vietnam' {
  return countryCode === 'AU' ? 'australia' : 'vietnam';
}

/**
 * Deterministic batch id for a territory+category+limit+dryRun fingerprint.
 * Includes a short salt segment so concurrent same-scope jobs remain unique when needed.
 */
export function buildDeterministicBatchId(params: {
  countryCode: MarketCountryCode;
  territoryId: string;
  categoryId: string;
  dryRun: boolean;
  requestedLimit: number;
  uniqueSuffix?: string;
}): string {
  const fingerprint = [
    params.countryCode,
    params.territoryId,
    params.categoryId,
    params.dryRun ? 'dry' : 'live',
    String(params.requestedLimit),
  ].join('|');
  const hash = createHash('sha256').update(fingerprint).digest('hex').slice(0, 10);
  const suffix = params.uniqueSuffix ?? randomUUID().slice(0, 8);
  return `MM_${params.countryCode}_${params.territoryId}_${params.categoryId}_${hash}_${suffix}`
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 120);
}

export function newJobId(): string {
  return `mmjob_${randomUUID().replace(/-/g, '')}`;
}
