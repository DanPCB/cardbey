/**
 * Canonical PublishedBusinessArtifact: build, adapter parity, validation.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildPublishedBusinessArtifact } from '../src/services/publishedArtifactProjection/buildPublishedBusinessArtifact.js';
import { publishedBusinessArtifactToPublicStore } from '../src/services/publishedArtifactProjection/publishedBusinessArtifactToPublicStore.js';
import { validatePublishedBusinessArtifact } from '../src/services/publishedArtifactProjection/validatePublishedBusinessArtifact.js';
import { persistPublishedBusinessArtifact } from '../src/services/publishedArtifactProjection/persistPublishedBusinessArtifact.js';
import { toPublicStore } from '../src/utils/publicStoreMapper.js';

const MC_BUSINESS = {
  id: 'biz-mc',
  userId: 'tenant-1',
  name: 'MC Hair Salon',
  slug: 'mc-hair-salon',
  type: 'service',
  description: 'Full salon experience in Melbourne.',
  tagline: 'Style that speaks',
  isActive: true,
  publishedAt: new Date('2026-01-01'),
  heroImageUrl: 'https://cdn.example.com/hero.mp4',
  avatarImageUrl: 'https://cdn.example.com/avatar.jpg',
  stylePreferences: {
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
  },
  products: [],
};

const MC_DRAFT_PREVIEW = {
  tagline: 'Style that speaks',
  slogan: 'Style that speaks',
  description: 'Full salon experience in Melbourne.',
  heroVideo: 'https://cdn.example.com/hero.mp4',
  website: {
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
};

describe('publishCanonicalProjection', () => {
  it('builds MC Hair Salon projection with tagline, description, hero video', () => {
    const projection = buildPublishedBusinessArtifact({
      business: MC_BUSINESS,
      draftPreview: MC_DRAFT_PREVIEW,
      source: 'test',
    });
    expect(projection.slug).toBe('mc-hair-salon');
    expect(projection.content.tagline).toBe('Style that speaks');
    expect(projection.content.description).toBe('Full salon experience in Melbourne.');
    expect(projection.hero.videoUrl).toBe('https://cdn.example.com/hero.mp4');
    expect(projection.hero.type).toBe('video');
    expect(projection.website.sections.length).toBeGreaterThan(0);
  });

  it('homepage card adapter and public store adapter share same tagline, description, hero', () => {
    const projection = buildPublishedBusinessArtifact({
      business: MC_BUSINESS,
      draftPreview: MC_DRAFT_PREVIEW,
    });
    const homepageCard = publishedBusinessArtifactToPublicStore(projection);
    const publicSlug = publishedBusinessArtifactToPublicStore(projection);

    expect(homepageCard.slug).toBe(publicSlug.slug);
    expect(homepageCard.name).toBe(publicSlug.name);
    expect(homepageCard.tagline).toBe('Style that speaks');
    expect(publicSlug.tagline).toBe('Style that speaks');
    expect(homepageCard.description).toBe('Full salon experience in Melbourne.');
    expect(publicSlug.description).toBe('Full salon experience in Melbourne.');
    expect(homepageCard.heroVideo).toBe('https://cdn.example.com/hero.mp4');
    expect(publicSlug.heroVideo).toBe('https://cdn.example.com/hero.mp4');
    expect(homepageCard.heroUrl).toBe(publicSlug.heroUrl);
  });

  it('does not use generic fallback description when real content exists', () => {
    const projection = buildPublishedBusinessArtifact({
      business: MC_BUSINESS,
      draftPreview: MC_DRAFT_PREVIEW,
    });
    const validation = validatePublishedBusinessArtifact(projection);
    expect(projection.content.description).not.toMatch(/browse our menu/i);
    expect(validation.warnings.some((w) => w.code === 'generic_fallback_description')).toBe(false);
  });

  it('preview miniWebsite sections survive in projection website', () => {
    const projection = buildPublishedBusinessArtifact({
      business: MC_BUSINESS,
      draftPreview: MC_DRAFT_PREVIEW,
    });
    expect(projection.website.sections[0].content.videoUrl).toBe('https://cdn.example.com/hero.mp4');
  });

  it('adapter matches legacy toPublicStore hero video for same business row', () => {
    const projection = buildPublishedBusinessArtifact({ business: MC_BUSINESS });
    const fromProjection = publishedBusinessArtifactToPublicStore(projection);
    const legacy = toPublicStore({
      ...MC_BUSINESS,
      stylePreferences: JSON.stringify(MC_BUSINESS.stylePreferences),
    });
    expect(fromProjection.heroVideo).toBe(legacy.heroVideo);
    expect(fromProjection.tagline).toBe(legacy.tagline);
  });

  it('validate warns on missing slug', () => {
    const projection = buildPublishedBusinessArtifact({
      business: { ...MC_BUSINESS, slug: '' },
    });
    const { valid, warnings } = validatePublishedBusinessArtifact(projection);
    expect(valid).toBe(false);
    expect(warnings.some((w) => w.code === 'missing_slug')).toBe(true);
  });

  it('republish preserves heroVideoUrl — does not revert to null', async () => {
    const upsert = vi.fn().mockResolvedValue({});
    const prisma = {
      publishedArtifactProjection: { upsert, findMany: vi.fn() },
    };
    const projection = buildPublishedBusinessArtifact({
      business: MC_BUSINESS,
      draftPreview: MC_DRAFT_PREVIEW,
    });
    expect(projection.hero.videoUrl).toBe('https://cdn.example.com/hero.mp4');

    await persistPublishedBusinessArtifact(prisma, projection, {
      sourceDraftId: 'draft-first',
      publishRunId: 'run-first',
    });
    const createCall = upsert.mock.calls[0][0];
    expect(createCall.create.heroVideoUrl).toBe('https://cdn.example.com/hero.mp4');
    expect(createCall.update.heroVideoUrl).toBe('https://cdn.example.com/hero.mp4');

    upsert.mockClear();
    await persistPublishedBusinessArtifact(prisma, projection, {
      sourceDraftId: 'draft-republish',
      publishRunId: 'run-republish',
    });
    const updateCall = upsert.mock.calls[0][0];
    expect(updateCall.update.heroVideoUrl).toBe('https://cdn.example.com/hero.mp4');
    expect(updateCall.update.heroMediaType).toBe('video');
    expect(updateCall.update.heroVideoUrl).not.toBeNull();
  });

  it('rejects generic business.description when miniWebsite hero headline exists', () => {
    const business = {
      ...MC_BUSINESS,
      description: 'MC Hair Salon is your local Beauty — browse our menu and order online.',
      stylePreferences: {
        ...MC_BUSINESS.stylePreferences,
        miniWebsite: {
          sections: [
            {
              type: 'hero',
              content: {
                headline: 'Your Style, Our Passion!',
                subheadline: 'Style that speaks',
                type: 'video',
                videoUrl: 'https://cdn.example.com/hero.mp4',
              },
            },
          ],
        },
      },
    };
    const projection = buildPublishedBusinessArtifact({ business });
    expect(projection.content.tagline).toBe('Your Style, Our Passion!');
    expect(projection.content.description).not.toMatch(/browse our menu/i);
  });
});
