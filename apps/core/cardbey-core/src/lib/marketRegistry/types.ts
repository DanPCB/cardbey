/**
 * Multi-market territory + category registry types (server-owned).
 * Coverage is only what is configured — never claim nationwide completeness.
 */

export type MarketCountryCode = 'AU' | 'VN';

export type TerritoryKind =
  | 'country'
  | 'state'
  | 'territory'
  | 'province'
  | 'municipality'
  | 'city'
  | 'region'
  | 'district'
  | 'suburb'
  | 'locality'
  | 'ward'
  | 'postcode_cluster'
  | 'sme_cluster';

export interface TerritoryRecord {
  /** Stable id e.g. au-vic-melbourne, vn-hcm */
  id: string;
  countryCode: MarketCountryCode;
  kind: TerritoryKind;
  /** Parent territory id (null for country root) */
  parentId: string | null;
  /** Canonical display name (Vietnamese diacritics preserved for VN) */
  name: string;
  /** Optional English display name */
  nameEn?: string | null;
  /** Match-only aliases (diacritic-stripped VN, EN aliases, abbreviations) */
  aliases: string[];
  /** Priority group 1 = highest (Melbourne / HCMC first) */
  priorityGroup: number;
  regionCode?: string | null;
  /** Optional bbox [minLng, minLat, maxLng, maxLat] for provider queries */
  bbox?: [number, number, number, number] | null;
  /** Default search radius meters when supported */
  defaultRadiusM?: number | null;
  active: boolean;
}

export interface MarketCategoryRecord {
  /** Canonical Cardbey category id */
  id: string;
  displayName: string;
  displayNameVi?: string | null;
  /** Countries where this category is offered for discovery */
  countryAvailability: MarketCountryCode[];
  /** Shared group bucket */
  groupId: string;
  groupLabel: string;
  /** Provider search terms by country */
  providerSearchTerms: Partial<Record<MarketCountryCode, string[]>>;
  /** OSM Overpass tag filters */
  osmTags?: string[];
  englishAliases: string[];
  vietnameseAliases: string[];
  /** Map to Cardbey store/business category keys */
  cardbeyStoreCategories: string[];
  /** Never used to infer licences/credentials */
  regulatedInferenceForbidden: true;
  active: boolean;
}

export interface MarketCoverageSummary {
  countryCode: MarketCountryCode;
  label: string;
  configuredTerritoryCount: number;
  configuredLocalityCount: number;
  priorityGroups: number[];
  nationwideComplete: false;
  coverageNote: string;
}

export interface MarketRegistrySnapshot {
  version: string;
  markets: MarketCoverageSummary[];
  territories: TerritoryRecord[];
  categories: MarketCategoryRecord[];
}
