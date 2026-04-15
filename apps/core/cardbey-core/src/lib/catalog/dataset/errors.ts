/**
 * Dataset selector errors. Thrown by selectDataset when selection fails.
 */

export class NoStarterPackFoundError extends Error {
  constructor(
    message: string,
    public readonly businessType: string,
    public readonly region: string
  ) {
    super(message);
    this.name = 'NoStarterPackFoundError';
  }
}

export class DatasetSelectorConfigError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message);
    this.name = 'DatasetSelectorConfigError';
  }
}
