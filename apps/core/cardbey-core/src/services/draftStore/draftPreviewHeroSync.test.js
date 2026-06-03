import { describe, it, expect } from 'vitest';
import {
  readCanonicalHeroFromPreview,
  resolveCanonicalHeroMediaFromPreview,
  resolveCanonicalHeroApiFields,
  writeCanonicalHeroMediaToPreview,
  resolveMiniWebsiteForPublish,
  applyCanonicalHeroToMiniWebsite,
  getExistingVideoUrlFromPreview,
  protectVideoHeroFromImageOnlyOverwrite,
  applyPipelineGeneratedHeroImage,
  copyVideoHeroFieldsToPreview,
  isExplicitUserImageHeroReplace,
} from './draftPreviewHeroSync.js';

describe('draftPreviewHeroSync', () => {
  it('prefers website over stale stylePreferences.miniWebsite and applies hero video', () => {
    const rawPreview = {
      heroVideo: 'https://cdn.example.com/hero.mp4',
      heroImageUrl: 'https://cdn.example.com/poster.jpg',
      website: {
        sections: [{ type: 'hero', content: { type: 'image', imageUrl: 'https://old.example/old.jpg' } }],
      },
      stylePreferences: {
        miniWebsite: {
          sections: [{ type: 'hero', content: { type: 'image', imageUrl: 'https://stale.example/stale.jpg' } }],
        },
      },
    };
    const resolved = resolveMiniWebsiteForPublish(rawPreview);
    const hero = resolved.sections.find((s) => s.type === 'hero');
    expect(hero.content.videoUrl).toBe('https://cdn.example.com/hero.mp4');
    expect(hero.content.imageUrl).toBe('https://cdn.example.com/poster.jpg');
    expect(hero.content.type).toBe('video');
  });

  it('readCanonicalHeroFromPreview reads heroVideoUrl on preview', () => {
    const raw = {
      heroMediaType: 'video',
      heroVideoUrl: 'https://a.com/h.mp4',
      heroImageUrl: null,
    };
    expect(readCanonicalHeroFromPreview(raw)).toMatchObject({
      heroVideo: 'https://a.com/h.mp4',
      isVideo: true,
    });
  });

  it('readCanonicalHeroFromPreview reads meta and preview fields', () => {
    const raw = {
      meta: { profileHeroUrl: 'https://a.com/h.jpg', profileHeroVideoUrl: 'https://a.com/h.mp4' },
    };
    expect(readCanonicalHeroFromPreview(raw)).toEqual({
      heroImage: 'https://a.com/h.jpg',
      heroVideo: 'https://a.com/h.mp4',
      isVideo: true,
    });
  });

  it('readCanonicalHeroFromPreview ignores stale meta video when heroMediaType is image', () => {
    const raw = {
      heroMediaType: 'image',
      heroImageUrl: 'https://a.com/new.jpg',
      meta: { profileHeroUrl: 'https://a.com/new.jpg', profileHeroVideoUrl: 'https://a.com/old.mp4' },
    };
    expect(readCanonicalHeroFromPreview(raw)).toMatchObject({
      heroImage: 'https://a.com/new.jpg',
      heroVideo: null,
      isVideo: false,
    });
  });

  it('resolveCanonicalHeroMediaFromPreview: video wins, legacy image becomes poster only', () => {
    const raw = {
      heroMediaType: 'video',
      heroVideoUrl: 'https://cdn.example.com/hero.mp4',
      hero: { imageUrl: 'https://cdn.example.com/legacy.jpg' },
      heroImageUrl: 'https://cdn.example.com/top.jpg',
    };
    expect(resolveCanonicalHeroMediaFromPreview(raw)).toEqual({
      mediaType: 'video',
      imageUrl: null,
      videoUrl: 'https://cdn.example.com/hero.mp4',
      posterUrl: 'https://cdn.example.com/legacy.jpg',
    });
  });

  it('resolveCanonicalHeroApiFields maps video canonical to API shape', () => {
    const raw = {
      heroMediaType: 'video',
      heroVideoUrl: 'https://cdn.example.com/hero.mp4',
      hero: { imageUrl: 'https://cdn.example.com/poster.jpg' },
    };
    expect(resolveCanonicalHeroApiFields(raw)).toEqual({
      heroImageUrl: 'https://cdn.example.com/poster.jpg',
      heroVideo: 'https://cdn.example.com/hero.mp4',
      heroMediaType: 'video',
    });
  });

  it('writeCanonicalHeroMediaToPreview: does not set heroImageUrl to video url', () => {
    const merged = { heroImageUrl: 'https://cdn.example.com/old.jpg' };
    writeCanonicalHeroMediaToPreview(merged, {
      mediaType: 'video',
      imageUrl: null,
      videoUrl: 'https://cdn.example.com/hero.mp4',
      posterUrl: null,
    });
    expect(merged.heroMediaType).toBe('video');
    expect(merged.heroVideoUrl).toBe('https://cdn.example.com/hero.mp4');
    // poster missing -> keep existing heroImageUrl (do not replace with video)
    expect(merged.heroImageUrl).toBe('https://cdn.example.com/old.jpg');
  });

  it('syncHeroFieldsIntoPreviewWebsite updates stylePreferences.miniWebsite hero section', async () => {
    const { syncHeroFieldsIntoPreviewWebsite } = await import('./draftPreviewHeroSync.js');
    const merged = {
      heroImageUrl: 'https://cdn.example.com/new.jpg',
      stylePreferences: {
        miniWebsite: {
          sections: [{ type: 'hero', content: { type: 'image', imageUrl: 'https://old.example/old.jpg' } }],
        },
      },
    };
    syncHeroFieldsIntoPreviewWebsite(merged);
    const hero = merged.stylePreferences.miniWebsite.sections.find((s) => s.type === 'hero');
    expect(hero.content.imageUrl).toBe('https://cdn.example.com/new.jpg');
    expect(merged.website?.sections?.[0]?.content?.imageUrl).toBe('https://cdn.example.com/new.jpg');
  });

  it('applyCanonicalHeroToMiniWebsite inserts hero section when missing', () => {
    const mini = { sections: [{ type: 'products', content: {} }] };
    applyCanonicalHeroToMiniWebsite(mini, { heroImageUrl: 'https://cdn.example.com/new.jpg' });
    expect(mini.sections[0].type).toBe('hero');
    expect(mini.sections[0].content.imageUrl).toBe('https://cdn.example.com/new.jpg');
  });

  it('resolveCanonicalHeroMediaFromPreview: stale heroMediaType image does not drop heroVideoUrl', () => {
    expect(
      resolveCanonicalHeroMediaFromPreview({
        heroMediaType: 'image',
        heroVideoUrl: 'https://cdn.example.com/hero.mp4',
        heroImageUrl: 'https://cdn.example.com/stale.jpg',
      }),
    ).toMatchObject({
      mediaType: 'video',
      videoUrl: 'https://cdn.example.com/hero.mp4',
    });
  });

  it('protectVideoHeroFromImageOnlyOverwrite blocks pipeline image patch when video exists', () => {
    const existing = {
      heroMediaType: 'video',
      heroVideoUrl: 'https://cdn.example.com/hero.mp4',
      heroImageUrl: 'https://cdn.example.com/poster.jpg',
    };
    const incoming = {
      hero: { imageUrl: 'https://cdn.example.com/generated.jpg' },
      heroImageUrl: 'https://cdn.example.com/generated.jpg',
    };
    const { incoming: safe, protected: wasProtected } = protectVideoHeroFromImageOnlyOverwrite(
      existing,
      incoming,
      { writer: 'generateDraft' },
    );
    expect(wasProtected).toBe(true);
    expect(safe.heroImageUrl).toBeUndefined();
    expect(safe.hero).toBeUndefined();
  });

  it('protectVideoHeroFromImageOnlyOverwrite allows explicit image upload replace', () => {
    const existing = {
      heroMediaType: 'video',
      heroVideoUrl: 'https://cdn.example.com/hero.mp4',
    };
    const incoming = {
      heroMediaType: 'image',
      heroImageUrl: 'https://cdn.example.com/new.jpg',
      heroVideo: null,
      heroVideoUrl: null,
      hero: { type: 'image', imageUrl: 'https://cdn.example.com/new.jpg', videoUrl: null },
    };
    expect(isExplicitUserImageHeroReplace(incoming)).toBe(true);
    const { protected: wasProtected } = protectVideoHeroFromImageOnlyOverwrite(existing, incoming, {
      heroWriteIntent: 'image_upload',
    });
    expect(wasProtected).toBe(false);
  });

  it('applyPipelineGeneratedHeroImage does not wipe existing video', () => {
    const preview = {
      heroVideoUrl: 'https://cdn.example.com/hero.mp4',
      heroMediaType: 'video',
    };
    const applied = applyPipelineGeneratedHeroImage(preview, 'https://cdn.example.com/gen.jpg', {
      writer: 'finalizeDraft',
    });
    expect(applied).toBe(false);
    expect(getExistingVideoUrlFromPreview(preview)).toBe('https://cdn.example.com/hero.mp4');
  });

  it('applyPipelineGeneratedHeroImage sets image when no video', () => {
    const preview = {};
    const applied = applyPipelineGeneratedHeroImage(preview, 'https://cdn.example.com/gen.jpg', {
      writer: 'finalizeDraft',
    });
    expect(applied).toBe(true);
    expect(preview.heroImageUrl).toBe('https://cdn.example.com/gen.jpg');
    expect(preview.heroMediaType).toBe('image');
  });

  it('copyVideoHeroFieldsToPreview preserves video on regenerate-shaped preview', () => {
    const prior = {
      heroVideoUrl: 'https://cdn.example.com/hero.mp4',
      heroMediaType: 'video',
      hero: { type: 'video', videoUrl: 'https://cdn.example.com/hero.mp4' },
    };
    const target = { storeName: 'Cafe', heroImageUrl: null };
    expect(copyVideoHeroFieldsToPreview(target, prior)).toBe(true);
    expect(target.heroVideoUrl).toBe('https://cdn.example.com/hero.mp4');
    expect(target.heroMediaType).toBe('video');
  });
});
