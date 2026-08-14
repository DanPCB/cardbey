/**
 * Truthful per-source status taxonomy for multi-source enrichment.
 */

export type SourceAdapterStatus =
  | 'SUCCESS'
  | 'PARTIAL'
  | 'NOT_FOUND'
  | 'NOT_CONFIGURED'
  | 'ACCESS_DENIED'
  | 'RATE_LIMITED'
  | 'ROBOTS_BLOCKED'
  | 'PROVIDER_BLOCKED'
  | 'CONFIG_ERROR'
  | 'TIMEOUT'
  | 'UNSUPPORTED'
  | 'IDENTITY_MISMATCH'
  | 'SKIPPED';

export type SourceAdapterResult<T = unknown> = {
  adapter: string;
  status: SourceAdapterStatus;
  identity?: string;
  fields: string[];
  data: T | null;
  message?: string;
  sourceUrl?: string | null;
};

export function successResult<T>(
  adapter: string,
  fields: string[],
  data: T,
  extra?: Partial<SourceAdapterResult<T>>,
): SourceAdapterResult<T> {
  return {
    adapter,
    status: fields.length ? 'SUCCESS' : 'PARTIAL',
    fields,
    data,
    ...extra,
  };
}

export function statusResult(
  adapter: string,
  status: SourceAdapterStatus,
  message: string,
  extra?: Partial<SourceAdapterResult>,
): SourceAdapterResult {
  return {
    adapter,
    status,
    fields: [],
    data: null,
    message,
    ...extra,
  };
}
