/**
 * Lightweight file cache for discovery provider results.
 * Key: provider + suburb + categoryGroup + maxResults + date bucket
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { BusinessCandidate } from '../types/index.js';
import { getDiscoveryProviderConfig } from '../config/discoveryProviderConfig.js';
import { logDiscoveryProviderEvent } from './discoveryProviderLogger.js';

export type DiscoveryCacheEntry = {
  provider: string;
  suburb: string;
  categoryGroup: string[];
  maxResults: number;
  dateBucket: string;
  cachedAt: string;
  candidates: BusinessCandidate[];
};

function dateBucket(dryRun: boolean): string {
  const d = new Date();
  if (dryRun) {
    return d.toISOString().slice(0, 10);
  }
  const week = Math.floor(d.getTime() / (7 * 24 * 60 * 60 * 1000));
  return `w${week}`;
}

function cacheKey(input: {
  provider: string;
  suburb: string;
  categoryGroup: string[];
  maxResults: number;
  dryRun: boolean;
}): string {
  const raw = [
    input.provider,
    input.suburb.toLowerCase(),
    [...input.categoryGroup].sort().join('|'),
    String(input.maxResults),
    dateBucket(input.dryRun),
  ].join('::');
  return createHash('sha256').update(raw).digest('hex');
}

async function cacheFilePath(key: string): Promise<string> {
  const cfg = getDiscoveryProviderConfig();
  await fs.mkdir(cfg.cacheDir, { recursive: true });
  return path.join(cfg.cacheDir, `${key}.json`);
}

export async function readDiscoveryCache(input: {
  provider: string;
  suburb: string;
  categoryGroup: string[];
  maxResults: number;
  dryRun: boolean;
}): Promise<DiscoveryCacheEntry | null> {
  const key = cacheKey(input);
  const filePath = await cacheFilePath(key);
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const entry = JSON.parse(raw) as DiscoveryCacheEntry;
    const cfg = getDiscoveryProviderConfig();
    const ttl = input.dryRun ? cfg.cacheTtlDryRunMs : cfg.cacheTtlLiveMs;
    const age = Date.now() - new Date(entry.cachedAt).getTime();
    if (age > ttl) return null;
    logDiscoveryProviderEvent('discovery_provider_cache_hit', {
      provider: input.provider,
      suburb: input.suburb,
      categoryCount: input.categoryGroup.length,
      maxResults: input.maxResults,
      dryRun: input.dryRun,
    });
    return entry;
  } catch {
    return null;
  }
}

export async function writeDiscoveryCache(
  input: {
    provider: string;
    suburb: string;
    categoryGroup: string[];
    maxResults: number;
    dryRun: boolean;
  },
  candidates: BusinessCandidate[],
): Promise<void> {
  const key = cacheKey(input);
  const filePath = await cacheFilePath(key);
  const entry: DiscoveryCacheEntry = {
    provider: input.provider,
    suburb: input.suburb,
    categoryGroup: input.categoryGroup,
    maxResults: input.maxResults,
    dateBucket: dateBucket(input.dryRun),
    cachedAt: new Date().toISOString(),
    candidates,
  };
  await fs.writeFile(filePath, JSON.stringify(entry, null, 2), 'utf8');
}

export function resetDiscoveryCacheForTests(): void {
  /* file cache persists; tests use unique suburbs or mock */
}
