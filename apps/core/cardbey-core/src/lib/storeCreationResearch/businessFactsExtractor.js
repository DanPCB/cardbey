/**
 * Merge matched sources into attributed BusinessFacts.
 */

import { cleanString } from '../businessDiscovery/businessDataNormalizer.js';
import { summarizeDescription } from './researchSafety.js';
import { stripSeoBusinessDisplayName } from '../storeCreation/semanticPrecision.js';

/**
 * @param {import('./types.js').SourceMatchResult[]} matchedSources
 * @param {import('./types.js').StoreCreationResearchInput} input
 * @returns {import('./types.js').BusinessFacts}
 */
export function extractBusinessFacts(matchedSources, input) {
  /** @type {import('./types.js').BusinessFacts} */
  const facts = { sourceEvidence: [] };

  const pickBest = (field, candidates) => {
    const sorted = candidates
      .filter((c) => c.value != null && String(c.value).trim())
      .sort((a, b) => b.confidence - a.confidence);
    return sorted[0] ?? null;
  };

  const nameCandidates = [];
  const descCandidates = [];
  const addressCandidates = [];
  const phoneCandidates = [];
  const emailCandidates = [];
  const websiteCandidates = [];
  const categoryCandidates = [];
  const hoursCandidates = [];
  const imageCandidates = [];
  const reviewCandidates = [];

  for (const match of matchedSources) {
    const raw = match.source.raw ?? {};
    const base = {
      sourceUrl: match.source.sourceUrl ?? undefined,
      sourceType: match.source.sourceType,
      confidence: match.confidence,
    };

    if (raw.name || raw.businessName) {
      const cleaned = cleanString(raw.name ?? raw.businessName);
      nameCandidates.push({
        ...base,
        value: stripSeoBusinessDisplayName(cleaned, input.businessName),
        // SEO/page titles are weaker than Places displayName / manual input
        confidence: Math.min(match.confidence, 0.7),
      });
    }
    if (raw.description) {
      descCandidates.push({
        ...base,
        value: summarizeDescription(String(raw.description)),
        needsOwnerReview: false,
      });
    }
    if (raw.address || raw.location) {
      addressCandidates.push({ ...base, value: cleanString(raw.address ?? raw.location) });
    }
    if (raw.phone || raw.telephone) {
      phoneCandidates.push({ ...base, value: cleanString(raw.phone ?? raw.telephone) });
    }
    if (raw.email) {
      emailCandidates.push({ ...base, value: cleanString(raw.email) });
    }
    if (raw.website || raw.url) {
      websiteCandidates.push({ ...base, value: cleanString(raw.website ?? raw.url) });
    }
    if (raw.category) {
      categoryCandidates.push({ ...base, value: cleanString(raw.category) });
    }
    if (raw.openingHours) {
      hoursCandidates.push({ ...base, value: raw.openingHours });
    }
    if (Array.isArray(raw.photos)) {
      for (const photo of raw.photos.slice(0, 6)) {
        if (typeof photo === 'string' && photo.trim()) {
          imageCandidates.push({ ...base, value: photo.trim() });
        }
      }
    }
    if (raw.rating != null) {
      reviewCandidates.push({
        ...base,
        value: `Rating ${raw.rating}${raw.reviewCount ? ` (${raw.reviewCount} reviews)` : ''}`,
      });
    }

    facts.sourceEvidence.push({
      value: match.source.sourceType,
      sourceUrl: match.source.sourceUrl ?? undefined,
      sourceType: match.source.sourceType,
      confidence: match.confidence,
    });
  }

  if (input.businessName) {
    nameCandidates.push({
      value: stripSeoBusinessDisplayName(cleanString(input.businessName), input.businessName),
      sourceType: 'manual',
      confidence: 0.95,
    });
  }

  facts.businessName = pickBest('businessName', nameCandidates);
  if (facts.businessName?.value) {
    const canonical = stripSeoBusinessDisplayName(facts.businessName.value, input.businessName);
    const seoTitle = String(facts.businessName.value);
    facts.businessName = { ...facts.businessName, value: canonical };
    if (seoTitle && seoTitle !== canonical) {
      facts.seoTitle = {
        value: seoTitle,
        sourceType: facts.businessName.sourceType,
        confidence: facts.businessName.confidence,
      };
    }
  }
  facts.description = pickBest('description', descCandidates);
  facts.address = pickBest('address', addressCandidates);
  facts.phone = pickBest('phone', phoneCandidates);
  facts.email = pickBest('email', emailCandidates);
  facts.website = pickBest('website', websiteCandidates);
  facts.category = pickBest('category', categoryCandidates);
  facts.openingHours = pickBest('openingHours', hoursCandidates);
  facts.reviewsSummary = pickBest('reviewsSummary', reviewCandidates);
  facts.images = imageCandidates;

  const social = {};
  for (const match of matchedSources) {
    const links = match.source.raw?.socialLinks;
    if (!links || typeof links !== 'object') continue;
    for (const [k, v] of Object.entries(links)) {
      if (typeof v === 'string' && v.trim()) {
        social[k] = {
          value: v.trim(),
          sourceUrl: match.source.sourceUrl ?? undefined,
          sourceType: match.source.sourceType,
          confidence: match.confidence,
        };
      }
    }
  }
  if (Object.keys(social).length) facts.socialLinks = social;

  return facts;
}
