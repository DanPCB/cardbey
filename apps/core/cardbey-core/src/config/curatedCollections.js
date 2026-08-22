/**
 * Curated marketplace collections — editorial filter presets (no DB model).
 * Served via GET /api/public/stores/collections.
 */

/** @typedef {{ suburb?: string; category?: 'food' | 'products' | 'services'; tags?: string[]; publishedWithinDays?: number }} CuratedCollectionFilters */

/** @typedef {{ id: string; title: string; subtitle: string; emoji: string; filters: CuratedCollectionFilters; minStoreCount: number; active: boolean }} CuratedCollection */

/** @type {CuratedCollection[]} */
export const CURATED_COLLECTIONS = [
  {
    id: 'braybrook-food',
    title: 'Braybrook food trail',
    subtitle: 'Local favourites in Braybrook',
    emoji: '🍜',
    filters: { suburb: 'Braybrook', category: 'food' },
    minStoreCount: 3,
    active: true,
  },
  {
    id: 'fitzroy-classics',
    title: 'Fitzroy classics',
    subtitle: 'Iconic Fitzroy businesses',
    emoji: '🏙',
    filters: { suburb: 'Fitzroy' },
    minStoreCount: 3,
    active: true,
  },
  {
    id: 'carlton-coffee',
    title: 'Carlton coffee & food',
    subtitle: 'Cafés and restaurants in Carlton',
    emoji: '☕',
    filters: { suburb: 'Carlton', category: 'food' },
    minStoreCount: 3,
    active: true,
  },
  {
    id: 'new-this-month',
    title: 'New this month',
    subtitle: 'Recently activated businesses',
    emoji: '✨',
    filters: { publishedWithinDays: 30 },
    minStoreCount: 1,
    active: true,
  },
];
