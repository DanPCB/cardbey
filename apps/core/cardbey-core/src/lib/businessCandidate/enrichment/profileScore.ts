/**
 * Pre-claim profile completeness score (0–100).
 */

export interface EnrichmentProfileBag {
  name?: string | null;
  description?: string | null;
  heroImageUrl?: string | null;
  logoUrl?: string | null;
  category?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  suburb?: string | null;
  website?: string | null;
  tagline?: string | null;
  socialLinks?: Record<string, string> | Array<{ platform: string; url: string }> | null;
  openingHours?: string | null;
}

export interface ProfileScoreResult {
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  missing: string[];
  ready: boolean;
}

const FIELD_WEIGHTS: Record<string, number> = {
  name: 15,
  description: 15,
  heroImageUrl: 15,
  logoUrl: 5,
  category: 10,
  phone: 5,
  email: 5,
  address: 5,
  suburb: 5,
  website: 5,
  tagline: 5,
  socialLinks: 5,
  openingHours: 5,
};

function hasSocialLinks(
  value: EnrichmentProfileBag['socialLinks'],
): boolean {
  if (!value) return false;
  if (Array.isArray(value)) {
    return value.some((s) => Boolean(s.url?.trim()));
  }
  return Object.values(value).some((v) => Boolean(v?.trim()));
}

function fieldHasValue(field: string, bag: EnrichmentProfileBag): boolean {
  const value = bag[field as keyof EnrichmentProfileBag];
  if (field === 'description') {
    return (
      typeof value === 'string' &&
      value.split(/\s+/).filter(Boolean).length >= 40
    );
  }
  if (field === 'socialLinks') {
    return hasSocialLinks(value as EnrichmentProfileBag['socialLinks']);
  }
  return value != null && value !== '';
}

export function calculateProfileScore(bag: EnrichmentProfileBag): ProfileScoreResult {
  let score = 0;
  const missing: string[] = [];

  for (const [field, weight] of Object.entries(FIELD_WEIGHTS)) {
    if (fieldHasValue(field, bag)) {
      score += weight;
    } else {
      missing.push(field);
    }
  }

  const grade =
    score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : 'F';

  return {
    score,
    grade,
    missing,
    ready: score >= 70,
  };
}
