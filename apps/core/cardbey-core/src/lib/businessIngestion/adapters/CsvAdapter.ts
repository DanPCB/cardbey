/**
 * CSV file / content adapter (Phase 1).
 */

import { promises as fs } from 'node:fs';
import type { BusinessFeedAdapter, RawBusinessRecord } from '../types.js';
import { parseCsvText, rowToRawBusinessRecord } from './parseTabularRecords.js';

export interface CsvAdapterConfig {
  /** Inline CSV content (mutually exclusive with filePath). */
  content?: string;
  /** Path to a CSV file on disk. */
  filePath?: string;
  delimiter?: string;
  hasHeader?: boolean;
  fieldMap?: Record<string, string>;
  sourceReference?: string;
}

export class CsvAdapter implements BusinessFeedAdapter {
  readonly sourceType = 'csv' as const;
  readonly sourceReference: string;

  constructor(private readonly config: CsvAdapterConfig) {
    this.sourceReference = config.sourceReference ?? config.filePath ?? 'inline-csv';
    if (!config.content && !config.filePath) {
      throw new Error('CsvAdapter requires content or filePath');
    }
  }

  async fetch(): Promise<RawBusinessRecord[]> {
    const text =
      this.config.content ??
      (await fs.readFile(this.config.filePath!, 'utf8'));
    const rows = parseCsvText(text, {
      delimiter: this.config.delimiter,
      hasHeader: this.config.hasHeader,
    });
    return rows.map((row) =>
      rowToRawBusinessRecord(row, {
        sourceType: this.sourceType,
        sourceReference: this.sourceReference,
        fieldMap: this.config.fieldMap,
      }),
    );
  }
}
