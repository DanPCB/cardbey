import { describe, it, expect } from 'vitest';
import { planCitationQueries, isCitationProbesEnabled } from '../citationProbe.js';
import { isVirtualKolEnabled, draftVirtualKolFromSkp } from '../virtualKolFoundation.js';
import { buildSKPFromSources } from '../../storeKnowledge/index.js';

describe('citationProbe', () => {
  it('plans queries without network I/O', () => {
    const q = planCitationQueries({
      storeSlug: 'demo-cafe',
      storeName: 'Demo Cafe',
      suburb: 'Melbourne',
    });
    expect(q.some((x) => x.includes('demo-cafe'))).toBe(true);
    expect(q.some((x) => x.includes('Demo Cafe'))).toBe(true);
  });

  it('defaults citation probes off', () => {
    expect(isCitationProbesEnabled()).toBe(false);
  });
});

describe('virtualKolFoundation', () => {
  it('defaults Virtual KOL off and skips drafts', () => {
    expect(isVirtualKolEnabled()).toBe(false);
    const skp = buildSKPFromSources({
      business: {
        id: 'biz_1',
        slug: 'demo-cafe',
        name: 'Demo Cafe',
        description: 'Specialty coffee in Melbourne CBD with light meals.',
        type: 'Cafe',
        suburb: 'Melbourne',
        state: 'VIC',
        publishedAt: new Date('2026-01-01T00:00:00.000Z'),
        isActive: true,
        provenance: 'owner',
        claimStatus: 'claimed',
      },
    });
    const draft = draftVirtualKolFromSkp(skp);
    expect(draft.ok).toBe(false);
    expect(draft.reason).toBe('virtual_kol_disabled');
  });
});
