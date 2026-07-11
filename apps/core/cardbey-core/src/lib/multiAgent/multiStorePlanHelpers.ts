/**
 * Multi-store setup detection, extraction, and clarification planning.
 */
import { randomUUID } from 'node:crypto';
import type { IntentResult, MissionPlan } from '../../multiAgent/types/agent.types.js';
import { Intent } from '../../multiAgent/types/agent.types.js';

export const STORE_CATEGORY_LABELS = [
  'Fashion',
  'Food & drink',
  'Beauty',
  'Home & garden',
  'Electronics',
  'Sports',
  'Health',
  'Arts & crafts',
  'Other',
] as const;

export type MultiStoreMissingField = 'store_names' | 'categories' | 'specific_locations';

export interface MultiStoreExtractedInfo {
  count: number;
  locations: string[];
  names: string[];
  categories: string[];
  missingFields: MultiStoreMissingField[];
  isMultiStore: boolean;
  vagueLocation: boolean;
}

const MULTI_STORE_PATTERNS = [
  /(\d+)\s*(?:stores|shops|branches|locations)/i,
  /\bmultiple\s+stores\b/i,
  /\bset\s+up\s+(\d+)\b/i,
  /\bset\s+up\s+stores\b/i,
  /\bstores\s+in\s+/i,
  /\bdifferent\s+cit(?:y|ies)\b/i,
  /\bseveral\s+(?:stores|locations|cities)\b/i,
];

const VAGUE_LOCATION_PATTERNS = [
  /^different\s+cit(?:y|ies)$/i,
  /^multiple\s+(?:cities|locations|areas|regions)$/i,
  /^various\s+(?:cities|locations|areas)$/i,
  /^several\s+(?:cities|locations|areas)$/i,
  /^many\s+(?:cities|locations|areas)$/i,
  /^different\s+locations?$/i,
];

