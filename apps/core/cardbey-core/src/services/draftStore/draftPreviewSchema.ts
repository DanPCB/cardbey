/**
 * Shared draft preview schema for validate-on-write (soft) and validate-on-publish (hard).
 */

import { z } from 'zod';

const categorySchema = z.object({
  id: z.string(),
  name: z.string(),
});

const previewItemSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  price: z.union([z.string(), z.number()]).optional().nullable(),
  description: z.string().optional().nullable(),
  categoryId: z.string().optional().nullable(),
  imageUrl: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  image: z.string().optional().nullable(),
  priceV1: z.any().optional(),
  currency: z.string().optional(),
}).passthrough();

export const draftPreviewSchema = z.object({
  storeName: z.string(),
  storeType: z.string().optional(),
  slogan: z.string().optional().nullable(),
  tagline: z.string().optional().nullable(),
  heroText: z.string().optional().nullable(),
  stylePreferences: z.record(z.unknown()).optional().nullable(),
  categories: z.array(categorySchema).default([]),
  items: z.array(previewItemSchema).default([]),
  images: z.array(z.unknown()).optional(),
  brandColors: z.object({
    primary: z.string().optional().nullable(),
    secondary: z.string().optional().nullable(),
  }).optional(),
  hero: z.object({
    imageUrl: z.string().optional().nullable(),
    url: z.string().optional().nullable(),
  }).optional(),
  avatar: z.object({
    imageUrl: z.string().optional().nullable(),
    url: z.string().optional().nullable(),
  }).optional(),
  meta: z.object({
    storeName: z.string().optional(),
    storeType: z.string().optional(),
    profileHeroUrl: z.string().optional().nullable(),
    profileAvatarUrl: z.string().optional().nullable(),
    logo: z.unknown().optional(),
    heroImage: z.string().optional().nullable(),
  }).optional(),
  description: z.string().optional().nullable(),
}).passthrough();

export type DraftPreview = z.infer<typeof draftPreviewSchema>;

/**
 * Safe parser: returns null if value is invalid (no throw).
 */
export function parseDraftPreview(value: unknown): DraftPreview | null {
  const result = draftPreviewSchema.safeParse(value);
  return result.success ? result.data : null;
}
