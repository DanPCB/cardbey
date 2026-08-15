/**
 * Melbourne Batch 0 re-enrichment — description + logo/hero with hard caps.
 * Cap: ≤1 website fetch + ≤2 Claude calls per seed. No Google Places photos.
 * Never mutates verificationStatus or batchId.
 */

import { fetchHtml } from '../social-import/scrapeUtils.js';
import { postAnthropicMessages } from '../llm/anthropicProvider.js';
import { resolveAnthropicModel } from '../llm/anthropicModelConfig.js';
import * as ClearbitAdapter from '../../services/logo/ClearbitAdapter.js';
import { getPrismaClient } from '../prisma.js';
import { upsertEnrichmentCandidate } from './EnrichmentCandidateStore.js';
import { upsertSeedRecords, getSeedRecordById } from './IngestionRepository.js';
import { MELBOURNE_BATCH0_ID, filterSeedsByBatch } from './buildPilotBatchMetrics.js';
import { listSeedRecords } from './IngestionRepository.js';
import type { IngestedSeedRecord } from './types.js';
import { sanitizeEnrichmentText } from './enrichmentSafety.js';

const PLACEHOLDER_DESCRIPTIONS = new Set([
  '',
  'no description available',
  'n/a',
  'none',
  'tbd',
]);

function isPlaceholderDescription(value: string | null | undefined): boolean {
  const t = String(value ?? '').trim().toLowerCase();
  if (!t) return true;
  if (PLACEHOLDER_DESCRIPTIONS.has(t)) return true;
  if (t.length < 20) return true;
  return false;
}

function metaContent(html: string, prop: string): string | null {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']+)["']`,
    'i',
  );
  const m = re.exec(html);
  return m?.[1]?.trim() || null;
}

function stripHtmlToText(html: string): string {
  return String(html ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 8000);
}

function domainFromWebsite(website: string | null | undefined): string | null {
  if (!website) return null;
  try {
    return new URL(website.startsWith('http') ? website : `https://${website}`).hostname.replace(
      /^www\./,
      '',
    );
  } catch {
    return null;
  }
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  const trimmed = String(raw ?? '').trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced?.[1]?.trim() ?? trimmed;
  try {
    const parsed = JSON.parse(body);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

async function persistSeedFieldProvenance(
  seedId: string,
  fieldPath: string,
  sourceUrl: string,
  confidence: number,
): Promise<void> {
  const prisma = getPrismaClient();
  if (!prisma?.enrichedFieldProvenance?.create) return;
  // Pre-claim namespace: storeId = seed:<id> so we do not create Business rows.
  await prisma.enrichedFieldProvenance.create({
    data: {
      storeId: `seed:${seedId}`,
      fieldPath,
      sourceUrl,
      confidence,
    },
  });
}

export type Batch0EnrichResult = {
  seedId: string;
  businessName: string | null;
  ok: boolean;
  description: string | null;
  logoUrl: string | null;
  heroImageUrl: string | null;
  websiteFetches: number;
  claudeCalls: number;
  visualSource: string | null;
  usedGooglePlacesPhotos: false;
  message: string;
  statusBefore: string;
  statusAfter: string;
  batchIdAfter: string | null;
};

async function claudeDescribe(params: {
  businessName: string;
  suburb: string | null;
  category: string | null;
  website: string;
  pageText: string;
}): Promise<{ text: string | null; used: boolean }> {
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    return { text: null, used: false };
  }
  try {
    const model = resolveAnthropicModel('fast');
    const response = await postAnthropicMessages({
      model,
      max_tokens: 220,
      temperature: 0.2,
      messages: [
        {
          role: 'user',
          content: `Write one factual marketing description (1–2 sentences, max 280 chars) for this Melbourne business.
Rules: Use only facts implied by the provided page text and identity fields. No reviews, ratings, or invented awards. No placeholder phrases.
Business: ${params.businessName}
Suburb/city: ${params.suburb ?? 'Melbourne'}
Category: ${params.category ?? 'business'}
Website: ${params.website}
Page text excerpt: ${params.pageText.slice(0, 3500)}
Return strict JSON only: {"description": string, "confidence": number}`,
        },
      ],
    });
    const text = response?.content?.find((b: { type: string }) => b.type === 'text')?.text ?? '';
    const parsed = parseJsonObject(text);
    const description =
      typeof parsed?.description === 'string' ? sanitizeEnrichmentText(parsed.description) : null;
    if (!description || isPlaceholderDescription(description)) {
      return { text: null, used: true };
    }
    return { text: description, used: true };
  } catch {
    return { text: null, used: true };
  }
}

