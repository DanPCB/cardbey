/**
 * Menu Engine Types
 * Zod schemas for input/output validation
 */

import { z } from 'zod';

/**
 * Extract Menu Input
 */
export const ExtractInput = z.object({
  tenantId: z.string(),
  storeId: z.string(),
  imageUrl: z.string(),
  ocrText: z.string().optional(), // Optional OCR text from image processing
  detectedItems: z.array(z.string()).optional(), // Optional detected item names from UI
  locale: z.string().optional(), // Optional locale hint (e.g. "en", "vi")
});

export type ExtractInput = z.infer<typeof ExtractInput>;

/**
 * Extract Menu Output
 */
export const ExtractOutput = z.object({
  ok: z.boolean(),
  data: z.object({
    rawLines: z.array(z.string()),
    structuredItems: z.array(
      z.object({
        name: z.string(),
        category: z.string().nullable(),
        price: z.number().nullable(),
        currency: z.string().nullable(),
        description: z.string().nullable(),
      })
    ),
  }),
});

export type ExtractOutput = z.infer<typeof ExtractOutput>;

/**
 * Configure Menu Input
 */
export const ConfigureMenuInput = z.object({
  tenantId: z.string(),
  storeId: z.string(),
  items: z.array(
    z.object({
      name: z.string(),
      price: z.number(),
      currency: z.string(),
      category: z.string(),
      description: z.string().nullable(),
    })
  ),
  categories: z.array(z.string()),
});

export type ConfigureMenuInput = z.infer<typeof ConfigureMenuInput>;

/**
 * Configure Menu Output
 */
export const ConfigureMenuOutput = z.object({
  ok: z.boolean(),
  data: z.object({
    itemCount: z.number(),
    categoryCount: z.number(),
  }),
});

export type ConfigureMenuOutput = z.infer<typeof ConfigureMenuOutput>;

/**
 * Generate Menu Assets Input
 */
export const GenerateMenuAssetsInput = z.object({
  tenantId: z.string(),
  storeId: z.string(),
  theme: z.string().nullable(),
  types: z.array(z.enum(['poster', 'menu_board', 'item_card'])),
});

export type GenerateMenuAssetsInput = z.infer<typeof GenerateMenuAssetsInput>;

/**
 * Generate Menu Assets Output
 */
export const GenerateMenuAssetsOutput = z.object({
  ok: z.boolean(),
  data: z.object({
    posterUrls: z.array(z.string()),
    boardUrls: z.array(z.string()),
    cardUrls: z.array(z.string()),
  }),
});

export type GenerateMenuAssetsOutput = z.infer<typeof GenerateMenuAssetsOutput>;

/**
 * Publish Menu Input
 */
export const PublishMenuInput = z.object({
  tenantId: z.string(),
  storeId: z.string(),
});

export type PublishMenuInput = z.infer<typeof PublishMenuInput>;

/**
 * Publish Menu Output
 */
export const PublishMenuOutput = z.object({
  ok: z.boolean(),
  data: z.object({
    storefrontUpdated: z.boolean(),
    screensUpdated: z.boolean(),
  }),
});

export type PublishMenuOutput = z.infer<typeof PublishMenuOutput>;

/**
 * Query Menu State Input
 */
export const QueryMenuStateInput = z.object({
  tenantId: z.string(),
  storeId: z.string(),
});

export type QueryMenuStateInput = z.infer<typeof QueryMenuStateInput>;

/**
 * Query Menu State Output
 */
export const QueryMenuStateOutput = z.object({
  ok: z.boolean(),
  data: z.object({
    items: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        price: z.number().nullable(),
        currency: z.string().nullable(),
        category: z.string().nullable(),
        description: z.string().nullable(),
      })
    ),
    categories: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
      })
    ),
  }),
});

export type QueryMenuStateOutput = z.infer<typeof QueryMenuStateOutput>;


