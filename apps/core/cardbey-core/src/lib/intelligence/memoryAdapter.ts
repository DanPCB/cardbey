// apps/core/cardbey-core/src/lib/intelligence/memoryAdapter.ts

/**
 * Server-side memory adapter for Cardbey Intelligence Foundation
 * Layer 1 - Single source of truth for all memory fetches
 */

import type {
  UnifiedMemoryBundle,
  BusinessMemorySummary,
  SuitcaseHighlight,
  UserMemory,
  SessionSignals,
  ActorType,
} from './types';

// Assume these existing services are imported
// Adjust paths based on actual repo structure
import { getBusinessMemorySummary } from '../pil/business/businessMemoryService';
import { listSuitcaseItems } from '../suitcase/suitcaseItemService';
import { getUserMemory } from '../user/userMemoryService';
import { readPilEventBuffer } from '../pil/events/eventBuffer';

// Constants (matching existing pilContextBuilder.ts)
export const SUITCASE_FETCH_LIMIT = 8;
export const MAX_SUITCASE_HIGHLIGHTS = 5;

export interface MemoryAdapterInput {
  actor: {
    type: ActorType;
    userId: string | null;
  };
  storeId: string | null;
  sessionId: string | null;
}

/**
 * Extract session signals from PIL event buffer
 * Thin helper - does NOT create new storage
 */
export function extractSessionSignals(events: any[]): SessionSignals {
  const recent = events.slice(-40);
  const learnedSignals = recent
    .map((e) => e.type)
    .filter((t, i, arr) => arr.lastIndexOf(t) === i) // unique, preserve order
    .slice(-5);
  
  return {
    learnedSignals,
    recentTypes: recent.map((e) => e.type).slice(-10),
    sessionId: recent[recent.length - 1]?.sessionId ?? null,
  };
}

/**
 * Fetch all memory sources in parallel
 * This is the SINGLE entry point for intelligence memory
 */
export async function fetchMemoryBundle(
  input: MemoryAdapterInput
): Promise<UnifiedMemoryBundle> {
  const sources: string[] = [];
  const startTime = Date.now();

  // Determine what to fetch based on actor type
  const shouldFetchBusiness = 
    input.actor.type === 'store_owner' && 
    input.storeId !== null &&
    input.actor.userId !== null;

  const shouldFetchSuitcase = 
    input.actor.type === 'store_owner' && 
    input.storeId !== null;

  const shouldFetchUserMemory = 
    input.actor.type === 'consumer' && 
    input.actor.userId !== null;

  // Parallel fetch with Promise.allSettled to avoid partial failures
  const [
    businessResult,
    suitcaseResult,
    userMemoryResult,
    sessionEventsResult,
  ] = await Promise.allSettled([
    shouldFetchBusiness
      ? getBusinessMemorySummary(input.storeId!, input.actor.userId!)
      : Promise.resolve(null),
    shouldFetchSuitcase
      ? listSuitcaseItems({ storeId: input.storeId!, limit: SUITCASE_FETCH_LIMIT })
      : Promise.resolve([]),
    shouldFetchUserMemory
      ? getUserMemory(input.actor.userId!)
      : Promise.resolve(null),
    readPilEventBuffer(),
  ]);

  // Process results with graceful degradation
  const business = businessResult.status === 'fulfilled' ? businessResult.value : null;
  const suitcaseRaw = suitcaseResult.status === 'fulfilled' ? suitcaseResult.value : [];
  const user = userMemoryResult.status === 'fulfilled' ? userMemoryResult.value : null;
  const sessionEvents = sessionEventsResult.status === 'fulfilled' ? sessionEventsResult.value : [];

  // Apply caps (matching existing behavior)
  const suitcase = (suitcaseRaw as any[])
    .slice(0, MAX_SUITCASE_HIGHLIGHTS)
    .map((item) => ({
      id: item.id || `${item.sourceType}-${Date.now()}`,
      sourceType: item.sourceType,
      title: item.title,
      summary: item.summary ?? item.description ?? null,
      createdAt: item.createdAt,
    })) as any[];

  // Extract session signals
  const session = extractSessionSignals(sessionEvents);

  // Track sources for audit
  if (businessResult.status === 'fulfilled') sources.push('businessMemory');
  if (suitcaseResult.status === 'fulfilled') sources.push('suitcase');
  if (userMemoryResult.status === 'fulfilled') sources.push('userMemory');
  if (sessionEventsResult.status === 'fulfilled') sources.push('sessionEvents');

  const partial = 
    (shouldFetchBusiness && businessResult.status === 'rejected') ||
    (shouldFetchSuitcase && suitcaseResult.status === 'rejected') ||
    (shouldFetchUserMemory && userMemoryResult.status === 'rejected');

  return {
    business,
    suitcase,
    user,
    session,
    meta: {
      fetchedAt: new Date().toISOString(),
      sources,
      partial,
      fetchDurationMs: Date.now() - startTime,
    },
  };
}

/**
 * React Query wrapper for client-side usage
 * Calls core API endpoint
 */
export async function fetchMemoryBundleFromClient(
  input: MemoryAdapterInput
): Promise<UnifiedMemoryBundle> {
  const response = await fetch('/api/intelligence/memory', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(`Memory fetch failed: ${response.statusText}`);
  }

  return response.json();
}