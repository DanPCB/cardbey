/**
 * Ghost store enrichment — official website only, max 1 fetch + 2 Claude calls.
 * No fabrication; confidence < 0.7 fields are dropped.
 */

import { getPrismaClient } from '../prisma.js';
import { fetchHtml } from '../social-import/scrapeUtils.js';
import { searchBusinesses } from '../businessDiscovery/index.js';
import { postAnthropicMessages } from '../llm/anthropicProvider.js';
import { resolveAnthropicModel } from '../llm/anthropicModelConfig.js';
import * as ClearbitAdapter from '../../services/logo/ClearbitAdapter.js';
import { buildMediaSearchQuery } from '../../services/media/buildMediaSearchQuery.js';
import { searchAllSources } from '../../services/logo/LogoSearchService.js';

const MIN_CONFIDENCE = 0.7;
const FETCH_TIMEOUT_MS = 10_000;

function anthropicEnabled() {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

/**
 * @param {string} html
 */
function stripHtmlToText(html) {
  return String(html ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 12000);
}

/**
 * @param {unknown} raw
 */
function parseJsonObject(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced?.[1]?.trim() ?? trimmed;
  try {
    const parsed = JSON.parse(body);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * @param {string} businessName
 * @param {{ lat?: number; lng?: number } | null} location
 */
async function resolveOfficialWebsite(businessName, location) {
  const locality =
    location?.lat != null && location?.lng != null
      ? `${location.lat.toFixed(3)},${location.lng.toFixed(3)}`
      : null;
  const query = locality ? `${businessName} ${locality}` : businessName;

  // Places/search may return rich metadata — only the website URL enters enrichment.
  // No review text, ratings, photos, or editorial summaries are persisted to the store.
  const search = await searchBusinesses({ q: query, location: locality });
  const candidates = (search.candidates ?? [])
    .filter((c) => typeof c.website === 'string' && c.website.trim())
    .slice(0, 5)
    .map((c) => ({ website: c.website.trim() }));

  if (!candidates.length) return null;
  if (!anthropicEnabled()) {
    return candidates[0]?.website?.trim() ?? null;
  }

  const model = resolveAnthropicModel('fast');
  const response = await postAnthropicMessages({
    model,
    max_tokens: 400,
    temperature: 0,
    messages: [
      {
        role: 'user',
        content: `Pick the official website URL for "${businessName}" from these candidate URLs, or null if none match.
Return strict JSON only: {"officialUrl": string|null, "confidence": number}
Rules: URL must plausibly belong to this exact business. Never pick review sites, maps, or social profiles.
Candidate URLs: ${JSON.stringify(candidates)}`,
      },
    ],
  });

  const text = response?.content?.find((b) => b.type === 'text')?.text ?? '';
  const parsed = parseJsonObject(text);
  if (!parsed?.officialUrl || parsed.confidence < MIN_CONFIDENCE) return null;
  return String(parsed.officialUrl).trim();
}

/**
 * @param {string} siteUrl
 * @param {string} businessName
 */
async function extractFromOfficialSite(siteUrl, businessName) {
  const html = await fetchHtml(siteUrl, { timeoutMs: FETCH_TIMEOUT_MS });
  if (!html) return null;

  if (!anthropicEnabled()) return null;

  const text = stripHtmlToText(html);
  const model = resolveAnthropicModel('fast');
  const response = await postAnthropicMessages({
    model,
    max_tokens: 2000,
    temperature: 0,
    messages: [
      {
        role: 'user',
        content: `Extract ONLY facts literally present on this business website for "${businessName}".
Return strict JSON:
{
  "products": [{"name": string, "description": string|null, "price": number|null, "confidence": number}],
  "hours": string|null,
  "phone": string|null,
  "address": string|null,
  "socialLinks": object|null,
  "fieldConfidence": {"hours": number, "phone": number, "address": number}
}
Rules:
- price ONLY if a numeric price appears on the page for that product; otherwise omit price key entirely.
- null for anything not literally on the page. Never invent menu items, hours, or contact details.
- confidence 0-1 per field based on explicitness.

Website text:
${text}`,
      },
    ],
  });

  const raw = response?.content?.find((b) => b.type === 'text')?.text ?? '';
  return parseJsonObject(raw);
}

/**
 * @param {string} storeId
 * @param {string} fieldPath
 * @param {unknown} value
 * @param {string} sourceUrl
 * @param {number} confidence
 */
async function persistEnrichedField(storeId, fieldPath, value, sourceUrl, confidence) {
  if (confidence < MIN_CONFIDENCE || value == null || value === '') return;
  const prisma = getPrismaClient();
  await prisma.enrichedFieldProvenance.create({
    data: {
      storeId,
      fieldPath,
      sourceUrl,
      confidence,
    },
  });
}

/**
 * @param {object} params
 */
export async function enrichGhostStore(params) {
  const { storeId, extraction, location, heroImageUrl, capturedImagePaths = [] } = params;
  const businessName = extraction?.businessName?.trim() || 'Store';
  const prisma = getPrismaClient();

  const officialUrl = await resolveOfficialWebsite(businessName, location);
  const patch = {};

  if (officialUrl) {
    const extracted = await extractFromOfficialSite(officialUrl, businessName);
    if (extracted) {
      const fc = extracted.fieldConfidence ?? {};
      if (extracted.phone && (fc.phone ?? 0.8) >= MIN_CONFIDENCE) {
        patch.phone = extracted.phone;
        await persistEnrichedField(storeId, 'phone', extracted.phone, officialUrl, fc.phone ?? 0.8);
      }
      if (extracted.address && (fc.address ?? 0.8) >= MIN_CONFIDENCE) {
        patch.address = extracted.address;
        await persistEnrichedField(storeId, 'address', extracted.address, officialUrl, fc.address ?? 0.8);
      }
      if (extracted.hours && (fc.hours ?? 0.8) >= MIN_CONFIDENCE) {
        patch.tradingHours = { raw: extracted.hours, source: officialUrl };
        await persistEnrichedField(storeId, 'hours', extracted.hours, officialUrl, fc.hours ?? 0.8);
      }
      if (extracted.socialLinks && typeof extracted.socialLinks === 'object') {
        patch.socialLinks = extracted.socialLinks;
        await persistEnrichedField(storeId, 'socialLinks', JSON.stringify(extracted.socialLinks), officialUrl, 0.85);
      }

      const products = Array.isArray(extracted.products) ? extracted.products : [];
      for (let i = 0; i < Math.min(products.length, 20); i += 1) {
        const p = products[i];
        if (!p?.name || (p.confidence ?? 0) < MIN_CONFIDENCE) continue;
        const created = await prisma.product.create({
          data: {
            businessId: storeId,
            name: String(p.name).slice(0, 200),
            description: p.description?.trim() || null,
            price: typeof p.price === 'number' && Number.isFinite(p.price) ? p.price : null,
            isPublished: true,
            category: extraction.category?.trim() || 'Menu',
          },
        });
        await persistEnrichedField(
          storeId,
          `products[${i}].name`,
          p.name,
          officialUrl,
          p.confidence ?? 0.8,
        );
        if (p.price != null) {
          await persistEnrichedField(storeId, `products[${i}].price`, p.price, officialUrl, p.confidence ?? 0.8);
        }
        void created;
      }
      patch.websiteUrl = officialUrl;
    }

    const domain = domainFromUrl(officialUrl);
    try {
      const logoResults = await ClearbitAdapter.search(domain);
      const logoUrl = logoResults?.[0]?.logo_url ?? logoResults?.[0]?.logoUrl;
      if (logoUrl) {
        patch.logo = JSON.stringify({ url: logoUrl });
        patch.avatarImageUrl = logoUrl;
        await persistEnrichedField(storeId, 'logo', logoUrl, officialUrl, 0.9);
      }
    } catch {
      try {
        const logos = await searchAllSources(domain);
        const first = logos?.[0]?.logo_url ?? logos?.[0]?.logoUrl;
        if (first) {
          patch.avatarImageUrl = first;
          await persistEnrichedField(storeId, 'logo', first, officialUrl, 0.85);
        }
      } catch {
        /* optional */
      }
    }
  }

  if (!heroImageUrl && !patch.heroImageUrl) {
    try {
      const query = buildMediaSearchQuery({
        businessName,
        businessType: extraction.category ?? 'cafe',
        brandTone: extraction.brandTone ?? 'warm',
      });
      const { searchHeroMedia } = await import('../../lib/toolExecutors/media/search_hero_media.js');
      const media = await searchHeroMedia.execute({ query, mediaType: 'image' }, { storeId });
      const imageUrl = media?.output?.selected?.url ?? media?.output?.results?.[0]?.url;
      if (imageUrl) {
        patch.heroImageUrl = imageUrl;
        await persistEnrichedField(storeId, 'heroImageUrl', imageUrl, 'licensed_stock', 0.75);
      }
    } catch (err) {
      console.warn('[ghostStoreEnrichment] stock hero failed:', err?.message ?? err);
    }
  } else if (capturedImagePaths[0]) {
    patch.heroImageUrl = capturedImagePaths[0];
  }

  if (Object.keys(patch).length > 0) {
    await prisma.business.update({ where: { id: storeId }, data: patch });
  }
}

function domainFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/**
 * Fire-and-forget enrichment (creation must not block).
 * @param {object} params
 */
export function enrichGhostStoreAsync(params) {
  setImmediate(() => {
    enrichGhostStore(params).catch((err) => {
      console.warn('[ghostStoreEnrichment] async failed:', err?.message ?? err);
    });
  });
}
