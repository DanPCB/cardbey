/**
 * contentCreatorValidator.js
 * Runtime Zod validation for ContentPlan, SocialPostSet, and EmailAndPromoCopy.
 * SocialPostSchema matches the ContentPlan.social.posts[] shape (platform, copy, hashtags, visualNote).
 */

import { z } from 'zod';

export const SocialPostSchema = z.object({
  platform: z.enum(['instagram', 'facebook', 'tiktok']),
  copy: z.string().min(1),
  hashtags: z.array(z.string()),
  visualNote: z.string().optional(),
});

export const SocialPostSetSchema = z.object({
  posts: z.array(SocialPostSchema).min(1),
});

export const EmailCopySchema = z.object({
  subjectLine: z.string().min(1),
  previewText: z.string().min(1),
  bodyHtml: z.string().min(1),
  ctaText: z.string().min(1),
  ctaUrl: z.string().optional(),
});

export const PromoCopySchema = z.object({
  headline: z.string().min(1),
  subheadline: z.string().min(1),
  terms: z.string().min(1),
  badgeText: z.string().min(1),
});

export const EmailAndPromoCopySchema = z.object({
  email: EmailCopySchema,
  promo: PromoCopySchema,
});

export const ContentPlanSchema = z.object({
  generatedAt: z.string(),
  storeName: z.string().min(1),
  campaignTitle: z.string().min(1),
  social: SocialPostSetSchema,
  emailAndPromo: EmailAndPromoCopySchema,
  summary: z.string().min(1),
});

export function validateContentPlan(raw) {
  const result = ContentPlanSchema.safeParse(raw);
  if (result.success) return { success: true, data: result.data };
  return {
    success: false,
    errors: result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`),
    raw,
  };
}

export function assertContentPlan(raw) {
  const result = validateContentPlan(raw);
  if (!result.success) throw new Error(`ContentPlan validation failed:\n${result.errors.join('\n')}`);
  return result.data;
}

export function assertSocialPostSet(raw) {
  const result = SocialPostSetSchema.safeParse(raw);
  if (!result.success) throw new Error(`SocialPostSet validation failed:\n${result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('\n')}`);
  return result.data;
}

export function assertEmailAndPromoCopy(raw) {
  const result = EmailAndPromoCopySchema.safeParse(raw);
  if (!result.success) throw new Error(`EmailAndPromoCopy validation failed:\n${result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('\n')}`);
  return result.data;
}
