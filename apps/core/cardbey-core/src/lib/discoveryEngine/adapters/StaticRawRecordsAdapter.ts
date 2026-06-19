import type { BusinessFeedAdapter, IngestionSourceType, RawBusinessRecord } from '../../businessIngestion/types.js';

/** Adapter that returns pre-built raw records (Discovery Engine → Ingestion bridge). */
export class StaticRawRecordsAdapter implements BusinessFeedAdapter {
  readonly sourceType: IngestionSourceType;
  readonly sourceReference: string;

  constructor(
    private readonly records: RawBusinessRecord[],
    sourceType: IngestionSourceType,
    sourceReference: string,
  ) {
    this.sourceType = sourceType;
    this.sourceReference = sourceReference;
  }

  async fetch(): Promise<RawBusinessRecord[]> {
    return this.records;
  }
}