async function claudePickHero(params: {
  businessName: string;
  candidates: string[];
}): Promise<{ url: string | null; used: boolean }> {
  if (!params.candidates.length) return { url: null, used: false };
  if (params.candidates.length === 1 || !process.env.ANTHROPIC_API_KEY?.trim()) {
    return { url: params.candidates[0] ?? null, used: false };
  }
  try {
    const model = resolveAnthropicModel('fast');
    const response = await postAnthropicMessages({
      model,
      max_tokens: 200,
      temperature: 0,
      messages: [
        {
          role: 'user',
          content: `Pick the best exterior/interior hero image URL for "${params.businessName}" from this list of official-site image URLs.
Prefer venue photos over icons/logos. Return strict JSON: {"url": string|null}
Candidates: ${JSON.stringify(params.candidates.slice(0, 6))}`,
        },
      ],
    });
    const text = response?.content?.find((b: { type: string }) => b.type === 'text')?.text ?? '';
    const parsed = parseJsonObject(text);
    const url = typeof parsed?.url === 'string' ? parsed.url.trim() : null;
    if (url && params.candidates.includes(url)) return { url, used: true };
    return { url: params.candidates[0] ?? null, used: true };
  } catch {
    return { url: params.candidates[0] ?? null, used: true };
  }
}

/**
 * Enrich a single Batch 0 seed. Caller must pre-filter batch scope.
 */
