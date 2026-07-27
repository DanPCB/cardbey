/**
 * Location accuracy audit helpers.
 */

import { formatStoreLocation, hasCanonicalStoreAddress } from '../../apps/core/cardbey-core/src/lib/formatStoreLocation.js';
import {
  DEMO_FALLBACK_LOCATION_NAMES,
  LOCATION_UNAVAILABLE_LABEL,
  resolveCanonicalBusinessLocation,
} from '../../apps/core/cardbey-core/src/lib/location/resolveCanonicalBusinessLocation.ts';

export type LocationAuditRow = {
  id: string;
  name: string;
  slug: string;
  issue: string;
  region: string | null;
  suburb: string | null;
  state: string | null;
  country: string | null;
  locationLabel: string | null;
  needsRepair: boolean;
  needsLocationReview: boolean;
  suggested?: {
    suburb: string | null;
    state: string | null;
    country: string | null;
    displayLocation: string;
  };
};

function trim(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

export function auditLocationAccuracyRow(store: {
  id: string;
  name: string;
  slug: string;
  region?: string | null;
  address?: string | null;
  suburb?: string | null;
  state?: string | null;
  postcode?: string | null;
  country?: string | null;
}): LocationAuditRow {
  const locationLabel = formatStoreLocation(store);
  const hasAddress = hasCanonicalStoreAddress(store);
  const region = trim(store.region);
  const suburb = trim(store.suburb);
  const state = trim(store.state);
  const country = trim(store.country);

  let issue = 'ok';
  let needsRepair = false;
  let needsLocationReview = false;

  if (region && DEMO_FALLBACK_LOCATION_NAMES.has(region.toLowerCase()) && !hasAddress) {
    issue = 'demo_fallback_region';
    needsRepair = true;
  } else if (!hasAddress && region) {
    issue = 'region_without_address';
    needsRepair = true;
  } else if (region && locationLabel && region.toLowerCase() !== locationLabel.toLowerCase()) {
    issue = 'region_mismatch';
    needsRepair = true;
  } else if (!hasAddress && !region) {
    issue = 'missing_location';
    needsLocationReview = true;
  }

  const suggestedCanonical = resolveCanonicalBusinessLocation({
    store: {
      address: store.address ?? null,
      suburb,
      state,
      country,
      region,
    },
    address: store.address ?? null,
    suburb,
    state,
    country,
  });

  return {
    id: store.id,
    name: store.name,
    slug: store.slug,
    issue,
    region,
    suburb,
    state,
    country,
    locationLabel,
    needsRepair,
    needsLocationReview,
    suggested:
      suggestedCanonical.source !== 'unavailable'
        ? {
            suburb: suggestedCanonical.suburb,
            state: suggestedCanonical.region,
            country: suggestedCanonical.country,
            displayLocation: suggestedCanonical.displayLocation,
          }
        : undefined,
  };
}

export function formatLocationAuditReport(rows: LocationAuditRow[]): string {
  const suspicious = rows.filter((r) => r.needsRepair || r.needsLocationReview);
  const lines = [
    '# Location accuracy audit',
    '',
    `Total stores: ${rows.length}`,
    `Needs repair: ${rows.filter((r) => r.needsRepair).length}`,
    `Needs review: ${rows.filter((r) => r.needsLocationReview).length}`,
    '',
  ];
  if (suspicious.length) {
    lines.push('## Suspicious rows', '');
    for (const row of suspicious) {
      lines.push(`- **${row.name}** (\`${row.slug}\`) — ${row.issue}`);
      lines.push(
        `  region=${row.region ?? '—'} suburb=${row.suburb ?? '—'} label=${row.locationLabel ?? LOCATION_UNAVAILABLE_LABEL}`,
      );
    }
  }
  return lines.join('\n');
}
