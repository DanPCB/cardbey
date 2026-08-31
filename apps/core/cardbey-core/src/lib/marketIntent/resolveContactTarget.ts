import type { ExternalMarketSignal } from './types.js';
import type { MarketEntityResearch } from './entityTypes.js';
import type { ContactTarget } from './connectionTypes.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ResolveContactTargetInput = {
  research: MarketEntityResearch | null;
  explicitEmail?: string | null;
  explicitPhone?: string | null;
  leadEmail?: string | null;
  leadPhone?: string | null;
  permissionBasis?: string | null;
};

/**
 * Resolve contact target from evidence only — never guess email addresses.
 */
export function resolveContactTarget(input: ResolveContactTargetInput): ContactTarget | null {
  if (input.explicitEmail?.trim() && EMAIL_RE.test(input.explicitEmail.trim())) {
    return {
      type: 'email',
      value: input.explicitEmail.trim().toLowerCase(),
      label: 'Explicitly supplied email',
      source: 'explicit_input',
      confidence: 0.95,
      verified: true,
    };
  }

  if (input.leadEmail?.trim() && EMAIL_RE.test(input.leadEmail.trim())) {
    return {
      type: 'email',
      value: input.leadEmail.trim().toLowerCase(),
      label: 'Lead record email',
      source: 'lead_record',
      confidence: input.permissionBasis === 'owner_submitted' ? 0.9 : 0.75,
      verified: input.permissionBasis === 'owner_submitted' || input.permissionBasis === 'manual_operator',
    };
  }

  for (const contact of input.research?.publicContacts ?? []) {
    if (contact.type === 'email' && EMAIL_RE.test(contact.value)) {
      return {
        type: 'email',
        value: contact.value.trim().toLowerCase(),
        label: 'Public business email from research',
        source: 'g2_research',
        confidence: contact.confidence,
        verified: contact.basis === 'FACT' && contact.confidence >= 0.7,
      };
    }
  }

  if (input.explicitPhone?.trim()) {
    return {
      type: 'phone',
      value: input.explicitPhone.trim(),
      label: 'Explicitly supplied phone',
      source: 'explicit_input',
      confidence: 0.85,
      verified: true,
    };
  }

  if (input.leadPhone?.trim()) {
    return {
      type: 'phone',
      value: input.leadPhone.trim(),
      label: 'Lead record phone',
      source: 'lead_record',
      confidence: 0.7,
      verified: false,
    };
  }

  const website = input.research?.digitalPresence?.website;
  if (website?.trim()) {
    return {
      type: 'website',
      value: website.trim(),
      label: 'Public website — manual contact required',
      source: 'g2_research',
      confidence: 0.6,
      verified: false,
    };
  }

  return null;
}

export function isSocialOriginatedSignal(signal: ExternalMarketSignal): boolean {
  return signal.sourceType === 'social_post_copy' || signal.sourceType === 'community_post';
}
