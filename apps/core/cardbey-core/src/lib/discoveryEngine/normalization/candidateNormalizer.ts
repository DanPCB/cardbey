import { cleanString, normalizePhone } from '../../businessDiscovery/businessDataNormalizer.js';
import type { BusinessCandidate } from '../types/index.js';

const SUBURB_SUFFIXES = /\s+(fitzroy|carlton|richmond|south yarra|st kilda|cbd|cbd melbourne)$/i;

function normalizeUrl(url: string | null): string | null {
  const s = cleanString(url);
  if (!s) return null;
  const withProto = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const parsed = new URL(withProto);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname.replace(/\/$/, '') || ''}`.toLowerCase();
  } catch {
    return s.toLowerCase();
  }
}

function splitNameAndSuburb(name: string | null): { businessName: string | null; suburb: string | null } {
  const s = cleanString(name);
  if (!s) return { businessName: null, suburb: null };
  const match = s.match(SUBURB_SUFFIXES);
  if (match) {
    return {
      businessName: s.slice(0, match.index).trim() || s,
      suburb: match[1],
    };
  }
  const parts = s.split(/\s+/);
  if (parts.length > 2) {
    const last = parts[parts.length - 1];
    if (/^[A-Z]/.test(last) && last.length > 3) {
      return {
        businessName: parts.slice(0, -1).join(' '),
        suburb: last,
      };
    }
  }
  return { businessName: s, suburb: null };
}

export function normalizeCandidate(candidate: BusinessCandidate): BusinessCandidate {
  const { businessName, suburb } = splitNameAndSuburb(candidate.businessName);
  const metadata = { ...candidate.metadata };
  if (suburb && !metadata.suburb) metadata.suburb = suburb;

  return {
    ...candidate,
    businessName,
    address: cleanString(candidate.address),
    city: cleanString(candidate.city),
    state: cleanString(candidate.state),
    postcode: cleanString(candidate.postcode)?.replace(/\s+/g, '') ?? null,
    country: cleanString(candidate.country),
    phone: normalizePhone(candidate.phone),
    email: cleanString(candidate.email)?.toLowerCase() ?? null,
    website: normalizeUrl(candidate.website),
    category: cleanString(candidate.category),
    metadata,
  };
}

export function normalizeCandidates(candidates: BusinessCandidate[]): BusinessCandidate[] {
  return candidates.map(normalizeCandidate);
}

export class BusinessNormalizer {
  normalize(candidate: BusinessCandidate): BusinessCandidate {
    return normalizeCandidate(candidate);
  }

  normalizeMany(candidates: BusinessCandidate[]): BusinessCandidate[] {
    return normalizeCandidates(candidates);
  }
}

export const businessCandidateNormalizer = new BusinessNormalizer();
