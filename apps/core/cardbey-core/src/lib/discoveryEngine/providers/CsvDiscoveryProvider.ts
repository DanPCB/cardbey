/**
 * CSV import discovery provider — wraps tabular parsing into BusinessCandidate[].
 */

import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { parseCsvText, rowToRawBusinessRecord } from '../../businessIngestion/adapters/parseTabularRecords.js';
import type { RawBusinessRecord } from '../../businessIngestion/types.js';
import { validateCsvCandidates, assertCsvHasValidRows } from '../normalization/csvValidation.js';
import type { BusinessCandidate, DiscoveryDiscoverParams, DiscoveryProvider } from '../types/index.js';

function rawToCandidate(raw: RawBusinessRecord, discoveredAt: string): BusinessCandidate {
  return {
    providerId: 'csv',
    externalId: raw.sourceRowId || randomUUID(),
    businessName: raw.businessName,
    category: raw.category,
    address: raw.address,
    city: typeof raw.raw?.city === 'string' ? raw.raw.city : null,
    state: typeof raw.raw?.state === 'string' ? raw.raw.state : null,
    postcode: typeof raw.raw?.postcode === 'string' ? raw.raw.postcode : null,
    country: typeof raw.raw?.country === 'string' ? raw.raw.country : null,
    latitude: typeof raw.raw?.latitude === 'number' ? raw.raw.latitude : null,
    longitude: typeof raw.raw?.longitude === 'number' ? raw.raw.longitude : null,
    phone: raw.phone,
    email: raw.email,
    website: raw.website,
    socialProfiles: [],
    sourceUrl: raw.sourceReference,
    discoveredAt,
    confidence: 0.7,
    metadata: { rawRow: raw.raw ?? {} },
  };
}

export class CsvDiscoveryProvider implements DiscoveryProvider {
  readonly providerId = 'csv' as const;

  async discover(params: DiscoveryDiscoverParams): Promise<BusinessCandidate[]> {
    const discoveredAt = new Date().toISOString();
    let text: string;

    if (params.csvContent) {
      text = params.csvContent;
    } else if (params.csvPath) {
      text = await fs.readFile(params.csvPath, 'utf8');
    } else {
      throw new Error('CSV discovery requires csvPath or csvContent');
    }

    const rows = parseCsvText(text, { hasHeader: true });
    const sourceRef = params.csvPath ?? 'inline-csv';
    const limit = params.limit ?? rows.length;

    const mapped = rows.slice(0, limit).map((row) =>
      rawToCandidate(
        rowToRawBusinessRecord(row, {
          sourceType: 'csv',
          sourceReference: sourceRef,
        }),
        discoveredAt,
      ),
    );

    const { valid, rejected } = validateCsvCandidates(mapped);
    assertCsvHasValidRows(valid.length);

    if (rejected.length) {
      console.info('[CsvDiscoveryProvider] rejected rows:', rejected.length);
    }

    return valid;
  }
}

export const csvDiscoveryProvider = new CsvDiscoveryProvider();
