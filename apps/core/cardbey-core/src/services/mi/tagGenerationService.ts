/**
 * MI Tag Generation Service
 * Generates 3–6 tags per draft item via OpenAI chat or heuristic fallback.
 */

import OpenAI from 'openai';

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 30000,
      maxRetries: 2,
    })
  : null;

const HAS_OPENAI = Boolean(openai);

const STOPWORDS = new Set(
  'a an the and or but in on at to for of with by from as is was are were been be have has had do does did will would could should may might must can'.split(/\s+/)
);

export interface TagGenerationItem {
  id?: string;
  name?: string;
  description?: string;
  tags?: string[];
  categoryId?: string;
  category?: string;
}

export interface GenerateTagsForItemsArgs {
  items: TagGenerationItem[];
  storeName?: string | null;
  businessType?: string | null;
  verticalSlug?: string | null;
  audience?: string | null;
}

export interface GenerateTagsForItemsResult {
  updatedItems: TagGenerationItem[];
  counts: { processed: number; updated: number; skipped: number };
}

function normalizeTags(raw: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of raw) {
    const s = String(t).toLowerCase().trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
    if (out.length >= 6) break;
  }
  return out;
}

function heuristicTagsForItem(item: TagGenerationItem): string[] {
  const parts: string[] = [];
  const name = (item.name || '').trim();
  const desc = (item.description || '').trim();
  const text = [name, desc].filter(Boolean).join(' ').toLowerCase();
  if (!text) return [];
  const words = text.split(/[\s,;:.!?()-]+/).filter((w) => w.length >= 2 && !STOPWORDS.has(w));
  const deduped = [...new Set(words)];
  for (const w of deduped) {
    if (parts.length >= 6) break;
    const cleaned = w.replace(/[^a-z0-9]/g, '');
    if (cleaned.length >= 2) parts.push(cleaned);
  }
  return normalizeTags(parts);
}

async function generateTagsWithOpenAI(
  batch: TagGenerationItem[],
  storeName?: string | null,
  businessType?: string | null,
  verticalSlug?: string | null,
  audience?: string | null
): Promise<Map<string, string[]>> {
  if (!openai || batch.length === 0) return new Map();
  const context = [storeName, businessType].filter(Boolean).join(', ') || 'store';
  const vertical = (verticalSlug || '').toString().trim() || 'general';
  const aud = (audience || '').toString().toLowerCase().trim() || 'adults';
  const itemList = batch
    .map((it) => {
      const id = it.id || '';
      const name = (it.name || '').trim();
      const desc = (it.description || '').trim().slice(0, 100);
      return { id, name, description: desc };
    })
    .filter((it) => it.id && it.name.length >= 2);
  if (itemList.length === 0) return new Map();

  const userPrompt = `Store context: ${context}
Vertical: ${vertical} (primary). Audience: ${aud}.

For each item below, suggest 3–6 short tags (single words or two words) for search and filtering. Tags should be lowercase, no spaces inside a tag.

HARD RULE: Tags MUST match this vertical only. Do NOT use tags from other verticals (e.g. no florist/wedding/gift tags for fashion or seafood; no coffee/pastry tags for non-food; no fashion/beauty tags for seafood). Keep tags relevant to verticalSlug "${vertical}" and audience "${aud}".

Items (id, name, description):
${itemList.map((it) => `- id: "${it.id}" name: "${it.name}" description: "${it.description || ''}"`).join('\n')}

Return ONLY a valid JSON object mapping each item id to an array of tag strings. No markdown, no code fences.
Example (for food.seafood): {"item_abc_0":["seafood","fish","grilled"],"item_abc_1":["oysters","fresh"]}
Example (for fashion.kids): {"item_abc_0":["kids","tee","cotton"],"item_abc_1":["toddler","hoodie"]}`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'You output only valid JSON. No explanations. Keys are item ids; values are arrays of 3–6 tag strings (lowercase).',
        },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 1500,
    });
    const raw = completion.choices[0]?.message?.content?.trim() || '';
    if (!raw) return new Map();
    let parsed: Record<string, string[]>;
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0]) as Record<string, string[]>;
    } else {
      parsed = JSON.parse(raw) as Record<string, string[]>;
    }
    const result = new Map<string, string[]>();
    for (const [id, arr] of Object.entries(parsed)) {
      if (id && Array.isArray(arr)) result.set(id, normalizeTags(arr));
    }
    return result;
  } catch (_) {
    return new Map();
  }
}

export async function generateTagsForItems(
  args: GenerateTagsForItemsArgs
): Promise<GenerateTagsForItemsResult> {
  try {
    const { items, storeName, businessType } = args;
    const list = Array.isArray(items) ? items : [];
    const hasValidName = (it: TagGenerationItem) =>
      it && typeof (it as any).name === 'string' && String((it as any).name).trim().length >= 2;
    const needsTags = (it: TagGenerationItem) => {
      const t = (it as any).tags;
      if (!Array.isArray(t)) return true;
      if (t.length === 0) return true;
      if (t.every((tag) => String(tag).trim() === '')) return true;
      return false;
    };
    const toProcess = list.filter((it) => hasValidName(it) && needsTags(it));
    const updatedItems = list.map((it) => ({ ...it }));
    const idToTags = new Map<string, string[]>();
    const BATCH = 10;

    const verticalSlug = (args as any).verticalSlug ?? null;
    const audience = (args as any).audience ?? null;

    for (let offset = 0; offset < toProcess.length; offset += BATCH) {
      const batch = toProcess.slice(offset, offset + BATCH);
      const batchResult = HAS_OPENAI
        ? await generateTagsWithOpenAI(batch, storeName, businessType, verticalSlug, audience)
        : new Map<string, string[]>();
      batchResult.forEach((tags, id) => idToTags.set(id, tags));
    }

    let updated = 0;
    for (let i = 0; i < updatedItems.length; i++) {
      const item = updatedItems[i];
      if (!hasValidName(item) || !needsTags(item)) continue;
      const id = (item as any).id || '';
      const tags = idToTags.get(id)?.length
        ? idToTags.get(id)!
        : heuristicTagsForItem(list[i]);
      if (tags.length > 0) {
        (item as any).tags = tags;
        updated++;
      }
    }

    return {
      updatedItems,
      counts: {
        processed: toProcess.length,
        updated,
        skipped: toProcess.length - updated,
      },
    };
  } catch (_) {
    const list = Array.isArray(args.items) ? args.items : [];
    return {
      updatedItems: list.map((it) => ({ ...it })),
      counts: { processed: 0, updated: 0, skipped: 0 },
    };
  }
}
