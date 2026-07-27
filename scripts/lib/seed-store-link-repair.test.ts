import { describe, expect, it } from 'vitest';
import {
  buildPublishedStoreNameKeySet,
  findPublishedStoreForSeed,
  normalizeBusinessIdentityName,
  seedMatchesPublishedStore,
} from '../../apps/core/cardbey-core/src/lib/businessIngestion/publishedStoreSeedMatch.js';
import { planSeedStoreLinkRepairs } from './seed-store-link-repair.ts';

describe('publishedStoreSeedMatch', () => {
  it('normalizes business names for identity match', () => {
    expect(normalizeBusinessIdentityName("Pellegrini's Espresso Bar")).toBe('pellegrinisespressobar');
    expect(normalizeBusinessIdentityName('Brunetti Carlton')).toBe('brunetticarlton');
  });

  it('matches Brunetti seed to published store by name', () => {
    const seed = { normalized: { businessName: 'Brunetti Carlton' } };
    const store = {
      id: 'store-1',
      name: 'Brunetti Carlton',
      slug: 'brunetti-carlton',
      publishedAt: new Date(),
    };
    expect(seedMatchesPublishedStore(seed, store)).toBe(true);
    expect(findPublishedStoreForSeed(seed, [store])?.slug).toBe('brunetti-carlton');
  });

  it('buildPublishedStoreNameKeySet dedupes published names', () => {
    const keys = buildPublishedStoreNameKeySet([
      { id: '1', name: 'Brunetti Carlton', slug: 'brunetti-carlton' },
    ]);
    expect(keys.has('brunetticarlton')).toBe(true);
  });
});

describe('planSeedStoreLinkRepairs', () => {
  it('plans link for claimable seed with matching published store', () => {
    const plan = planSeedStoreLinkRepairs({
      seeds: [
        {
          id: 'seed-1',
          normalized: { businessName: 'Brunetti Carlton' },
          verificationStatus: 'seeded_claimable',
          claimable: true,
          storeId: null,
        } as any,
      ],
      stores: [
        {
          id: 'cmqk8vupy0047olf14npkv3ox',
          name: 'Brunetti Carlton',
          slug: 'brunetti-carlton',
          publishedAt: new Date(),
        },
      ],
      draftIdByStoreId: new Map([['cmqk8vupy0047olf14npkv3ox', 'draft-1']]),
    });

    expect(plan.candidates).toHaveLength(1);
    expect(plan.candidates[0].storeSlug).toBe('brunetti-carlton');
    expect(plan.candidates[0].draftId).toBe('draft-1');
  });

  it('skips seeds already linked to a store', () => {
    const plan = planSeedStoreLinkRepairs({
      seeds: [
        {
          id: 'seed-1',
          normalized: { businessName: 'Brunetti Carlton' },
          verificationStatus: 'seeded_claimable',
          claimable: false,
          storeId: 'existing-store',
        } as any,
      ],
      stores: [
        {
          id: 'cmqk8vupy0047olf14npkv3ox',
          name: 'Brunetti Carlton',
          slug: 'brunetti-carlton',
          publishedAt: new Date(),
        },
      ],
    });

    expect(plan.candidates).toHaveLength(0);
    expect(plan.skippedAlreadyLinked).toBe(1);
  });
});