export async function enrichMelbourneBatch0Seed(
  seed: IngestedSeedRecord,
): Promise<Batch0EnrichResult> {
  const statusBefore = seed.verificationStatus;
  const batchBefore = seed.batchId ?? seed.normalized.sourceReference ?? null;
  const website = seed.normalized.website?.trim() || null;
  const businessName = seed.normalized.businessName;

  const base: Batch0EnrichResult = {
    seedId: seed.id,
    businessName,
    ok: false,
    description: null,
    logoUrl: null,
    heroImageUrl: null,
    websiteFetches: 0,
    claudeCalls: 0,
    visualSource: null,
    usedGooglePlacesPhotos: false,
    message: '',
    statusBefore,
    statusAfter: statusBefore,
    batchIdAfter: batchBefore,
  };

  if (!website) {
    return { ...base, message: 'No website — cannot enrich safely.' };
  }

  // Cap: 1 website fetch attempt
  const html = await fetchHtml(website, { timeoutMs: 10000 });
  base.websiteFetches = 1;

  const pageText = html ? stripHtmlToText(html) : '';
  const ogDescription = html ? metaContent(html, 'og:description') : null;
  const metaDescription = html ? metaContent(html, 'description') : null;
  const ogImage = html ? metaContent(html, 'og:image') : null;

  // Claude #1 — description (only when page text available)
  let description: string | null = null;
  let descFromClaude = false;
  if (pageText.length > 80) {
    const descResult = await claudeDescribe({
      businessName: businessName ?? 'Business',
      suburb: seed.normalized.city,
      category: seed.normalized.category,
      website,
      pageText,
    });
    if (descResult.used) base.claudeCalls += 1;
    description = descResult.text;
    descFromClaude = Boolean(descResult.text);
  }
  if (isPlaceholderDescription(description)) {
    description = sanitizeEnrichmentText(ogDescription || metaDescription || '');
  }
  if (isPlaceholderDescription(description)) {
    const city = seed.normalized.city || 'Melbourne';
    const cat = seed.normalized.category || 'business';
    const suburbBit = seed.normalized.address?.includes('Fitzroy')
      ? 'Fitzroy'
      : seed.normalized.address?.includes('Carlton')
        ? 'Carlton'
        : city;
    description = `${businessName} is a local ${cat} in ${suburbBit}, Melbourne — discovered for Cardbey Batch 0 so the owner can claim and activate their Business Space.`;
  }
  // Decode common HTML entities from meta tags
  description = String(description)
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .trim();

  // Hero from official site only (no Places)
  const heroCandidates = [ogImage].filter((u): u is string => Boolean(u && /^https?:\/\//i.test(u)));
  let heroImageUrl: string | null = null;
  let visualSource: string | null = null;
  if (heroCandidates.length) {
    const heroPick = await claudePickHero({
      businessName: businessName ?? 'Business',
      candidates: heroCandidates,
    });
    if (heroPick.used) base.claudeCalls += 1;
    heroImageUrl = heroPick.url;
    visualSource = heroImageUrl ? 'owner_website_og_image' : null;
  }
  // Enforce hard cap of 2 Claude calls
  if (base.claudeCalls > 2) base.claudeCalls = 2;

  // Logo via Logo.dev (licensed_feed) — works even when HTML fetch failed
  let logoUrl: string | null = null;
  const domain = domainFromWebsite(website);
  if (domain && process.env.LOGODEV_API_KEY?.trim()) {
    try {
      const logos = await ClearbitAdapter.search(domain);
      const first = Array.isArray(logos) ? logos[0] : null;
      const url = first?.logo_url || first?.url || first?.imageUrl || null;
      if (typeof url === 'string' && url.startsWith('http')) {
        logoUrl = url;
        if (!visualSource) visualSource = 'logodev';
      }
    } catch {
      // best-effort
    }
  }

  // Persist candidates
  await upsertEnrichmentCandidate({
    seedId: seed.id,
    field: 'description',
    value: description!,
    sourceUrl: website,
    confidence: descFromClaude ? 0.85 : html ? 0.72 : 0.7,
    permissionType: ogDescription ? 'open_graph' : 'owner_website',
    status: 'suggested',
  });
  await persistSeedFieldProvenance(
    seed.id,
    'description',
    website,
    descFromClaude ? 0.85 : html ? 0.72 : 0.7,
  );

  if (heroImageUrl) {
    await upsertEnrichmentCandidate({
      seedId: seed.id,
      field: 'hero_image',
      value: heroImageUrl,
      sourceUrl: website,
      confidence: 0.8,
      permissionType: 'open_graph',
      status: 'suggested',
    });
    await persistSeedFieldProvenance(seed.id, 'heroImageUrl', website, 0.8);
  }

  if (logoUrl) {
    await upsertEnrichmentCandidate({
      seedId: seed.id,
      field: 'logo',
      value: logoUrl,
      sourceUrl: `https://img.logo.dev/${domain}`,
      confidence: 0.88,
      permissionType: 'licensed_feed',
      status: 'suggested',
    });
    await persistSeedFieldProvenance(seed.id, 'logo', `https://img.logo.dev/${domain}`, 0.88);
  }

  // If still no visual, leave hero null — do NOT fall back to Google Places photos.
  if (!logoUrl && !heroImageUrl) {
    visualSource = 'none';
  }

  // Patch enrichmentProfile only — freeze status + batchId
  const fresh = (await getSeedRecordById(seed.id)) ?? seed;
  const updated: IngestedSeedRecord = {
    ...fresh,
    verificationStatus: fresh.verificationStatus,
    batchId: fresh.batchId ?? batchBefore,
    enrichmentProfile: {
      description,
      logoUrl,
      heroImageUrl,
      enrichedAt: new Date().toISOString(),
      websiteFetches: base.websiteFetches,
      claudeCalls: base.claudeCalls,
      visualSource,
    },
    updatedAt: new Date().toISOString(),
  };
  await upsertSeedRecords([updated]);

  return {
    ...base,
    ok: !isPlaceholderDescription(description) && Boolean(logoUrl || heroImageUrl),
    description,
    logoUrl,
    heroImageUrl,
    visualSource,
    message: html
      ? 'Enrichment applied (candidates + enrichmentProfile).'
      : 'Website fetch failed — applied Logo.dev + factual description fallback (no Places photos).',
    statusAfter: updated.verificationStatus,
    batchIdAfter: updated.batchId ?? null,
  };
}

export async function listMelbourneBatch0SeedsOnly(): Promise<IngestedSeedRecord[]> {
  const all = await listSeedRecords();
  const batch0 = filterSeedsByBatch(all, MELBOURNE_BATCH0_ID);
  // Hard exclude Batch 001 / places origins
  return batch0.filter((s) => {
    const batchId = s.batchId ?? '';
    const src = s.normalized.sourceType ?? '';
    if (batchId.includes('BATCH001')) return false;
    if (src === 'places_discovery' || src === 'google_places') return false;
    return true;
  });
}

export { isPlaceholderDescription, MELBOURNE_BATCH0_ID };
