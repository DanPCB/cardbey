/**
 * CI regression: canonical hero video survives the full publish → public artifact chain.
 * Simulates: upload video → draft preview → snapshot → republish → public projection.
 */

import { describe, it, expect } from 'vitest';
import {
  buildPublishSnapshotFromPreview,
  snapshotToPreviewShape,
} from './publishSnapshotService.js';
import { enforcePublishHeroCanonical } from './heroPublishInvariant.js';
import { resolveHeroForProjection } from '../publishedArtifactProjection/resolveHeroForProjection.js';
import { publishedBusinessArtifactToPublicStore } from '../publishedArtifactProjection/publishedBusinessArtifactToPublicStore.js';
import { heroImageUrlForBusinessColumn } from './publishDraftHeroHelpers.js';

const VIDEO = 'https://cdn.example.com/store-hero.mp4';
const POSTER = 'https://cdn.example.com/poster.jpg';
const STALE_IMAGE = 'https://cdn.example.com/stale-generated.jpg';

function draftWithVideoHero() {
  return {
    storeName: 'My Fashion',
    items: [{ name: 'Dress', price: 99 }],
    categories: [{ id: 'c1', name: 'Fashion' }],
    heroMediaType: 'video',
    heroVideoUrl: VIDEO,
    heroVideo: VIDEO,
    heroImageUrl: POSTER,
    heroPosterUrl: POSTER,
    hero: { type: 'video', videoUrl: VIDEO, url: VIDEO, imageUrl: POSTER },
  };
}

describe('heroVideoPublishPipeline', () => {
  it('upload → snapshot → preview shape keeps heroVideoUrl', () => {
    const draft = { id: 'd-pipe', input: {}, preview: draftWithVideoHero() };
    const snap = buildPublishSnapshotFromPreview(draft, draft.preview, 1);
    expect(snap.hero?.videoUrl).toBe(VIDEO);
    expect(snap.hero?.type).toBe('video');

    const republishPreview = snapshotToPreviewShape(snap);
    expect(republishPreview.heroMediaType).toBe('video');
    expect(republishPreview.heroVideoUrl).toBe(VIDEO);
    expect(republishPreview.hero?.videoUrl).toBe(VIDEO);
  });

  it('republish with stale image-only snapshot is corrected from fresh draft preview', () => {
    const staleSnap = buildPublishSnapshotFromPreview(
      { id: 'd-stale', input: {}, preview: { items: [{ name: 'Dress', price: 99 }] } },
      { items: [{ name: 'Dress', price: 99 }], heroMediaType: 'image', heroImageUrl: STALE_IMAGE },
      1,
    );
    const freshDraft = draftWithVideoHero();
    const override = snapshotToPreviewShape(staleSnap);
    enforcePublishHeroCanonical(freshDraft, { source: 'test', silent: true });
    enforcePublishHeroCanonical(override, { source: 'test', silent: true });
    Object.assign(override, {
      heroVideoUrl: freshDraft.heroVideoUrl,
      heroVideo: freshDraft.heroVideo,
      heroMediaType: freshDraft.heroMediaType,
      heroPosterUrl: freshDraft.heroPosterUrl,
    });
    enforcePublishHeroCanonical(override, { source: 'draft_store_publish_overlay', silent: true });
    expect(override.heroMediaType).toBe('video');
    expect(override.heroVideoUrl).toBe(VIDEO);
  });

  it('projection + public store API shape includes heroVideoUrl (video-first column)', () => {
    const preview = draftWithVideoHero();
    enforcePublishHeroCanonical(preview, { silent: true });
    const hero = resolveHeroForProjection({ draftPreview: preview });
    expect(hero.type).toBe('video');
    expect(hero.videoUrl).toBe(VIDEO);

    const pub = publishedBusinessArtifactToPublicStore({
      artifactVersion: 1,
      businessId: 'biz-1',
      storeId: 'biz-1',
      slug: 'my-fashion',
      name: 'My Fashion',
      category: 'fashion',
      status: 'published',
      publishedAt: new Date().toISOString(),
      content: { tagline: 'Style', description: 'Desc' },
      brand: { logoUrl: null, colors: {} },
      hero,
      website: { sections: [{ type: 'hero', content: { type: 'video', videoUrl: VIDEO } }] },
      commerce: { products: [] },
      diagnostics: {},
    });

    expect(pub.heroVideo).toBe(VIDEO);
    expect(pub.heroVideoUrl).toBe(VIDEO);
    expect(pub.heroMediaType).toBe('video');
    expect(pub.heroUrl).toBe(VIDEO);
  });

  it('Business.heroImageUrl column is video-first (poster when present)', () => {
    expect(heroImageUrlForBusinessColumn(VIDEO, POSTER)).toBe(POSTER);
    expect(heroImageUrlForBusinessColumn(VIDEO, null)).toBe(VIDEO);
    expect(heroImageUrlForBusinessColumn(null, STALE_IMAGE)).toBe(STALE_IMAGE);
  });

  it('stale heroImageUrl does not override video in enforce invariant', () => {
    const preview = {
      heroVideoUrl: VIDEO,
      heroMediaType: 'image',
      heroImageUrl: STALE_IMAGE,
    };
    enforcePublishHeroCanonical(preview, { silent: true });
    expect(preview.heroMediaType).toBe('video');
    expect(preview.heroVideoUrl).toBe(VIDEO);
    expect(preview.heroImageUrl).toBe(STALE_IMAGE);
  });
});
