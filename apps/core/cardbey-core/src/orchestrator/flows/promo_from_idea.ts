/**
 * Promo From Idea Flow
 * Orchestrator agent flow for creating promos from natural language ideas
 * 
 * Flow: User provides idea text → agent creates a working promo automatically
 */

import { callTool } from '../runtime/toolExecutor.js';
import { logger } from '../services/logger.js';
import { getEventEmitter } from '../../engines/promo/events.js';

/**
 * Flow input interface
 */
export interface PromoFromIdeaInput {
  tenantId: string;
  storeId: string;
  ideaText: string; // e.g., "Give 20% off all coffees this weekend"
  targetItemId?: string;
  targetCategoryId?: string;
}

/**
 * Flow result interface
 */
export interface PromoFromIdeaResult {
  ok: boolean;
  flow?: string;
  promoId?: string;
  config?: {
    name: string;
    type: string;
    value: number;
    targetType: string;
    targetId?: string | null;
    startAt?: string | null;
    endAt?: string | null;
  };
  assets?: {
    qrUrl?: string;
    banners?: string[];
  };
  error?: {
    message: string;
  };
}

/**
 * Tool context interface
 */
interface FlowContext {
  services?: {
    events?: ReturnType<typeof getEventEmitter>;
    [key: string]: unknown;
  };
  llm?: {
    generate: (prompt: string, options?: { schema?: unknown }) => Promise<unknown>;
    parse?: (text: string, prompt: string) => Promise<unknown>;
  };
  [key: string]: unknown;
}

/**
 * Parse idea text into promo configuration
 * Uses LLM if available, otherwise falls back to pattern matching
 */
async function parseIdeaText(
  ideaText: string,
  targetItemId?: string,
  targetCategoryId?: string,
  ctx?: FlowContext
): Promise<{
  name: string;
  type: 'percentage' | 'fixed' | 'bogo' | 'free_item';
  value: number;
  targetType: 'item' | 'category' | 'cart';
  targetId: string | null;
  startAt: string | null;
  endAt: string | null;
}> {
  // Try LLM parsing if available
  if (ctx?.llm?.generate || ctx?.llm?.parse) {
    try {
      const prompt = `Parse the following promotional idea into structured configuration:

Idea: "${ideaText}"
${targetItemId ? `\nTarget Item ID: ${targetItemId}` : ''}
${targetCategoryId ? `\nTarget Category ID: ${targetCategoryId}` : ''}

Extract:
- name: A short, descriptive name for the promotion (max 50 chars)
- type: One of: "percentage", "fixed", "bogo", "free_item"
- value: Numeric value (percentage as number 0-100, fixed amount, or count for bogo)
- targetType: One of: "item", "category", "cart"
- targetId: ID string if targetType is "item" or "category", otherwise null
- startAt: ISO 8601 date string for start time (null if not specified)
- endAt: ISO 8601 date string for end time (null if not specified)

Parse relative dates:
- "this weekend" = Saturday 00:00 to Sunday 23:59
- "today" = today 00:00 to today 23:59
- "this week" = today to 7 days from today
- "next week" = next Monday to next Sunday

Return valid JSON with these exact fields.`;

      let parsed: unknown;
      
      if (ctx.llm.generate) {
        // Try structured generation with schema
        parsed = await ctx.llm.generate(prompt, {
          schema: {
            type: 'object',
            properties: {
              name: { type: 'string', maxLength: 50 },
              type: { type: 'string', enum: ['percentage', 'fixed', 'bogo', 'free_item'] },
              value: { type: 'number' },
              targetType: { type: 'string', enum: ['item', 'category', 'cart'] },
              targetId: { type: ['string', 'null'] },
              startAt: { type: ['string', 'null'] },
              endAt: { type: ['string', 'null'] },
            },
            required: ['name', 'type', 'value', 'targetType'],
          },
        });
      } else if (ctx.llm.parse) {
        parsed = await ctx.llm.parse(ideaText, prompt);
      }

      if (parsed && typeof parsed === 'object') {
        const parsedObj = parsed as Record<string, unknown>;
        
        // Validate and normalize the parsed result
        const result = {
          name: String(parsedObj.name || ideaText.substring(0, 50)),
          type: (parsedObj.type || 'percentage') as 'percentage' | 'fixed' | 'bogo' | 'free_item',
          value: Number(parsedObj.value || 10),
          targetType: (parsedObj.targetType || 'cart') as 'item' | 'category' | 'cart',
          targetId: targetItemId || targetCategoryId || (parsedObj.targetId ? String(parsedObj.targetId) : null),
          startAt: parsedObj.startAt ? String(parsedObj.startAt) : null,
          endAt: parsedObj.endAt ? String(parsedObj.endAt) : null,
        };

        // Override targetId if explicitly provided
        if (targetItemId && result.targetType === 'item') {
          result.targetId = targetItemId;
        } else if (targetCategoryId && result.targetType === 'category') {
          result.targetId = targetCategoryId;
        }

        logger.info('[promo_from_idea] LLM parsed idea', result);
        return result;
      }
    } catch (err) {
      logger.warn('[promo_from_idea] LLM parsing failed, falling back to pattern matching', {
        error: err instanceof Error ? err.message : String(err),
      });
      // Fall through to pattern matching
    }
  }

  // Fallback: Pattern matching
  const text = ideaText.toLowerCase();
  
  // Extract percentage discount
  const percentageMatch = text.match(/(\d+)%/);
  const percentage = percentageMatch ? parseFloat(percentageMatch[1]) : null;
  
  // Extract fixed amount
  const fixedMatch = text.match(/\$(\d+(?:\.\d+)?)/);
  const fixed = fixedMatch ? parseFloat(fixedMatch[1]) : null;
  
  // Determine type
  let type: 'percentage' | 'fixed' | 'bogo' | 'free_item' = 'percentage';
  let value = 10; // default
  
  if (percentage !== null) {
    type = 'percentage';
    value = percentage;
  } else if (fixed !== null) {
    type = 'fixed';
    value = fixed;
  } else if (text.includes('free') || text.includes('bogo')) {
    type = 'bogo';
    value = 1;
  }
  
  // Determine target
  let targetType: 'item' | 'category' | 'cart' = 'cart';
  let targetId: string | null = null;
  
  if (targetItemId) {
    targetType = 'item';
    targetId = targetItemId;
  } else if (targetCategoryId) {
    targetType = 'category';
    targetId = targetCategoryId;
  } else if (text.includes('all') || text.includes('entire')) {
    targetType = 'cart';
  } else if (text.includes('coffee') || text.includes('drink')) {
    targetType = 'category';
    // Would need to look up category ID
  }
  
  // Extract duration
  const now = new Date();
  const startAt = new Date(now);
  const endAt = new Date(now);
  
  if (text.includes('weekend')) {
    // Set to this weekend (Saturday 00:00 to Sunday 23:59)
    const day = startAt.getDay();
    const diff = day === 0 ? -1 : 6 - day; // If Sunday, go back 1 day, otherwise go to Saturday
    startAt.setDate(startAt.getDate() + diff);
    startAt.setHours(0, 0, 0, 0);
    endAt.setDate(startAt.getDate() + 1); // Sunday
    endAt.setHours(23, 59, 59, 999);
  } else if (text.includes('today')) {
    startAt.setHours(0, 0, 0, 0);
    endAt.setHours(23, 59, 59, 999);
  } else if (text.includes('week')) {
    endAt.setDate(endAt.getDate() + 7);
    endAt.setHours(23, 59, 59, 999);
  } else {
    // Default: no specific dates
    startAt.setHours(0, 0, 0, 0);
    endAt.setDate(endAt.getDate() + 30); // Default 30 days if not specified
    endAt.setHours(23, 59, 59, 999);
  }
  
  // Generate name
  const name = ideaText.substring(0, 50) || `Promo ${type} ${value}`;
  
  return {
    name,
    type,
    value,
    targetType,
    targetId,
    startAt: startAt.toISOString(),
    endAt: endAt.toISOString(),
  };
}

