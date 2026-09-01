/**
 * Bridge: executive growth manual prospect path → G1 market signal analysis.
 * Does not persist, research, score, or outreach.
 */
import {
  ingestMarketSignal,
  type IngestMarketSignalResult,
  type MarketSignalInput,
} from '../marketIntent/index.js';
import type { LeadInput } from './growthCommandCenterService.js';

export function leadInputToMarketSignalInput(
  lead: LeadInput,
  options: { signalText?: string; sourceRef?: string } = {},
): MarketSignalInput {
  const rawText = (options.signalText ?? lead.notes ?? '').trim();
  if (!rawText) {
    throw new Error('signalText or lead.notes required for market intent analysis');
  }
  return {
    rawText,
    sourceType: 'executive_growth',
    sourceRef: options.sourceRef ?? lead.source ?? 'growth_command_center',
    sourceUrl: lead.website ?? null,
    actorHint: lead.businessName ?? lead.ownerName ?? null,
    locationHint: [lead.suburb, lead.city, lead.state, lead.country].filter(Boolean).join(', ') || null,
    provenance: {
      permissionBasis: lead.consentStatus === 'granted' ? 'owner_submitted' : 'manual_operator',
      ingestChannel: 'executive_growth',
      leadBusinessName: lead.businessName,
    },
    metadata: {
      leadCategory: lead.category,
      leadEmail: lead.email,
    },
  };
}

export async function analyzeLeadMarketSignal(
  lead: LeadInput,
  options: { signalText?: string; sourceRef?: string } = {},
): Promise<IngestMarketSignalResult> {
  const input = leadInputToMarketSignalInput(lead, options);
  return ingestMarketSignal(input);
}
