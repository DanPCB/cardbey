/**
 * Google Sheets adapter — fetches the public CSV export URL (Phase 1).
 *
 * Does not use the Google API; relies on published sheet export links.
 */

import type { BusinessFeedAdapter, RawBusinessRecord } from '../types.js';
import { parseCsvText, rowToRawBusinessRecord } from './parseTabularRecords.js';

export interface GoogleSheetAdapterConfig {
  spreadsheetId: string;
  gid?: string;
  fieldMap?: Record<string, string>;
  fetchImpl?: typeof fetch;
}

export class GoogleSheetAdapter implements BusinessFeedAdapter {
  readonly sourceType = 'google_sheet' as const;
  readonly sourceReference: string;

  private readonly exportUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly config: GoogleSheetAdapterConfig) {
    const gid = config.gid ?? '0';
    this.sourceReference = `google-sheet:${config.spreadsheetId}:${gid}`;
    this.exportUrl = `https://docs.google.com/spreadsheets/d/${config.spreadsheetId}/export?format=csv&gid=${gid}`;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async fetch(): Promise<RawBusinessRecord[]> {
    const res = await this.fetchImpl(this.exportUrl);
    if (!res.ok) {
      throw new Error(`GoogleSheetAdapter fetch failed: ${res.status} ${res.statusText}`);
    }
    const text = await res.text();
    const rows = parseCsvText(text, { hasHeader: true });
    return rows.map((row) =>
      rowToRawBusinessRecord(row, {
        sourceType: this.sourceType,
        sourceReference: this.sourceReference,
        fieldMap: this.config.fieldMap,
      }),
    );
  }
}
