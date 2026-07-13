/**
 * Per-file change record for a development patch.
 */

import type { DevelopmentChangeType } from './DevelopmentDesign.js';

export interface DevelopmentFileChange {
  id: string;
  patchId: string;
  path: string;
  changeType: DevelopmentChangeType;
  additions: number;
  deletions: number;
  beforeHash?: string;
  afterHash?: string;
}
