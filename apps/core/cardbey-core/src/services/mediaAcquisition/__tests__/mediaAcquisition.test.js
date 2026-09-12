import { describe, expect, it, beforeEach } from 'vitest';
import {
  resolveAcquisitionDecision,
  ACQUISITION_DECISION,
  sourceRoleForProvider,
  SOURCE_ROLE,
} from '../acquisitionDecision.js';
import {
  toDiscoveryCandidate,
  dedupeDiscoveryCandidates,
  rankDiscoveryCandidates,
} from '../discoveryCandidate.js';
import { expandMediaQuery } from '../queryExpansion.js';
import { normalizeAdapterHit } from '../../universalResourceIntelligence/providerSdk/normalizeResource.js';
import {
  addToReviewQueue,
  resolveReviewItem,
  resetReviewQueueForTests,
  getReviewItem,
  setReviewQueueStorePathForTests,
} from '../reviewQueue.js';
import { resetMediaAcquisitionEventsForTests } from '../observability.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('mediaAcquisition — rights & candidates', () => {
  beforeEach(() => {
    resetReviewQueueForTests();
    resetMediaAcquisitionEventsForTests();
  });

  it('maps normalizeAdapterHit → DiscoveryCandidate with separate scores', () => {
    const normalized = normalizeAdapterHit(
      {
        remoteId: '99',
        kind: 'image',
        provider: 'pexels',
        title: 'Bakery counter',
        previewUrl: 'https://images.pexels.com/x.jpg',
        downloadUrl: 'https://images.pexels.com/x-full.jpg',
        canonicalUrl: 'https://www.pexels.com/photo/99/',
        photographer: 'Ada',
        license: 'Pexels License',
        attributionText: 'Photo by Ada on Pexels',
        width: 2000,
        height: 1500,
      },
      { sourceId: 'src_pexels' },
    );
    const c = toDiscoveryCandidate(normalized, { query: 'bakery', mediaType: 'image' });
    expect(c).toBeTruthy();
    expect(c.provider).toBe('pexels');
    expect(c.providerAssetId).toBe('99');
    expect(c.relevanceScore).toBeGreaterThan(0);
    expect(c.qualityScore).toBeGreaterThan(0);
    expect(c.rightsConfidence).toBeGreaterThan(0);
    expect(c.relevanceScore).not.toBe(c.rightsConfidence);
    expect(c.acquisitionDecision).toBe(ACQUISITION_DECISION.REMOTE_REUSE);
    expect(c.canAcquire).toBe(true);
    expect(c.canDownload).toBe(false);
  });

  it('blocks social / discovery-only sources from acquire', () => {
    expect(sourceRoleForProvider('tiktok')).toBe(SOURCE_ROLE.BUSINESS_DISCOVERY);
    const d = resolveAcquisitionDecision({
      provider: 'tiktok',
      license: 'visible on internet',
    });
    expect(d.decision).toBe(ACQUISITION_DECISION.REFERENCE_ONLY);
    expect(d.canAcquire).toBe(false);
    expect(d.canDownload).toBe(false);
  });

  it('routes unknown license to MANUAL_REVIEW', () => {
    const d = resolveAcquisitionDecision({
      provider: 'openverse',
      license: '',
    });
    expect(d.decision).toBe(ACQUISITION_DECISION.MANUAL_REVIEW);
    expect(d.canAcquire).toBe(false);
  });

  it('blocks NC / restricted licenses', () => {
    const d = resolveAcquisitionDecision({
      provider: 'openverse',
      license: 'CC BY-NC 4.0',
    });
    expect(d.decision).toBe(ACQUISITION_DECISION.BLOCKED);
  });

  it('dedupes by providerAssetId and prefers stronger rights on same URL', () => {
    const a = {
      id: '1',
      provider: 'pexels',
      providerAssetId: '1',
      sourceUrl: 'https://example.com/a',
      rightsConfidence: 50,
      qualityScore: 50,
    };
    const b = {
      id: '2',
      provider: 'pexels',
      providerAssetId: '1',
      sourceUrl: 'https://example.com/a',
      rightsConfidence: 90,
      qualityScore: 90,
    };
    const out = dedupeDiscoveryCandidates([a, b]);
    expect(out).toHaveLength(1);
  });

  it('does not collapse distinct assets by title alone', () => {
    const a = {
      id: '1',
      provider: 'pexels',
      providerAssetId: '1',
      title: 'Bakery',
      sourceUrl: 'https://a.example/1',
      rightsConfidence: 80,
      qualityScore: 80,
    };
    const b = {
      id: '2',
      provider: 'openverse',
      providerAssetId: '2',
      title: 'Bakery',
      sourceUrl: 'https://b.example/2',
      rightsConfidence: 80,
      qualityScore: 80,
    };
    expect(dedupeDiscoveryCandidates([a, b])).toHaveLength(2);
  });

  it('ranks by relevance/quality without folding rights as sole score', () => {
    const ranked = rankDiscoveryCandidates([
      { id: 'low', relevanceScore: 40, qualityScore: 40, rightsConfidence: 100 },
      { id: 'high', relevanceScore: 90, qualityScore: 90, rightsConfidence: 20 },
    ]);
    expect(ranked[0].id).toBe('high');
  });

  it('expands Vietnamese bakery query deterministically', () => {
    const { primary, expanded } = expandMediaQuery('Vietnamese bakery advertising content');
    expect(primary).toMatch(/Vietnamese bakery/i);
    expect(expanded.some((q) => /banh mi/i.test(q))).toBe(true);
    expect(expanded.length).toBeGreaterThan(0);
    expect(expanded.length).toBeLessThanOrEqual(5);
  });

  it('review approve cannot clear BLOCKED', () => {
    const blocked = toDiscoveryCandidate(
      normalizeAdapterHit(
        {
          remoteId: 'x',
          provider: 'openverse',
          title: 'x',
          license: 'All Rights Reserved',
        },
        { sourceId: 'src_openverse' },
      ),
    );
    // Force blocked decision onto candidate
    blocked.acquisitionDecision = ACQUISITION_DECISION.BLOCKED;
    blocked.canAcquire = false;
    const added = addToReviewQueue(blocked);
    expect(added.ok).toBe(true);
    // Even if queue has blocked from classification
    const item = added.item;
    item.acquisitionDecision = ACQUISITION_DECISION.BLOCKED;
    const resolved = resolveReviewItem(item.reviewId, 'approve');
    expect(resolved.ok).toBe(false);
    expect(resolved.error).toBe('blocked_cannot_approve');
  });

  it('persists review decisions across queue rehydrate (Core restart)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rma-review-'));
    const store = path.join(dir, 'review-queue.json');
    setReviewQueueStorePathForTests(store);
    resetReviewQueueForTests();

    const candidate = toDiscoveryCandidate(
      normalizeAdapterHit(
        {
          remoteId: 'persist-1',
          provider: 'openverse',
          title: 'Persist me',
          license: 'CC0',
          previewUrl: 'https://example.com/p.jpg',
          canonicalUrl: 'https://example.com/p',
        },
        { sourceId: 'src_openverse' },
      ),
    );
    const added = addToReviewQueue(candidate);
    expect(added.ok).toBe(true);
    const approved = resolveReviewItem(added.item.reviewId, 'approve');
    expect(approved.ok).toBe(true);
    expect(approved.item.queueStatus).toBe('APPROVED');

    // Simulate process restart: new module state via store path reset + hydrate
    setReviewQueueStorePathForTests(store);
    const revived = getReviewItem(added.item.reviewId);
    expect(revived).toBeTruthy();
    expect(revived.queueStatus).toBe('APPROVED');
    expect(revived.resolvedAt).toBeTruthy();

    resetReviewQueueForTests();
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });
});

describe('Freesound hit → DiscoveryCandidate', () => {
  it('normalizes audio with attribution', () => {
    const normalized = normalizeAdapterHit(
      {
        remoteId: '123',
        kind: 'audio',
        provider: 'freesound',
        title: 'Oven ambience',
        previewUrl: 'https://freesound.org/data/previews/x.mp3',
        downloadUrl: 'https://freesound.org/data/previews/x.mp3',
        canonicalUrl: 'https://freesound.org/sounds/123/',
        license: 'CC BY 4.0',
        attributionText: '"Oven ambience" via Freesound',
        durationSec: 12,
      },
      { sourceId: 'src_freesound' },
    );
    const c = toDiscoveryCandidate(normalized, { query: 'bakery', mediaType: 'audio' });
    expect(c.mediaType).toBe('audio');
    expect(c.provider).toBe('freesound');
    expect(c.attributionRequired).toBe(true);
    expect(c.acquisitionDecision).toBe(ACQUISITION_DECISION.DOWNLOAD_WITH_ATTRIBUTION);
    expect(c.canDownload).toBe(false);
  });
});