const STRUCTURED_STORE_TUPLE_RE =
  /([A-Za-z][A-Za-z0-9'&\-\s]{1,48})\s*\(\s*([^,)]+?)\s*(?:,\s*([^)]+))?\s*\)/g;

export function isVagueLocationPhrase(location: string | null | undefined): boolean {
  const normalized = String(location ?? '')
    .trim()
    .replace(/\s+/g, ' ');
  if (!normalized) return true;
  return VAGUE_LOCATION_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function isMultiStoreRequest(message: string): boolean {
  const text = String(message ?? '').trim();
  if (!text) return false;
  return MULTI_STORE_PATTERNS.some((pattern) => pattern.test(text));
}

export function extractStoreCount(message: string): number {
  const text = String(message ?? '').trim();
  const countMatch =
    text.match(/(\d+)\s*(?:stores|shops|branches|locations)/i) ??
    text.match(/\bset\s+up\s+(\d+)\b/i);
  if (countMatch?.[1]) {
    const count = Number.parseInt(countMatch[1], 10);
    if (Number.isFinite(count) && count > 0) return count;
  }

  const locations = extractLocations(text);
  if (locations.length >= 2) return locations.length;

  if (/\b(?:multiple|several)\s+stores\b/i.test(text)) return 3;
  if (/\bdifferent\s+cit(?:y|ies)\b/i.test(text)) return 3;
  if (/\bset\s+up\s+stores\b/i.test(text) && locations.length > 0) return locations.length;
  return 0;
}

export function extractQuotedNames(message: string): string[] {
  const names: string[] = [];
  const quotePattern = /['"]([^'"]{2,64})['"]/g;
  for (const match of message.matchAll(quotePattern)) {
    const name = match[1]?.trim();
    if (name) names.push(name);
  }
  return names;
}

export function extractStructuredStoreTuples(
  message: string,
): Array<{ name: string; location: string | null; category: string | null }> {
  const tuples: Array<{ name: string; location: string | null; category: string | null }> = [];
  for (const match of message.matchAll(STRUCTURED_STORE_TUPLE_RE)) {
    const name = match[1]?.trim();
    if (!name) continue;
    const locationRaw = match[2]?.trim() ?? null;
    const categoryRaw = match[3]?.trim() ?? null;
    const location =
      locationRaw && !isVagueLocationPhrase(locationRaw) ? locationRaw : null;
    const category = categoryRaw ? normalizeCategoryLabel(categoryRaw) : null;
    tuples.push({ name, location, category });
  }
  return tuples;
}

export function extractLocations(message: string): string[] {
  const text = String(message ?? '').trim();
  const locations = new Set<string>();

  for (const tuple of extractStructuredStoreTuples(text)) {
    if (tuple.location) locations.add(tuple.location);
  }

  const inMatch = text.match(/\bin\s+([^.!?\n]+)/i);
  if (inMatch?.[1]) {
    const segment = inMatch[1].trim();
    if (!isVagueLocationPhrase(segment)) {
      const parts = segment
        .split(/\s*,\s*|\s+and\s+/i)
        .map((part) => part.trim())
        .filter(Boolean);
      for (const part of parts) {
        if (isVagueLocationPhrase(part)) continue;
        if (/^[A-Z][A-Za-z\s'.-]{1,40}$/.test(part)) {
          locations.add(part);
        }
      }
    }
  }

  return [...locations];
}

export function extractCategories(message: string): string[] {
  const text = String(message ?? '').trim();
  const categories = new Set<string>();

  for (const tuple of extractStructuredStoreTuples(text)) {
    if (tuple.category) categories.add(tuple.category);
  }

  for (const label of STORE_CATEGORY_LABELS) {
    if (label === 'Other') continue;
    if (text.toLowerCase().includes(label.toLowerCase())) {
      categories.add(label);
    }
  }

  return [...categories];
}

export function extractStoreNames(message: string): string[] {
  const names = new Set<string>(extractQuotedNames(message));
  for (const tuple of extractStructuredStoreTuples(message)) {
    if (tuple.name) names.add(tuple.name);
  }
  return [...names];
}

function normalizeCategoryLabel(raw: string): string | null {
  const text = String(raw ?? '').trim();
  if (!text) return null;
  const lower = text.toLowerCase();
  const hit = STORE_CATEGORY_LABELS.find((label) => label.toLowerCase() === lower);
  if (hit) return hit;
  if (/home\s*&?\s*garden/i.test(text)) return 'Home & garden';
  if (/food|drink|cafe|restaurant|bakery/i.test(text)) return 'Food & drink';
  if (/electron/i.test(text)) return 'Electronics';
  if (/beauty|salon|spa/i.test(text)) return 'Beauty';
  if (/fashion|apparel|cloth/i.test(text)) return 'Fashion';
  if (/sport|fitness|gym/i.test(text)) return 'Sports';
  if (/health|medical|pharmacy/i.test(text)) return 'Health';
  if (/art|craft/i.test(text)) return 'Arts & crafts';
  return text;
}

export function extractMultiStoreInfo(message: string): MultiStoreExtractedInfo {
  const text = String(message ?? '').trim();
  const count = extractStoreCount(text) || 3;
  const structured = extractStructuredStoreTuples(text);
  const names = structured.length > 0 ? structured.map((row) => row.name) : extractStoreNames(text);
  const locations =
    structured.length > 0
      ? structured.map((row) => row.location).filter((value): value is string => Boolean(value))
      : extractLocations(text);
  const categories =
    structured.length > 0
      ? structured.map((row) => row.category).filter((value): value is string => Boolean(value))
      : extractCategories(text);

  const missingFields: MultiStoreMissingField[] = [];
  if (names.length < count) missingFields.push('store_names');
  if (categories.length < count) missingFields.push('categories');
  if (locations.length < count) missingFields.push('specific_locations');

  const vagueLocation =
    locations.length === 0 &&
    (/\bdifferent\s+cit(?:y|ies)\b/i.test(text) ||
      /\bmultiple\s+(?:cities|locations)\b/i.test(text) ||
      /\bseveral\s+(?:cities|locations)\b/i.test(text));

  return {
    count,
    locations,
    names,
    categories,
    missingFields,
    isMultiStore: isMultiStoreRequest(text),
    vagueLocation,
  };
}

export function generateMultiStoreClarificationResponse(info: MultiStoreExtractedInfo): string {
  const lines: string[] = ['I found:'];

  if (info.vagueLocation || info.locations.length === 0) {
    lines.push(`✓ Location: different cities (${info.count} stores)`);
  } else if (info.locations.length > 0) {
    lines.push(`✓ Locations: ${info.locations.join(', ')}`);
  }

  if (info.names.length > 0) {
    lines.push(`✓ Store names: ${info.names.join(', ')}`);
  }
  if (info.categories.length > 0) {
    lines.push(`✓ Categories: ${info.categories.join(', ')}`);
  }

  const needsDetail: string[] = [];
  if (info.missingFields.includes('store_names')) {
    needsDetail.push(`⏳ Store names: Please provide names for your ${info.count} stores`);
  }
  if (info.missingFields.includes('categories')) {
    needsDetail.push('⏳ Categories: Please specify categories for each store');
  }
  if (info.missingFields.includes('specific_locations')) {
    needsDetail.push('⏳ Locations: Please specify the city for each store');
  }

  if (needsDetail.length > 0) {
    lines.push('', 'I need a bit more detail:', ...needsDetail, '', 'Example format:');
    for (let index = 0; index < info.count; index += 1) {
      lines.push(`Store ${index + 1}: [Name] in [City] - [Category]`);
    }
    return lines.join('\n');
  }

  lines.push('', 'Everything looks complete for your multi-store setup.');
  return lines.join('\n');
}

export function generateClarificationPlan(
  extractedInfo: MultiStoreExtractedInfo,
  originalMessage: string,
): MissionPlan {
  const steps = [
    {
      id: randomUUID(),
      action: 'clarify_store_names',
      parameters: {
        count: extractedInfo.count,
        currentNames: extractedInfo.names,
        question: `Please provide names for your ${extractedInfo.count} stores.`,
      },
      validation: 'Must provide name for each store',
    },
    {
      id: randomUUID(),
      action: 'clarify_store_categories',
      parameters: {
        currentCategories: extractedInfo.categories,
        question: 'Please specify categories for each store.',
      },
      dependencies: ['clarify_store_names'],
      validation: 'Must provide category for each store',
    },
    {
      id: randomUUID(),
      action: 'clarify_specific_locations',
      parameters: {
        currentLocations: extractedInfo.locations,
        question: 'Please specify the city for each store.',
      },
      dependencies: ['clarify_store_categories'],
      validation: 'Must provide city for each store',
    },
    {
      id: randomUUID(),
      action: 'create_stores',
      parameters: {
        stores: '{{stores_data}}',
        originalMessage,
      },
      dependencies: ['clarify_specific_locations'],
      validation: 'All stores must be created successfully',
    },
  ];

  return {
    steps,
    requiredTools: [
      'clarify_store_names',
      'clarify_store_categories',
      'clarify_specific_locations',
      'create_stores',
    ],
    estimatedComplexity: 'medium',
    dependencies: {
      clarify_store_categories: ['clarify_store_names'],
      clarify_specific_locations: ['clarify_store_categories'],
      create_stores: ['clarify_specific_locations'],
    },
    isClarification: true,
    missingFields: extractedInfo.missingFields,
    clarificationMessage: generateMultiStoreClarificationResponse(extractedInfo),
    multiStore: extractedInfo,
  };
}

export function enrichIntentWithMultiStore(
  message: string,
  intentResult: IntentResult,
): IntentResult {
  if (!isMultiStoreRequest(message)) return intentResult;

  const extracted = extractMultiStoreInfo(message);
  const needsClarification = extracted.missingFields.length > 0;
  const intent =
    intentResult.intent === Intent.STORE_SETUP || intentResult.intent === Intent.GENERAL_QUERY
      ? Intent.MISSION_PLANNING
      : intentResult.intent;

  return {
    ...intentResult,
    intent,
    entities: {
      ...(intentResult.entities ?? {}),
      store_count: extracted.count,
      storeCount: extracted.count,
      locations: extracted.locations,
      names: extracted.names,
      categories: extracted.categories,
      needs_clarification: needsClarification,
    },
    needsClarification,
    missingFields: extracted.missingFields,
    multiStore: extracted,
  };
}

export function plannerPromptExtension(message: string): string {
  if (!isMultiStoreRequest(message)) return '';

  return `

MULTI-STORE SETUP RULES (mandatory):
- Detect how many stores the user wants.
- Verify store names, categories, and specific cities are all provided.
- If any are missing, output clarification steps BEFORE any create_stores step.
- Never treat vague locations like "different cities" as a concrete city.
- Set isClarification true when fields are missing and list missingFields.`;
}
