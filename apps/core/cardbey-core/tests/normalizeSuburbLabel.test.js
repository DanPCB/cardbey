import { describe, expect, it } from 'vitest';
import { normalizeSuburbLabel } from '../src/utils/normalizeSuburbLabel.js';
import { aggregatePublicStoreSuburbs } from '../src/routes/publicUsers.js';

describe('normalizeSuburbLabel', () => {
  it('trims and title-cases suburb labels', () => {
    expect(normalizeSuburbLabel('  braybrook ')).toBe('Braybrook');
    expect(normalizeSuburbLabel('fitzroy north')).toBe('Fitzroy North');
    expect(normalizeSuburbLabel('')).toBeNull();
    expect(normalizeSuburbLabel(null)).toBeNull();
  });
});

describe('aggregatePublicStoreSuburbs', () => {
  it('merges casing variants into one suburb row', () => {
    const suburbs = aggregatePublicStoreSuburbs([
      { suburb: 'braybrook' },
      { suburb: 'Braybrook' },
      { suburb: 'Fitzroy' },
    ]);
    expect(suburbs).toEqual([
      { suburb: 'Braybrook', count: 2 },
      { suburb: 'Fitzroy', count: 1 },
    ]);
  });
});
