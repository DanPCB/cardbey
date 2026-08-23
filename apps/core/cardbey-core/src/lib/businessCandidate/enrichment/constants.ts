/**
 * Hard limits + protected batches for multi-source candidate enrichment.
 */

/** Batch IDs the agent must never enrich (guard in agent loop, not only routes). */
export const PROTECTED_BATCH_IDS = ['MELBOURNE_BATCH0_20260617'] as const;

/** ABR + OSM + YP + True Local + ≥2 Pexels category queries for no-website venues. */
export const MAX_WEB_FETCHES_PER_RECORD = 8;
export const MAX_CLAUDE_CALLS_PER_RECORD = 3;
export const MAX_WALL_CLOCK_MS_PER_RECORD = 10 * 60 * 1000;

export const CARDBEY_CATEGORIES = [
  'Food & Drink',
  'Grocery & Essentials',
  'Beauty & Wellness',
  'Fashion',
  'Home & Garden',
  'Health & Fitness',
  'Pet Services',
  'Professional',
  'Auto & Transport',
  'Education',
  'Community & Events',
  'Other',
] as const;

export type CardbeyCategory = (typeof CARDBEY_CATEGORIES)[number];
