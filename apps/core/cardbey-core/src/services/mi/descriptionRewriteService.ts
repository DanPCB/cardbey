/**
 * MI Description Rewrite Service
 * Rewrites draft item descriptions via OpenAI chat or template fallback.
 * Supports tone, length, style, and overwrite via ctx.
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

const MIN_DESC_LENGTH = 20;
const PLACEHOLDER_REGEX = /^(item|product|untitled|description|a quality item\.?|a customer favourite\.?|\s*)$/i;

export interface DescriptionRewriteItem {
  id?: string;
  name?: string;
  description?: string;
}

export type RewriteLength = 'short' | 'medium' | 'long';

export interface RewriteDescriptionsContext {
  storeName?: string | null;
  businessType?: string | null;
  tone?: string | null;
  length?: RewriteLength;
  style?: string | null;
  overwrite?: boolean;
}

export interface RewriteDescriptionsForItemsArgs extends RewriteDescriptionsContext {
  items: DescriptionRewriteItem[];
}

export interface RewriteDescriptionsForItemsResult {
  updatedItems: DescriptionRewriteItem[];
  counts: { processed: number; updated: number; skipped: number };
}

function needsRewrite(item: DescriptionRewriteItem, overwrite: boolean): boolean {
  if (overwrite) return true;
  const desc = (item.description || '').trim();
  if (desc.length < MIN_DESC_LENGTH) return true;
  if (PLACEHOLDER_REGEX.test(desc)) return true;
  return false;
}

const TONE_PHRASES: Record<string, string> = {
  friendly: 'Friendly',
  warm: 'Warm',
  casual: 'Casual',
  professional: 'Professional',
  premium: 'Premium',
  luxury: 'Luxury',
  formal: 'Formal',
  playful: 'Playful',
};

function toneAdjective(tone?: string | null): string {
  if (!tone || !tone.trim()) return '';
  const key = tone.toLowerCase().trim();
  return TONE_PHRASES[key] || tone.trim();
}

function templateDescription(item: DescriptionRewriteItem, ctx: RewriteDescriptionsContext): string {
  const name = (item.name || '').trim();
  if (!name) return 'A quality item.';
  const toneWord = toneAdjective(ctx.tone) || 'Great';
  const length = ctx.length || 'medium';
  if (length === 'short') {
    return `${toneWord} ${name} — perfect for any occasion.`;
  }
  if (length === 'long') {
    return `${name} — ${toneWord.toLowerCase()} choice for gifting or everyday enjoyment. Crafted thoughtfully for quality and appeal.`;
  }
  return `${name} — ${toneWord.toLowerCase()} choice for any occasion. Great for gifting or everyday enjoyment.`;
}

function lengthRules(length: RewriteLength): string {
  switch (length) {
    case 'short':
      return '8–14 words, exactly 1 sentence.';
    case 'long':
      return '35–55 words total, 2–3 sentences.';
    default:
      return '18–30 words total, 1–2 sentences.';
  }
}

async function rewriteBatchWithOpenAI(
  batch: DescriptionRewriteItem[],
  ctx: RewriteDescriptionsContext
): Promise<Map<string, string>> {
  if (!openai || batch.length === 0) return new Map();
  const { storeName, businessType, tone, length = 'medium' } = ctx;
  const context = [storeName, businessType].filter(Boolean).join(', ') || 'store';
  const itemList = batch
    .map((it) => ({
      id: it.id || '',
      name: (it.name || '').trim(),
      description: (it.description || '').trim().slice(0, 200),
    }))
    .filter((it) => it.id && it.name.length >= 1);
  if (itemList.length === 0) return new Map();

  const toneHint = tone
    ? `Use a ${tone} tone.`
    : 'Use a friendly, professional tone.';
  const lengthRule = lengthRules(length);
  const userPrompt = `Write a product description for a store item.
Tone: ${toneHint}
Length: ${lengthRule}
Output: plain text only — no quotes, bullets, or code. Mention the product name naturally once. Do not hallucinate ingredients or specs; keep generic if unknown.
Store context: storeName=${storeName ?? 'none'}, businessType=${businessType ?? 'none'}.

Items (id, name, existing description):
${itemList.map((it) => `- id: "${it.id}" name: "${it.name}" existing: "${it.description || 'none'}"`).join('\n')}

Return ONLY a valid JSON array of objects with exactly: "id" (string) and "description" (string). No markdown, no code fences.
Example: [{"id":"item_abc_0","description":"Rich espresso blend. Smooth and bold."},{"id":"item_abc_1","description":"Freshly baked pastry. Buttery and flaky."}]`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You output only valid JSON. No explanations. Array of objects with "id" and "description" strings. Descriptions must be plain text only.',
        },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.4,
      max_tokens: 2000,
    });
    const raw = completion.choices[0]?.message?.content?.trim() || '';
    if (!raw) return new Map();
    let arr: Array<{ id: string; description: string }>;
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      arr = JSON.parse(jsonMatch[0]) as Array<{ id: string; description: string }>;
    } else {
      arr = JSON.parse(raw) as Array<{ id: string; description: string }>;
    }
    const result = new Map<string, string>();
    for (const o of arr) {
      if (o && typeof o.id === 'string' && typeof o.description === 'string' && o.description.trim()) {
        result.set(o.id, o.description.trim());
      }
    }
    return result;
  } catch (_) {
    return new Map();
  }
}

export async function rewriteDescriptionsForItems(
  args: RewriteDescriptionsForItemsArgs
): Promise<RewriteDescriptionsForItemsResult> {
  try {
    const {
      items,
      storeName = null,
      businessType = null,
      tone = null,
      length = 'medium',
      style = null,
      overwrite = false,
    } = args;
    const list = Array.isArray(items) ? items : [];
    const ctx: RewriteDescriptionsContext = { storeName, businessType, tone, length, style, overwrite };
    const hasValidName = (it: DescriptionRewriteItem) =>
      it && typeof (it as any).name === 'string' && String((it as any).name).trim().length >= 1;
    const toProcess = list.filter((it) => hasValidName(it) && needsRewrite(it, overwrite));
    const updatedItems = list.map((it) => ({ ...it }));
    const idToDesc = new Map<string, string>();
    const BATCH = 5;

    for (let offset = 0; offset < toProcess.length; offset += BATCH) {
      const batch = toProcess.slice(offset, offset + BATCH);
      const batchResult = HAS_OPENAI
        ? await rewriteBatchWithOpenAI(batch, ctx)
        : new Map<string, string>();
      batchResult.forEach((desc, id) => idToDesc.set(id, desc));
    }

    let updated = 0;
    for (let i = 0; i < updatedItems.length; i++) {
      const item = updatedItems[i];
      if (!hasValidName(item) || !needsRewrite(item, overwrite)) continue;
      const id = (item as any).id || '';
      const desc = idToDesc.get(id) || templateDescription(list[i], ctx);
      if (desc && desc.trim()) {
        (item as any).description = desc.trim();
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
