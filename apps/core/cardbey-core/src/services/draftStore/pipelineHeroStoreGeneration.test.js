/**
 * Regression: pipeline store-build / regenerate must not wipe user-uploaded video heroes.
 */
import { describe, it, expect } from 'vitest';
import {
  applyPipelineGeneratedHeroImage,
  copyVideoHeroFieldsToPreview,
  getExistingVideoUrlFromPreview,
} from './draftPreviewHeroSync.js';
import { mergeWebsiteIntoPreview } from './websiteSectionsGenerator.js';

const USER_VIDEO = 'https://cdn.example.com/user-hero.mp4';
const GENERATED_STILL = 'https://cdn.example.com/generated-still.jpg';
const STALE_NESTED_IMAGE = 'https://cdn.example.com/stale-nested.jpg';

/** Mirrors generateDraft hero write order after Phase 2. */
function applyGenerateDraftHeroWrites(preview, priorPreview, heroImageUrl) {
  copyVideoHeroFieldsToPreview(preview, priorPreview);
  if (heroImageUrl) {
    applyPipelineGeneratedHeroImage(preview, heroImageUrl, { writer: 'generateDraft', draftId: 'd-test' });
  }
}

describe('pipelineHeroStoreGeneration', () => {
  it('generateDraft-shaped flow preserves uploaded video when AI generates a still hero', () => {
    const priorPreview = {
      heroVideoUrl: USER_VIDEO,
      heroMediaType: 'video',
      hero: { type: 'video', videoUrl: USER_VIDEO },
    };
    const preview = { storeName: 'Cafe' };

    applyGenerateDraftHeroWrites(preview, priorPreview, GENERATED_STILL);

    expect(getExistingVideoUrlFromPreview(preview)).toBe(USER_VIDEO);
    expect(preview.heroMediaType).toBe('video');
    expect(preview.heroImageUrl).not.toBe(GENERATED_STILL);
  });

  it('finalizeDraft-shaped flow does not overwrite video on existing preview', () => {
    const preview = {
      heroVideoUrl: USER_VIDEO,
      heroMediaType: 'video',
      hero: { type: 'video', videoUrl: USER_VIDEO },
    };
    const applied = applyPipelineGeneratedHeroImage(preview, GENERATED_STILL, {
      writer: 'finalizeDraft',
      draftId: 'd-finalize',
    });
    expect(applied).toBe(false);
    expect(getExistingVideoUrlFromPreview(preview)).toBe(USER_VIDEO);
    expect(preview.heroMediaType).toBe('video');
  });

  it('image-only store generation still writes canonical image hero when no video', () => {
    const preview = { storeName: 'Bakery' };
    const applied = applyPipelineGeneratedHeroImage(preview, GENERATED_STILL, {
      writer: 'generateDraft',
      draftId: 'd-image-only',
    });
    expect(applied).toBe(true);
    expect(preview.heroImageUrl).toBe(GENERATED_STILL);
    expect(preview.heroMediaType).toBe('image');
    expect(getExistingVideoUrlFromPreview(preview)).toBeNull();
  });

  it('mergeWebsiteIntoPreview does not promote nested image over existing video hero', () => {
    const preview = {
      heroVideoUrl: USER_VIDEO,
      heroMediaType: 'video',
      hero: {
        type: 'video',
        videoUrl: USER_VIDEO,
        imageUrl: STALE_NESTED_IMAGE,
      },
    };
    mergeWebsiteIntoPreview(preview, {});
    expect(getExistingVideoUrlFromPreview(preview)).toBe(USER_VIDEO);
    expect(preview.heroImageUrl).not.toBe(STALE_NESTED_IMAGE);
  });

  it('mergeWebsiteIntoPreview mirrors nested image when no video hero exists', () => {
    const preview = {
      hero: { imageUrl: GENERATED_STILL, url: GENERATED_STILL },
    };
    mergeWebsiteIntoPreview(preview, {});
    expect(preview.heroImageUrl).toBe(GENERATED_STILL);
    expect(preview.heroMediaType).toBe('image');
  });
});
