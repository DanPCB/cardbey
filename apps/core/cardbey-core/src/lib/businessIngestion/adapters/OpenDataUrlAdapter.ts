/**
 * Open Data URL adapter — fetches JSON or CSV from a public dataset URL (Phase 1).
 */

import type { BusinessFeedAdapter, RawBusinessRecord } from '../types.js';
import { jsonRecordsToRaw, parseCsvText, rowToRawBusinessRecord } from './parseTabularRecords.js';

export type OpenDataFormat = 'json' | 'csv' | 'auto';

export interface OpenDataUrlAdapterConfig {
  url: string;
  format?: OpenDataFormat;
  /** Dot-path to array in JSON payload, e.g. "results" or "data.records". */
  recordsPath?: string;
  fieldMap?: Record<string, string>;
  fetchImpl?: typeof fetch;
}

function getByPath(obj: unknown, path: string): unknown {
  if (!path) return obj;
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

function detectFormat(url: string, contentType: string | null): OpenDataFormat {
  const ct = (contentType ?? '').toLowerCase();
  if (ct.includes('json')) return 'json';
  if (ct.includes('csv') || ct.includes('text/plain')) return 'csv';
  if (url.endsWith('.json')) return 'json';
  if (url.endsWith('.csv')) return 'csv';
  return 'json';
}

export class OpenDataUrlAdapter implements BusinessFeedAdapter {
  readonly sourceType = 'open_data_url' as const;
  readonly sourceReference: string;

  private readonly fetchImpl: typeof fetch;

  constructor(private readonly config: OpenDataUrlAdapterConfig) {
    this.sourceReference = config.url;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async fetch(): Promise<RawBusinessRecord[]> {
    const res = await this.fetchImpl(this.config.url);
    if (!res.ok) {
      throw new Error(`OpenDataUrlAdapter fetch failed: ${res.status} ${res.statusText}`);
    }
    const contentType = res.headers.get('content-type');
    const format =
      this.config.format && this.config.format !== 'auto'
        ? this.config.format
        : detectFormat(this.config.url, contentType);
    const body = await res.text();

    if (format === 'csv') {
      const rows = parseCsvText(body, { hasHeader: true });
      return rows.map((row) =>
        rowToRawBusinessRecord(row, {
          sourceType: this.sourceType,
          sourceReference: this.sourceReference,
          fieldMap: this.config.fieldMap,
        }),
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      throw new Error('OpenDataUrlAdapter: response is not valid JSON');
    }

    const atPath = this.config.recordsPath ? getByPath(parsed, this.config.recordsPath) : parsed;
    const records = Array.isArray(atPath)
      ? atPath
      : Array.isArray(parsed)
        ? parsed
        : null;

    if (!records) {
      throw new Error(
        'OpenDataUrlAdapter: could not locate records array in JSON payload',
      );
    }

    return jsonRecordsToRaw(records, {
      sourceType: this.sourceType,
      sourceReference: this.sourceReference,
      fieldMap: this.config.fieldMap,
    });
  }
}
