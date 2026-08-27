/**
 * Hard limits + protected batches for multi-source candidate enrichment.
 */

/** Batch IDs the agent must never enrich (guard in agent loop, not only routes). */
export const PROTECTED_BATCH_IDS = ['MELBOURNE_BATCH0_20260617'] as const;

export const MAX_WEB_FETCHES_PER_RECORD = 5;
export const MAX_CLAUDE_CALLS_PER_RECORD = 3;
export const MAX_WALL_CLOCK_MS_PER_RECORD = 10 * 60 * 1000;

/**
 * When PEXELS_API_KEY is set and hero is missing, hold this many fetch slots
 * for the Pexels query ladder so blocked OSM/YP/TL cannot exhaust the budget first.
 */
export const RESERVED_HERO_FETCHES = 2;

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
