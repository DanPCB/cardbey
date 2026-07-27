/**
 * Unit tests for ingestion adapters and normalizer.
 */

import { describe, it, expect } from 'vitest';
import { CsvAdapter } from '../adapters/CsvAdapter.js';
import { businessNormalizer } from '../BusinessNormalizer.js';
import { matchEntities } from '../EntityResolver.js';

describe('CsvAdapter', () => {
  it('parses inline CSV into raw business records', async () => {
    const csv = `business_name,address,phone,website,category
Acme Cafe,1 High St Melbourne,+61400111222,https://acme.example.com,cafe`;
    const adapter = new CsvAdapter({ content: csv, sourceReference: 'test-csv' });
    const records = await adapter.fetch();
    expect(records).toHaveLength(1);
    expect(records[0].businessName).toBe('Acme Cafe');
    expect(records[0].sourceType).toBe('csv');
  });
});

describe('BusinessNormalizer', () => {
  it('never fabricates unknown fields', () => {
    const normalized = businessNormalizer.normalize({
      sourceRowId: '1',
      sourceType: 'csv',
      sourceReference: 'test',
      fetchedAt: new Date().toISOString(),
      businessName: 'Test Shop',
      legalName: null,
      address: null,
      phone: null,
      website: null,
      category: null,
      registrationNumber: null,
      email: null,
      operatingRegion: null,
    });
    expect(normalized.businessName).toBe('Test Shop');
    expect(normalized.phone).toBeNull();
    expect(normalized.website).toBeNull();
    expect(normalized.address).toBeNull();
  });

  it('normalizes phone and website', () => {
    const normalized = businessNormalizer.normalize({
      sourceRowId: '1',
      sourceType: 'csv',
      sourceReference: 'test',
      fetchedAt: new Date().toISOString(),
      businessName: 'Test',
      legalName: null,
      address: '10 Main St, Melbourne, VIC, Australia',
      phone: '(04) 0011 2233',
      website: 'www.example.com/path/',
      category: 'restaurant',
      registrationNumber: 'abn-123456',
      email: 'Hello@Example.COM',
      operatingRegion: 'AU',
    });
    expect(normalized.phone).toMatch(/^\+?/);
    expect(normalized.website).toContain('example.com');
    expect(normalized.email).toBe('hello@example.com');
    expect(normalized.city).toBeTruthy();
  });
});

describe('EntityResolver matchEntities', () => {
  it('detects duplicate by phone and website', () => {
    const a = {
      id: '1',
      businessName: 'Acme Cafe',
      phone: '+61400111222',
      website: 'https://acme.example.com',
      registrationNumber: null,
      address: '1 High St',
    };
    const b = {
      id: '2',
      businessName: 'Acme Cafe Duplicate',
      phone: '+61400111222',
      website: 'https://www.acme.example.com/menu',
      registrationNumber: null,
      address: '1 High Street',
    };
    const match = matchEntities(b, a);
    expect(match.status).toBe('duplicate');
    expect(match.evidence.some((e) => e.field === 'phone')).toBe(true);
  });
});
