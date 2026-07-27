/**
 * Publish runway: one Business per tenant+slug; feed and public slug share toPublicStore shape.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { toPublicStore } from '../src/utils/publicStoreMapper.js';
import { resolveHeroMediaFromBusiness } from '../src/utils/heroMediaResolve.js';
import { resolvePublishedStoreCopyFromPreview } from '../src/services/draftStore/publishRunway.js';
import { resolveMiniWebsiteForPublish } from '../src/services/draftStore/draftPreviewHeroSync.js';

describe('publish canonical store copy', () => {
  it('resolvePublishedStoreCopyFromPreview uses AI tagline/slogan and description', () => {
    const copy = resolvePublishedStoreCopyFromPreview({
      tagline: 'Style that speaks',
      slogan: 'Style that speaks',
      description: 'Full salon experience in Melbourne.',
      heroText: 'Walk-ins welcome',
    });
    expect(copy.tagline).toBe('Style that speaks');
    expect(copy.description).toBe('Full salon experience in Melbourne.');
  });

  it('toPublicStore and hero resolver agree on video hero for mc-hair-salon shape', () => {
    const business = {
      id: 'biz-mc',
      name: 'MC Hair Salon',
      slug: 'mc-hair-salon',
      description: 'Full salon experience.',
      tagline: 'Style that speaks',
      heroImageUrl: 'https://cdn.example.com/hero.mp4',
      avatarImageUrl: 'https://cdn.example.com/avatar.jpg',
      stylePreferences: JSON.stringify({
        heroVideo: 'https://cdn.example.com/hero.mp4',
        heroImage: 'https://cdn.example.com/poster.jpg',
        miniWebsite: {
          sections: [
            {
              type: 'hero',
              content: {
                type: 'video',
                videoUrl: 'https://cdn.example.com/hero.mp4',
                imageUrl: 'https://cdn.example.com/poster.jpg',
              },
            },
          ],
        },
      }),
      products: [],
    };
    const pub = toPublicStore(business);
    const media = resolveHeroMediaFromBusiness(business);
    expect(pub.slug).toBe('mc-hair-salon');
    expect(pub.tagline).toBe('Style that speaks');
    expect(pub.description).toBe('Full salon experience.');
    expect(pub.heroVideo).toBe('https://cdn.example.com/hero.mp4');
    expect(pub.heroUrl).toBe(media.heroUrl);
    expect(pub.website?.sections?.length).toBe(1);
    expect(pub.website.sections[0].content.videoUrl).toBe('https://cdn.example.com/hero.mp4');
  });

  it('resolveMiniWebsiteForPublish prefers website hero over stale stylePrefs', () => {
    const raw = {
      heroVideo: 'https://cdn.example.com/new.mp4',
      website: {
        sections: [{ type: 'hero', content: { type: 'video', videoUrl: 'https://cdn.example.com/new.mp4' } }],
      },
      stylePreferences: {
        miniWebsite: {
          sections: [{ type: 'hero', content: { type: 'image', imageUrl: 'https://old.example/old.jpg' } }],
        },
      },
    };
    const site = resolveMiniWebsiteForPublish(raw);
    expect(site.sections[0].content.videoUrl).toBe('https://cdn.example.com/new.mp4');
  });
});
