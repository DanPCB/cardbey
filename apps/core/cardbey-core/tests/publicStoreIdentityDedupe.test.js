import { describe, expect, it } from 'vitest';
import { dedupeNearDuplicatePublicStoreResults } from '../src/services/publishedArtifactProjection/resolvePublicStoreList.js';

describe('dedupeNearDuplicatePublicStoreResults', () => {
  it('collapses AA Travel republish rows to one public store', () => {
    const andVariant = {
      store: {
        id: 'cmq6r85tp009vof5m1dqlhygz',
        name: 'AA Travel and Golf Tour',
        slug: 'aa-travel-and-golf-tour',
      },
      projection: null,
      usedFallback: false,
    };
    const ampVariant = {
      store: {
        id: 'cmq6rdaln00frof5m9cvr3bz2',
        name: 'AA Travel & Golf Tour',
        slug: 'aa-travel-golf-tour',
      },
      projection: null,
      usedFallback: false,
    };

    const deduped = dedupeNearDuplicatePublicStoreResults([andVariant, ampVariant]);
    expect(deduped).toHaveLength(1);
    expect(deduped[0]?.store.slug).toBe('aa-travel-golf-tour');
  });
});
