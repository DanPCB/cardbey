import { describe, expect, it } from 'vitest';
import { formatDocumentNumber } from '../numbering.js';
import { isValidAbnFormat, isValidBsbFormat } from '../validate.js';

describe('accountingDocuments numbering + validate', () => {
  it('formats Q and INV sequences', () => {
    expect(formatDocumentNumber('QUOTE', 1)).toBe('Q-000001');
    expect(formatDocumentNumber('INVOICE', 89)).toBe('INV-000089');
  });

  it('validates BSB and known-good ABN checksum shape', () => {
    expect(isValidBsbFormat('063-000')).toBe(true);
    expect(isValidBsbFormat('063000')).toBe(true);
    expect(isValidBsbFormat('123')).toBe(false);
    // 51824753556 is a commonly cited valid ABN checksum example
    expect(isValidAbnFormat('51 824 753 556')).toBe(true);
  });
});
