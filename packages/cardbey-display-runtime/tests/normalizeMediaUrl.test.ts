import { describe, expect, it } from 'vitest';
import { normalizeMediaUrl } from '../src/media/normalizeMediaUrl.js';

describe('normalizeMediaUrl', () => {
  it('keeps absolute https', () => {
    expect(
      normalizeMediaUrl('https://cdn.example.com/a.jpg', {
        apiBaseUrl: 'https://api.example.com',
      }),
    ).toBe('https://cdn.example.com/a.jpg');
  });

  it('resolves relative paths', () => {
    expect(
      normalizeMediaUrl('/uploads/a.jpg', { apiBaseUrl: 'https://api.example.com' }),
    ).toBe('https://api.example.com/uploads/a.jpg');
  });

  it('preserves signed query strings', () => {
    const url = normalizeMediaUrl('https://cdn.example.com/v.mp4?X-Amz-Signature=abc&x=1', {
      apiBaseUrl: 'https://api.example.com',
    });
    expect(url).toContain('X-Amz-Signature=abc');
  });

  it('rejects javascript/data/file', () => {
    expect(() =>
      normalizeMediaUrl('javascript:alert(1)', { apiBaseUrl: 'https://api.example.com' }),
    ).toThrow();
    expect(() =>
      normalizeMediaUrl('data:text/plain,hi', { apiBaseUrl: 'https://api.example.com' }),
    ).toThrow();
    expect(() =>
      normalizeMediaUrl('file:///tmp/x', { apiBaseUrl: 'https://api.example.com' }),
    ).toThrow();
  });

  it('allows local http when configured', () => {
    expect(
      normalizeMediaUrl('http://192.168.1.10:3001/uploads/a.jpg', {
        apiBaseUrl: 'http://192.168.1.10:3001',
        allowInsecureLocalHttp: true,
      }),
    ).toContain('192.168.1.10');
  });

  it('rejects production http', () => {
    expect(() =>
      normalizeMediaUrl('http://cdn.example.com/a.jpg', {
        apiBaseUrl: 'https://api.example.com',
        allowInsecureLocalHttp: false,
      }),
    ).toThrow(/HTTP/i);
  });
});
