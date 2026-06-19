import { describe, it, expect } from 'vitest';
import { parseStoreCustomerCsv, validateStoreCustomerInput } from './businessGrowthService.js';

describe('businessGrowthService', () => {
  it('validates customer name required', () => {
    const r = validateStoreCustomerInput({ name: '', email: 'a@test.com' });
    expect(r.ok).toBe(false);
  });

  it('parses store customer CSV', () => {
    const csv = 'name,email,phone\nJane Doe,jane@test.com,0400000000';
    const rows = parseStoreCustomerCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe('Jane Doe');
    expect(rows[0]?.email).toBe('jane@test.com');
  });

  it('warns when consent not granted', () => {
    const r = validateStoreCustomerInput({ name: 'Jane', email: 'jane@test.com', consentStatus: 'unknown' });
    expect(r.ok).toBe(true);
    expect(r.warnings.length).toBeGreaterThan(0);
  });
});
