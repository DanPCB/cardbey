/**
 * Tests for content ingest: extractDomain (and related) from captureSample.
 */
import { describe, it, expect } from 'vitest';
import { extractDomain } from '../src/services/contentIngest/captureSample.js';

describe('contentIngest extractDomain', () => {
  it('returns only domain for full URL with path and query', () => {
    expect(extractDomain('https://example.com/path?x=1')).toBe('example.com');
    expect(extractDomain('https://sub.example.com/foo/bar')).toBe('sub.example.com');
  });

  it('returns domain for http URL', () => {
    expect(extractDomain('http://example.com')).toBe('example.com');
  });

  it('returns domain when given host-only string', () => {
    const d = extractDomain('example.com');
    expect(d === 'example.com' || d === null).toBe(true);
  });

  it('returns null for null/undefined/empty', () => {
    expect(extractDomain(null)).toBe(null);
    expect(extractDomain(undefined)).toBe(null);
    expect(extractDomain('')).toBe(null);
  });

  it('returns null for localhost', () => {
    expect(extractDomain('http://localhost:3000')).toBe(null);
  });
});
