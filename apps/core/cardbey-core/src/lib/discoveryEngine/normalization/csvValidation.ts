/**
 * CSV row validation for Discovery Engine imports.
 */

import type { BusinessCandidate } from '../types/index.js';

export interface CsvValidationResult {
  valid: BusinessCandidate[];
  rejected: Array<{ rowIndex: number; reason: string }>;
}

function hasMinimumIdentity(row: {
  businessName: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
}): boolean {
  if (row.businessName?.trim()) return true;
  if (row.phone?.trim()) return true;
  if (row.email?.trim()) return true;
  if (row.website?.trim()) return true;
  if (row.address?.trim()) return true;
  return false;
}

export function validateCsvCandidates(
  candidates: BusinessCandidate[],
): CsvValidationResult {
  const valid: BusinessCandidate[] = [];
  const rejected: Array<{ rowIndex: number; reason: string }> = [];

  candidates.forEach((candidate, rowIndex) => {
    if (!hasMinimumIdentity(candidate)) {
      rejected.push({
        rowIndex,
        reason: 'Row missing businessName and all contact/address fields',
      });
      return;
    }
    valid.push(candidate);
  });

  return { valid, rejected };
}

export function assertCsvHasValidRows(validCount: number): void {
  if (validCount < 1) {
    throw new Error('CSV import rejected: no valid rows (each row needs businessName or contact/address)');
  }
}
