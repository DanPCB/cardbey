import { describe, expect, it } from 'vitest';
import { buildSeedCatalog } from '../seedCatalogBuilder.js';

describe('buildSeedCatalog vertical routing', () => {
  it('uses beauty industry offerings for beauty businesses, not retail placeholders', () => {
    const seed = buildSeedCatalog(
      { verticalGroup: 'beauty', verticalSlug: 'beauty.nails', businessModel: 'services' },
      { targetCount: 24 },
    );
    const names = seed.items.map((item) => item.name).join(' | ');
    expect(names).not.toMatch(/variant a|new arrival|size s/i);
    expect(names).not.toMatch(/core service|emergency call-out/i);
    expect(names).toMatch(/manicure|pedicure|nail|gel|acrylic/i);
  });

  it('still uses retail scaffolds for fashion', () => {
    const seed = buildSeedCatalog(
      { verticalGroup: 'fashion', verticalSlug: 'fashion.boutique', businessModel: 'retail' },
      { targetCount: 24 },
    );
    const names = seed.items.map((item) => item.name).join(' | ');
    expect(names).toMatch(/new arrival|variant a/i);
  });
});
