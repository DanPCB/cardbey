/**
 * Extracts structured menu items from fetched menu HTML.
 * Tries deterministic HTML line parsing first, then Claude Haiku via llmGateway.
 */

import { llmGateway } from '../../llm/llmGateway.js';
import { resolveAnthropicModel } from '../../llm/anthropicModelConfig.js';
import { withAgentRetry } from '../../orchestration/agentRetry.js';
import { extractMenuLinesFromHtml } from '../../storeCreationResearch/websiteMenuHtmlExtract.js';
import { parseJsonObject } from './htmlUtils.js';
import type { EnrichmentBudget } from './budget.js';
import type { ExtractedMenu, ExtractedMenuItem } from './types/menuTypes.js';

const MAX_HTML_CHARS = 12000;
const MIN_MENU_ITEMS = 3;
const MENU_MODEL = resolveAnthropicModel('fast');

function stripHtmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, MAX_HTML_CHARS);
}

function confidenceFromItems(items: ExtractedMenuItem[]): ExtractedMenu['confidence'] {
  if (items.length < MIN_MENU_ITEMS) return 'low';
  const priced = items.filter((i) => i.price != null).length;
  const pricedRatio = priced / items.length;
  if (items.length >= 5 && pricedRatio >= 0.5) return 'high';
  if (items.length >= MIN_MENU_ITEMS) return 'medium';
  return 'low';
}

function linesToMenuItems(
  lines: Array<{ name: string; price: number | null; description?: string }>,
  extractionSource: ExtractedMenuItem['extractionSource'],
  sourceConfidence: number,
): ExtractedMenuItem[] {
  return lines
    .filter((line) => line.name?.trim())
    .map((line) => ({
      name: line.name.trim(),
      description: line.description?.trim() || null,
      price: typeof line.price === 'number' && Number.isFinite(line.price) ? line.price : null,
      priceDisplay:
        typeof line.price === 'number' && Number.isFinite(line.price)
          ? `AUD ${line.price.toFixed(2)}`
          : null,
      category: null,
      dietaryTags: [],
      imageUrl: null,
      isSignatureDish: false,
      sourceConfidence,
      extractionSource,
    }));
}

function tryHeuristicMenuExtraction(
  html: string,
  extractionSource: ExtractedMenuItem['extractionSource'],
): ExtractedMenu | null {
  const lines = extractMenuLinesFromHtml(html);
  const items = linesToMenuItems(lines, extractionSource, 0.85);
  if (items.length < MIN_MENU_ITEMS) return null;
  const confidence = confidenceFromItems(items);
  return {
    items,
    sections: [],
    currency: 'AUD',
    extractedAt: new Date().toISOString(),
    source: extractionSource,
    confidence,
    rawText: stripHtmlToText(html).slice(0, 500),
  };
}

