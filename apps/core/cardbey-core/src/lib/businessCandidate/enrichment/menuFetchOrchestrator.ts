/**
 * Orchestrates menu extraction for F&B business candidates.
 * Uses up to 3 fetch slots from the shared enrichment budget.
 */

import { fetchHtml } from '../../social-import/scrapeUtils.js';
import type { EnrichmentBudget } from './budget.js';
import {
  detectMenuSources,
  mapMenuSourceToExtractionSource,
} from './menuPageDetector.js';
import { extractMenuFromHtml, synthesiseMenuFromDescription } from './menuExtractor.js';
import type { ExtractedMenu } from './types/menuTypes.js';

const MAX_MENU_FETCHES = 3;
const MENU_FETCH_TIMEOUT_MS = 15_000;

const FOOD_CATEGORY_TERMS = [
  'food',
  'fast_food',
  'food & drink',
  'food and drink',
  'restaurant',
  'cafe',
  'café',
  'bakery',
  'bar',
  'pub',
  'bistro',
  'takeaway',
  'catering',
  'kitchen',
  'diner',
  'eatery',
  'pizzeria',
  'sushi',
  'noodle',
  'hotpot',
];

const FOOD_NAME_SIGNALS = [
  'bakery',
  'bakehouse',
  'cafe',
  'café',
  'restaurant',
  'kitchen',
  'grill',
  'pizzeria',
  'sushi',
  'noodle',
  'bistro',
  'eatery',
  'diner',
  'brewery',
  'patisserie',
];

export function isFoodBusinessCategory(
  category: string | null,
  subCategory: string | null,
  businessName?: string | null,
): boolean {
  const hay = `${category ?? ''} ${subCategory ?? ''}`.toLowerCase();
  if (FOOD_CATEGORY_TERMS.some((term) => hay.includes(term))) {
    return true;
  }

  const nameHay = String(businessName ?? '').toLowerCase();
  if (nameHay && FOOD_NAME_SIGNALS.some((term) => nameHay.includes(term))) {
    return true;
  }

  return false;
}

function wordCount(text: string | null | undefined): number {
  return text?.split(/\s+/).filter(Boolean).length ?? 0;
}

export function buildMenuSynthesisDescription(params: {
  businessName: string;
  category: string;
  subCategory: string | null;
  suburb: string;
  description: string | null;
}): string {
  const { businessName, category, subCategory, suburb, description } = params;
  const descWords = wordCount(description);

  if (descWords >= 15 && description?.trim()) {
    return description.trim();
  }

  const parts = [
    businessName,
    'is a',
    subCategory?.trim() || category?.trim() || 'food business',
    suburb ? `in ${suburb}` : 'in Melbourne',
    'Australia.',
  ];

  if (description && descWords > 3) {
    parts.push(description.trim());
  }

  return parts.join(' ');
}

export async function fetchAndExtractMenu(params: {
  budget: EnrichmentBudget;
  businessName: string;
  category: string;
  subCategory: string | null;
  suburb: string;
  description: string | null;
  websiteHtml: string | null;
  baseUrl: string | null;
  googlePlacesData: Record<string, unknown> | null;
  missionId?: string;
}): Promise<ExtractedMenu | null> {
  const {
    budget,
    businessName,
    category,
    subCategory,
    suburb,
    description,
    websiteHtml,
    baseUrl,
    googlePlacesData,
    missionId,
  } = params;

  if (!isFoodBusinessCategory(category, subCategory, businessName)) return null;

  let menuFetches = 0;
  const canFetchMenu = () =>
    menuFetches < MAX_MENU_FETCHES && budget.websiteFetches < budget.maxFetches;

  let menuSources = websiteHtml && baseUrl ? detectMenuSources(websiteHtml, baseUrl, googlePlacesData) : [];
  if (menuSources.length) {
    console.log(`[menu] ${businessName} — found ${menuSources.length} menu source(s)`);
  }

  for (const source of menuSources) {
    if (!canFetchMenu()) break;
    try {
      budget.consumeFetch();
      menuFetches += 1;
      const html = await fetchHtml(source.url, { timeoutMs: MENU_FETCH_TIMEOUT_MS });
      if (!html) continue;

      const extractionSource = mapMenuSourceToExtractionSource(source.type, source.url);
      const menu = await extractMenuFromHtml(
        budget,
        html,
        businessName,
        subCategory ?? category,
        extractionSource,
        missionId,
      );

      if (menu && menu.confidence !== 'low') {
        console.log(
          `[menu] ${businessName} — extracted ${menu.items.length} items` +
            ` (confidence: ${menu.confidence}) from ${source.type}`,
        );
        return menu;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[menu] Fetch failed for ${source.url}:`, message);
    }
  }

  if (budget.claudeCalls < budget.maxClaude) {
    const synthesisDescription = buildMenuSynthesisDescription({
      businessName,
      category,
      subCategory,
      suburb,
      description,
    });

    console.log(
      `[menu] ${businessName} — synthesis fallback` +
        ` (desc words: ${wordCount(description)})`,
    );

    return synthesiseMenuFromDescription(
      budget,
      businessName,
      synthesisDescription,
      subCategory ?? category,
      suburb,
      missionId,
    );
  }

  return null;
}
