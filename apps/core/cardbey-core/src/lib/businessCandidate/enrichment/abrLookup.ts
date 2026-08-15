/**
 * Public ABN Lookup — best-effort scrape of abr.business.gov.au search.
 * No authentication.
 *
 * Policy: ABR is legal/entity corroboration only — never overwrite trading name
 * or marketing description from ABR alone.
 *
 * Cancelled detection is conservative: ResultsActive searches return active entities;
 * do not treat page chrome containing the word "Cancelled" as entity cancellation.
 */

import { fetchHtml } from '../../social-import/scrapeUtils.js';
import type { EnrichmentBudget } from './budget.js';
import { stripHtmlToText } from './htmlUtils.js';
import { statusResult, successResult, type SourceAdapterResult } from './sourceStatus.js';

export type AbrLookupResult = {
  legalName: string | null;
  abn: string | null;
  entityStatus: 'Active' | 'Cancelled' | 'Unknown';
  businessState: string | null;
  sourceUrl: string;
  rawExtract: string | null;
  /** True only when cancellation is evidenced next to the matched ABN */
  cancelConfidence: 'high' | 'low' | 'none';
};

function digitsOnly(s: string): string {
  return s.replace(/\D/g, '');
}

function detectStatusNearAbn(text: string, abnDisplay: string): {
  entityStatus: 'Active' | 'Cancelled' | 'Unknown';
  cancelConfidence: 'high' | 'low' | 'none';
} {
  const idx = text.toLowerCase().indexOf(abnDisplay.toLowerCase().replace(/\s+/g, ''));
  const window =
    idx >= 0
      ? text.slice(Math.max(0, idx - 80), Math.min(text.length, idx + abnDisplay.length + 120))
      : '';

  if (/status\s*:?\s*cancelled/i.test(window) || /\bcancelled\b/i.test(window)) {
    return { entityStatus: 'Cancelled', cancelConfidence: 'high' };
  }
  if (/status\s*:?\s*active/i.test(window) || /\bactive\b/i.test(window)) {
    return { entityStatus: 'Active', cancelConfidence: 'none' };
  }
  // ResultsActive endpoint — default Active when an ABN is present
  return { entityStatus: 'Active', cancelConfidence: 'none' };
}

/**
 * Search ABR public Active results. Consumes one fetch budget slot.
 */
export async function lookupAbnPublic(
  budget: EnrichmentBudget,
  businessName: string,
  state: string | null,
): Promise<AbrLookupResult | null> {
  const q = [businessName, state].filter(Boolean).join(' ').trim();
  if (!q) return null;

  const sourceUrl = `https://abr.business.gov.au/Search/ResultsActive?SearchText=${encodeURIComponent(q)}`;
  budget.consumeFetch();
  const html = await fetchHtml(sourceUrl, { timeoutMs: 10000 });
  if (!html) return null;

  const text = stripHtmlToText(html, 12000);
  const abnMatch = text.match(/\b(\d{2}\s?\d{3}\s?\d{3}\s?\d{3})\b/);
  const abn = abnMatch ? digitsOnly(abnMatch[1]!) : null;
  if (!abn || abn.length !== 11) {
    return {
      legalName: null,
      abn: null,
      entityStatus: 'Unknown',
      businessState: state,
      sourceUrl,
      rawExtract: text.slice(0, 400),
      cancelConfidence: 'none',
    };
  }

  const status = detectStatusNearAbn(text, abnMatch![1]!);
  const legalMatch =
    text.match(
      new RegExp(`([A-Z][A-Za-z0-9 &.'-]{3,80}).{0,40}${abnMatch![1]!.replace(/\s/g, '\\s?')}`, 'i'),
    ) ?? text.match(/Entity name[:\s]+([^\n|]{3,80})/i);

  return {
    legalName: legalMatch?.[1]?.trim() ?? null,
    abn,
    entityStatus: status.entityStatus,
    businessState: state,
    sourceUrl,
    rawExtract: text.slice(0, 500),
    cancelConfidence: status.cancelConfidence,
  };
}

export function abrToAdapterResult(abr: AbrLookupResult | null): SourceAdapterResult<AbrLookupResult> {
  if (!abr) return statusResult('abr_lookup', 'NOT_FOUND', 'no ABR response');
  if (!abr.abn) return statusResult('abr_lookup', 'NOT_FOUND', 'no ABN in results', { sourceUrl: abr.sourceUrl });
  const fields = ['abn', abr.legalName ? 'legalName' : null].filter(Boolean) as string[];
  return successResult('abr_lookup', fields, abr, {
    sourceUrl: abr.sourceUrl,
    identity: abr.cancelConfidence === 'high' ? 'IDENTITY_MISMATCH' : 'PROBABLE_MATCH',
  });
}
