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

  it('collapses My Business slug suffix variants', () => {
    const deduped = dedupeNearDuplicatePublicStoreResults([
      {
        store: { id: 'cmp6w53sz0030ss5d78ms2yg2', name: 'My Business', slug: 'my-business-2' },
        projection: null,
        usedFallback: false,
      },
      {
        store: { id: 'cmp6ukzgm001zos5c917l954r', name: 'My Business', slug: 'my-business' },
        projection: null,
        usedFallback: false,
      },
    ]);
    expect(deduped).toHaveLength(1);
    expect(deduped[0]?.store.slug).toBe('my-business');
  });
});
