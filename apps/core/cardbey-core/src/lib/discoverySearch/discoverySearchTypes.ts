/** Unified marketplace discovery search — canonical entity types. */

export const DISCOVERY_ENTITY_TYPES = [
  'store',
  'product',
  'service',
  'menu',
  'offer',
] as const;

export type DiscoveryEntityType = (typeof DISCOVERY_ENTITY_TYPES)[number];

export type DiscoverySearchInput = {
  query: string;
  entityTypes?: DiscoveryEntityType[];
  location?: string;
  category?: string;
  page?: number;
  limit?: number;
  lat?: number | null;
  lng?: number | null;
  suggest?: boolean;
};

export type DiscoverySearchResult = {
  id: string;
  entityType: DiscoveryEntityType;
  title: string;
  subtitle?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  href: string;
  storeSlug?: string | null;
  storeName?: string | null;
  category?: string | null;
  locationLabel?: string | null;
  score: number;
};

export type DiscoverySearchResponse = {
  query: string;
  results: DiscoverySearchResult[];
  suggestions: DiscoverySearchResult[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
};
