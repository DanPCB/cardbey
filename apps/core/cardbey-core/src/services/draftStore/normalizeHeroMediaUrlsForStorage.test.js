import { describe, it, expect } from 'vitest';
import {
  normalizeHeroPreviewPatchForStorage,
  normalizeHeroFieldsInPreview,
  normalizeProjectionHeroForStorage,
  normalizeMediaUrlField,
  normalizeStylePreferencesHeroForStorage,
} from './normalizeHeroMediaUrlsForStorage.js';

const LAN_VIDEO = 'http://192.168.1.11:3001/uploads/media/hero.mp4';
const REL_VIDEO = '/uploads/media/hero.mp4';
const CDN_VIDEO = 'https://cdn.example.com/hero.mp4';

describe('normalizeHeroMediaUrlsForStorage', () => {
  it('normalizeMediaUrlField strips LAN host from local uploads', () => {
    expect(normalizeMediaUrlField(LAN_VIDEO)).toBe(REL_VIDEO);
    expect(normalizeMediaUrlField('http://localhost:3001/uploads/media/x.jpg')).toBe('/uploads/media/x.jpg');
  });

  it('normalizeMediaUrlField leaves relative paths and CDN URLs unchanged', () => {
    expect(normalizeMediaUrlField(REL_VIDEO)).toBe(REL_VIDEO);
    expect(normalizeMediaUrlField(CDN_VIDEO)).toBe(CDN_VIDEO);
  });

  it('normalizeHeroPreviewPatchForStorage canonicalizes top-level and nested hero fields', () => {
    const patch = normalizeHeroPreviewPatchForStorage({
      heroVideoUrl: LAN_VIDEO,
      heroImageUrl: 'http://127.0.0.1:3001/uploads/media/poster.jpg',
      hero: { type: 'video', videoUrl: LAN_VIDEO, imageUrl: 'http://10.0.0.5:3001/uploads/media/p.jpg' },
    });
    expect(patch.heroVideoUrl).toBe(REL_VIDEO);
    expect(patch.heroImageUrl).toBe('/uploads/media/poster.jpg');
    expect(patch.hero.videoUrl).toBe(REL_VIDEO);
    expect(patch.hero.imageUrl).toBe('/uploads/media/p.jpg');
  });

  it('normalizeHeroFieldsInPreview canonicalizes website hero section content', () => {
    const preview = normalizeHeroFieldsInPreview({
      heroVideoUrl: LAN_VIDEO,
      website: {
        sections: [
          {
            type: 'hero',
            content: {
              type: 'video',
              videoUrl: LAN_VIDEO,
              backgroundImage: 'http://192.168.1.3:3001/uploads/media/bg.jpg',
            },
          },
        ],
      },
    });
    expect(preview.heroVideoUrl).toBe(REL_VIDEO);
    expect(preview.website.sections[0].content.videoUrl).toBe(REL_VIDEO);
    expect(preview.website.sections[0].content.backgroundImage).toBe('/uploads/media/bg.jpg');
  });

  it('normalizeStylePreferencesHeroForStorage canonicalizes cached hero fields', () => {
    const prefs = normalizeStylePreferencesHeroForStorage({
      heroVideo: LAN_VIDEO,
      heroImage: 'http://localhost:3001/uploads/media/still.jpg',
      miniWebsite: {
        sections: [{ type: 'hero', content: { videoUrl: LAN_VIDEO } }],
      },
    });
    expect(prefs.heroVideo).toBe(REL_VIDEO);
    expect(prefs.heroImage).toBe('/uploads/media/still.jpg');
    expect(prefs.miniWebsite.sections[0].content.videoUrl).toBe(REL_VIDEO);
  });

  it('normalizeProjectionHeroForStorage canonicalizes projection hero before persist', () => {
    const projection = normalizeProjectionHeroForStorage({
      hero: {
        type: 'video',
        videoUrl: LAN_VIDEO,
        posterUrl: 'http://192.168.1.11:3001/uploads/media/poster.jpg',
        imageUrl: 'http://192.168.1.11:3001/uploads/media/poster.jpg',
      },
      website: {
        sections: [{ type: 'hero', content: { videoUrl: LAN_VIDEO } }],
      },
    });
    expect(projection.hero.videoUrl).toBe(REL_VIDEO);
    expect(projection.hero.posterUrl).toBe('/uploads/media/poster.jpg');
    expect(projection.website.sections[0].content.videoUrl).toBe(REL_VIDEO);
  });
});