export async function extractMenuFromHtml(
  budget: EnrichmentBudget,
  html: string,
  businessName: string,
  category: string,
  source: ExtractedMenuItem['extractionSource'],
  missionId?: string,
): Promise<ExtractedMenu | null> {
  const heuristic = tryHeuristicMenuExtraction(html, source);
  if (heuristic && heuristic.confidence !== 'low') {
    return heuristic;
  }

  const cleaned = stripHtmlToText(html);
  if (cleaned.length < 100) return heuristic;

  const prompt = `You are extracting menu data from a restaurant or food business website.

Business: ${businessName}
Category: ${category}

Page content (truncated):
${cleaned}

Extract all menu items you can find. Return a JSON object:
{
  "items": [
    {
      "name": "Pho Bo",
      "description": "Beef noodle soup with rice noodles",
      "price": 14.90,
      "priceDisplay": "AUD 14.90",
      "category": "Soup",
      "dietaryTags": [],
      "isSignatureDish": false
    }
  ],
  "sections": ["Entrée", "Mains", "Drinks"],
  "currency": "AUD",
  "confidence": "high"
}

Rules:
- Only include items explicitly mentioned — do not invent dishes
- price must be a number (e.g. 14.90) or null if not found
- dietaryTags: only include ["vegetarian","vegan","gluten-free","halal","kosher"] if explicitly stated
- isSignatureDish: true only if marked as special/signature/chef's choice
- confidence: "high" if ≥5 items with prices, "medium" if few items or no prices, "low" if minimal data
- sections: the menu section headings found (e.g. "Starters", "Mains", "Desserts")
- If no menu items found at all, return { "items": [], "sections": [], "confidence": "low" }

Return ONLY valid JSON. No preamble.`;

  try {
    budget.consumeClaude();
    const response = await withAgentRetry(
      () =>
        llmGateway.generate({
          purpose: 'menu_extraction',
          provider: 'anthropic',
          model: MENU_MODEL,
          prompt,
          maxTokens: 2000,
          temperature: 0,
          responseFormat: 'json',
          tenantKey: 'enrichment',
        }),
      { agentName: 'menuExtractor', missionId },
    );

    const raw = response.text ?? '{}';
    const parsed = parseJsonObject(raw) as Record<string, unknown> | null;
    if (!parsed) return heuristic;

    const rawItems = Array.isArray(parsed.items) ? parsed.items : [];
    const enrichedItems: ExtractedMenuItem[] = rawItems
      .map((item: Record<string, unknown>) => {
        const price = typeof item.price === 'number' ? item.price : null;
        return {
          name: String(item.name ?? '').trim(),
          description: item.description ? String(item.description) : null,
          price,
          priceDisplay:
            item.priceDisplay != null
              ? String(item.priceDisplay)
              : price != null
                ? `AUD ${price.toFixed(2)}`
                : null,
          category: item.category ? String(item.category) : null,
          dietaryTags: Array.isArray(item.dietaryTags)
            ? item.dietaryTags.map(String)
            : [],
          imageUrl: null,
          isSignatureDish: Boolean(item.isSignatureDish),
          sourceConfidence:
            parsed.confidence === 'high' ? 0.9 : parsed.confidence === 'medium' ? 0.7 : 0.5,
          extractionSource: source,
        };
      })
      .filter((item) => item.name.length > 0);

    if (enrichedItems.length < MIN_MENU_ITEMS) return heuristic;

    return {
      items: enrichedItems,
      sections: Array.isArray(parsed.sections) ? parsed.sections.map(String) : [],
      currency: typeof parsed.currency === 'string' ? parsed.currency : 'AUD',
      extractedAt: new Date().toISOString(),
      source,
      confidence:
        parsed.confidence === 'high' || parsed.confidence === 'medium' || parsed.confidence === 'low'
          ? parsed.confidence
          : confidenceFromItems(enrichedItems),
      rawText: cleaned.slice(0, 500),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[menuExtractor] Failed for ${businessName}:`, message);
    return heuristic;
  }
}

export async function synthesiseMenuFromDescription(
  budget: EnrichmentBudget,
  businessName: string,
  description: string,
  subCategory: string,
  suburb: string,
  missionId?: string,
): Promise<ExtractedMenu | null> {
  const prompt = `You are helping build a business profile for ${businessName},
a ${subCategory} in ${suburb}, Australia.

Business description: ${description}

Generate 5–8 typical menu items for this type of business.
Base items on what this category of business typically serves in Melbourne, Australia.
Do NOT invent specific prices — leave price as null.
Mark all items with extractionSource: "claude_synthesis".

Return JSON:
{
  "items": [
    {
      "name": "Pho Bo",
      "description": "Traditional beef noodle soup",
      "price": null,
      "priceDisplay": null,
      "category": "Soup",
      "dietaryTags": [],
      "isSignatureDish": false
    }
  ],
  "sections": ["Mains", "Drinks"],
  "currency": "AUD",
  "confidence": "low"
}

Return ONLY valid JSON.`;

  try {
    budget.consumeClaude();
    const response = await withAgentRetry(
      () =>
        llmGateway.generate({
          purpose: 'menu_synthesis',
          provider: 'anthropic',
          model: MENU_MODEL,
          prompt,
          maxTokens: 1000,
          temperature: 0,
          responseFormat: 'json',
          tenantKey: 'enrichment',
        }),
      { agentName: 'menuSynthesis', missionId },
    );

    const parsed = parseJsonObject(response.text ?? '{}') as Record<string, unknown> | null;
    if (!parsed) return null;

    const items: ExtractedMenuItem[] = (Array.isArray(parsed.items) ? parsed.items : []).map(
      (item: Record<string, unknown>) => ({
        name: String(item.name ?? '').trim(),
        description: item.description ? String(item.description) : null,
        price: null,
        priceDisplay: null,
        category: item.category ? String(item.category) : null,
        dietaryTags: Array.isArray(item.dietaryTags) ? item.dietaryTags.map(String) : [],
        imageUrl: null,
        isSignatureDish: Boolean(item.isSignatureDish),
        sourceConfidence: 0.4,
        extractionSource: 'claude_synthesis' as const,
      }),
    ).filter((item) => item.name.length > 0);

    if (!items.length) return null;

    return {
      items,
      sections: Array.isArray(parsed.sections) ? parsed.sections.map(String) : [],
      currency: 'AUD',
      extractedAt: new Date().toISOString(),
      source: 'claude_synthesis',
      confidence: 'low',
      rawText: null,
    };
  } catch {
    return null;
  }
}