/**
 * Promo From Idea Flow
 * 
 * Steps:
 * 1. Parse idea text into structured config
 * 2. Configure promo
 * 3. Generate assets
 * 4. Return UI payload
 * 
 * @param input - Flow input parameters
 * @param ctx - Execution context
 * @returns Flow result
 */
export async function promo_from_idea(
  input: PromoFromIdeaInput,
  ctx?: FlowContext
): Promise<PromoFromIdeaResult> {
  try {
    // STEP 1: Parse idea text using LLM (if available)
    logger.info('[promo_from_idea] Step 1: Parsing idea text', {
      ideaText: input.ideaText,
      hasLLM: !!ctx?.llm,
    });
    
    const parsed = await parseIdeaText(
      input.ideaText,
      input.targetItemId,
      input.targetCategoryId,
      ctx
    );
    
    logger.info('[promo_from_idea] Idea parsed', parsed);
    
    // STEP 2: Configure promo
    logger.info('[promo_from_idea] Step 2: Configuring promo', {
      tenantId: input.tenantId,
      storeId: input.storeId,
    });
    
    const promoRes = await callTool(
      'promo.configure',
      {
        tenantId: input.tenantId,
        storeId: input.storeId,
        promoId: null,
        ...parsed,
      },
      ctx
    );
    
    if (!promoRes.ok || !promoRes.data) {
      throw new Error(
        promoRes.error || 'Failed to configure promo'
      );
    }
    
    const promoId = (promoRes.data as { promoId: string }).promoId;
    
    logger.info('[promo_from_idea] Promo configured', { promoId });
    
    // STEP 3: Generate assets
    logger.info('[promo_from_idea] Step 3: Generating assets', {
      promoId,
    });
    
    const assetsRes = await callTool(
      'promo.generate-assets',
      {
        tenantId: input.tenantId,
        storeId: input.storeId,
        promoId,
        types: ['qr', 'banner'],
      },
      ctx
    );
    
    if (!assetsRes.ok || !assetsRes.data) {
      throw new Error(assetsRes.error || 'Failed to generate assets');
    }
    
    const assetsData = assetsRes.data as {
      qrUrl?: string;
      bannerUrls?: string[];
    };
    
    logger.info('[promo_from_idea] Assets generated', assetsData);
    
    // STEP 4: Build flow result for UI surfaces
    const result: PromoFromIdeaResult = {
      ok: true,
      flow: 'promo_from_idea',
      promoId,
      config: {
        name: parsed.name,
        type: parsed.type,
        value: parsed.value,
        targetType: parsed.targetType,
        targetId: parsed.targetId,
        startAt: parsed.startAt,
        endAt: parsed.endAt,
      },
      assets: {
        qrUrl: assetsData.qrUrl,
        banners: assetsData.bannerUrls || [],
      },
    };
    
    logger.info('[promo_from_idea] Flow completed successfully', {
      promoId,
    });
    
    return result;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const errorStack = err instanceof Error ? err.stack : undefined;
    
    logger.error('[promo_from_idea] Flow error', {
      error: errorMessage,
      stack: errorStack,
      input: {
        tenantId: input.tenantId,
        storeId: input.storeId,
        ideaText: input.ideaText,
      },
    });
    
    return {
      ok: false,
      error: {
        message: errorMessage || 'Promo flow failed',
      },
    };
  }
}



