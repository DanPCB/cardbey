/**
 * Server-owned market registry — validation + coverage truth.
 */

import { AU_TERRITORIES, MELBOURNE_PILOT_SUBURB_TO_TERRITORY } from './australiaTerritories.js';
import {
  categoriesForCountry,
  MARKET_CATEGORIES,
  MELBOURNE_PILOT_CATEGORY_TO_CANONICAL,
} from './categories.js';
import type {
  MarketCategoryRecord,
  MarketCountryCode,
  MarketCoverageSummary,
  MarketRegistrySnapshot,
  TerritoryRecord,
} from './types.js';
import { VN_TERRITORIES } from './vietnamTerritories.js';

export const MARKET_REGISTRY_VERSION = 'multi-market-v1.1.0-phase1a';

const ALL_TERRITORIES: TerritoryRecord[] = [...AU_TERRITORIES, ...VN_TERRITORIES];

export function stripDiacritics(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

export function normalizeMatchKey(input: string): string {
  return stripDiacritics(input).trim().toLowerCase().replace(/\s+/g, ' ');
}

export function listTerritories(countryCode?: MarketCountryCode): TerritoryRecord[] {
  const rows = ALL_TERRITORIES.filter((t) => t.active);
  if (!countryCode) return rows;
  return rows.filter((t) => t.countryCode === countryCode);
}

export function getTerritoryById(id: string): TerritoryRecord | null {
  return ALL_TERRITORIES.find((t) => t.id === id && t.active) ?? null;
}

export function getCategoryById(id: string): MarketCategoryRecord | null {
  return MARKET_CATEGORIES.find((c) => c.id === id && c.active) ?? null;
}

export function listCategories(countryCode?: MarketCountryCode): MarketCategoryRecord[] {
  if (!countryCode) return MARKET_CATEGORIES.filter((c) => c.active);
  return categoriesForCountry(countryCode);
}

export function resolveTerritoryId(params: {
  countryCode: MarketCountryCode;
  territoryId?: string | null;
  locality?: string | null;
}): TerritoryRecord | null {
  if (params.territoryId) {
    const byId = getTerritoryById(params.territoryId);
    if (!byId) return null;
    if (byId.countryCode !== params.countryCode) return null;
    return byId;
  }
  if (params.locality) {
    const key = normalizeMatchKey(params.locality);
    const candidates = listTerritories(params.countryCode);
    for (const row of candidates) {
      if (normalizeMatchKey(row.name) === key) return row;
      if (row.nameEn && normalizeMatchKey(row.nameEn) === key) return row;
      if (row.aliases.some((a) => normalizeMatchKey(a) === key)) return row;
    }
    // Legacy Melbourne suburb names
    if (params.countryCode === 'AU') {
      const legacy = MELBOURNE_PILOT_SUBURB_TO_TERRITORY[params.locality];
      if (legacy) return getTerritoryById(legacy);
    }
  }
  return null;
}

export function validateTerritoryCategoryPair(params: {
  countryCode: MarketCountryCode;
  territoryId: string;
  categoryId: string;
}): { ok: true } | { ok: false; error: string } {
  const territory = getTerritoryById(params.territoryId);
  if (!territory) return { ok: false, error: 'unknown_territory' };
  if (territory.countryCode !== params.countryCode) {
    return { ok: false, error: 'cross_country_territory' };
  }
  const category = getCategoryById(params.categoryId);
  if (!category) return { ok: false, error: 'unknown_category' };
  if (!category.countryAvailability.includes(params.countryCode)) {
    return { ok: false, error: 'category_unavailable_in_country' };
  }
  return { ok: true };
}

export function buildCoverageSummary(countryCode: MarketCountryCode): MarketCoverageSummary {
  const territories = listTerritories(countryCode);
  const localities = territories.filter((t) =>
    ['suburb', 'locality', 'district', 'ward', 'postcode_cluster', 'sme_cluster'].includes(t.kind),
  );
  const priorityGroups = [...new Set(territories.map((t) => t.priorityGroup))].sort((a, b) => a - b);
  if (countryCode === 'AU') {
    return {
      countryCode,
      label: 'Australia (configured cities, regions, and locality clusters)',
      configuredTerritoryCount: territories.length,
      configuredLocalityCount: localities.length,
      priorityGroups,
      nationwideComplete: false,
      coverageNote:
        'Configured coverage includes capital cities, selected regional centres, and locality clusters — not complete nationwide provider coverage.',
    };
  }
  return {
    countryCode,
    label: 'Vietnam (configured municipalities, provincial capitals, and SME clusters)',
    configuredTerritoryCount: territories.length,
    configuredLocalityCount: localities.length,
    priorityGroups,
    nationwideComplete: false,
    coverageNote:
      'Configured coverage includes major municipalities, selected provincial capitals, and SME/export clusters — not complete nationwide provider coverage.',
  };
}

export function getMarketRegistrySnapshot(params?: {
  countryCodes?: MarketCountryCode[];
}): MarketRegistrySnapshot {
  const countries = params?.countryCodes?.length
    ? params.countryCodes
    : (['AU', 'VN'] as MarketCountryCode[]);
  return {
    version: MARKET_REGISTRY_VERSION,
    markets: countries.map(buildCoverageSummary),
    territories: countries.flatMap((c) => listTerritories(c)),
    categories: countries.flatMap((c) => listCategories(c)),
  };
}

export function childrenOf(territoryId: string): TerritoryRecord[] {
  return ALL_TERRITORIES.filter((t) => t.active && t.parentId === territoryId);
}

export {
  MELBOURNE_PILOT_CATEGORY_TO_CANONICAL,
  MELBOURNE_PILOT_SUBURB_TO_TERRITORY,
  MARKET_CATEGORIES,
};
