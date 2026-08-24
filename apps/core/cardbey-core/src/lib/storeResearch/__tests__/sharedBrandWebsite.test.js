/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { sharedBrandWebsiteFromCandidates } from '../businessEntityResolver.js';

describe('sharedBrandWebsiteFromCandidates', () => {
  it('returns shared host when store locations share one website', () => {
    const url = sharedBrandWebsiteFromCandidates([
      { website: 'https://typo.com/AU?utm_source=a' },
      { website: 'https://www.typo.com/AU?utm_source=b' },
    ]);
    expect(url).toMatch(/typo\.com/i);
  });

  it('collapses brand stem across .com / .com.au', () => {
    const url = sharedBrandWebsiteFromCandidates([
      { website: 'http://bluescopesteel.com' },
      { website: 'http://bluescopesteel.com.au' },
      { website: null },
    ]);
    expect(url).toMatch(/bluescopesteel\.com/i);
  });

  it('returns null when hosts diverge', () => {
    expect(
      sharedBrandWebsiteFromCandidates([
        { website: 'https://a.example.com' },
        { website: 'https://b.other.com' },
      ]),
    ).toBeNull();
  });

  it('returns null for fewer than two candidates', () => {
    expect(sharedBrandWebsiteFromCandidates([{ website: 'https://x.com' }])).toBeNull();
  });
});
