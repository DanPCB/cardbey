import { describe, it, expect } from 'vitest';
import { buildPublishedBusinessArtifact } from '../src/services/publishedArtifactProjection/buildPublishedBusinessArtifact.js';
import { publishedBusinessArtifactToPublicStore } from '../src/services/publishedArtifactProjection/publishedBusinessArtifactToPublicStore.js';

describe('published artifact socialLinks', () => {
  it('buildPublishedBusinessArtifact includes socialLinks in content', () => {
    const projection = buildPublishedBusinessArtifact({
      business: {
        id: 'biz-1',
        userId: 'user-1',
        name: 'Test',
        slug: 'test',
        type: 'Food',
        isActive: true,
        socialLinks: { instagram: 'https://instagram.com/test' },
      },
    });

    expect(projection.content.socialLinks).toEqual({ instagram: 'https://instagram.com/test' });
  });

  it('publishedBusinessArtifactToPublicStore exposes socialLinks', () => {
    const projection = {
      businessId: 'biz-1',
      slug: 'test',
      name: 'Test',
      content: {
        socialLinks: { facebook: 'https://facebook.com/test' },
      },
      hero: {},
      website: { sections: [] },
      commerce: { products: [] },
      artifactVersion: 'v1',
    };

    const pub = publishedBusinessArtifactToPublicStore(projection);
    expect(pub.socialLinks).toEqual({ facebook: 'https://facebook.com/test' });
  });
});
