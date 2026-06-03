import { describe, it, expect } from 'vitest';
import {
  readCanonicalHeroFromPreview,
  resolveCanonicalHeroApiFields,
  resolveMiniWebsiteForPublish,
  applyCanonicalHeroToMiniWebsite,
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

  it('resolveCanonicalHeroApiFields prefers video over stale poster heroImageUrl', () => {
    const fields = resolveCanonicalHeroApiFields({
      heroVideo: 'https://cdn.example.com/hero.mp4',
      heroImageUrl: 'https://cdn.example.com/poster.jpg',
      heroMediaType: 'video',
    });
    expect(fields.heroVideo).toBe('https://cdn.example.com/hero.mp4');
    expect(fields.heroMediaType).toBe('video');
    expect(fields.heroImageUrl).toBe('https://cdn.example.com/poster.jpg');
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

  it('ignores stale pexels meta poster when heroVideo is set without explicit poster', () => {
    const pexels = 'https://images.pexels.com/photos/8743972/pexels-photo.jpeg';
    const video = '/uploads/media/hero.mp4';
    const raw = {
      heroVideo: video,
      heroMediaType: 'video',
      hero: { type: 'video', videoUrl: video, url: video },
      meta: { profileHeroUrl: pexels, profileHeroVideoUrl: video },
    };
    expect(readCanonicalHeroFromPreview(raw).heroImage).toBeNull();
    expect(readCanonicalHeroFromPreview(raw).heroVideo).toBe(video);
    const fields = resolveCanonicalHeroApiFields(raw);
    expect(fields.heroVideo).toBe(video);
    expect(fields.heroImageUrl).toBe(video);
  });

  it('applyCanonicalHeroToMiniWebsite strips stale stock image fields on video-only hero', () => {
    const pexels = 'https://images.pexels.com/photos/8743972/pexels-photo.jpeg';
    const video = '/uploads/media/hero.mp4';
    const mini = {
      sections: [
        {
          type: 'hero',
          content: {
            type: 'image',
            imageUrl: pexels,
            url: pexels,
            backgroundImage: pexels,
          },
        },
      ],
    };
    applyCanonicalHeroToMiniWebsite(mini, {
      heroVideo: video,
      heroMediaType: 'video',
      hero: { type: 'video', videoUrl: video, url: video },
    });
    const hero = mini.sections.find((s) => s.type === 'hero');
    expect(hero.content.videoUrl).toBe(video);
    expect(hero.content.type).toBe('video');
    expect(hero.content.imageUrl).toBeUndefined();
    expect(hero.content.backgroundImage).toBeUndefined();
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
});
