import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildPublicUrl, resolvePublicUrl, normalizePublicOrigin, joinMediaUrl } from '../src/utils/publicUrl.js';

describe('publicUrl utilities', () => {
  const originalEnv = process.env.PUBLIC_BASE_URL;

  afterEach(() => {
    // Restore original environment
    if (originalEnv) {
      process.env.PUBLIC_BASE_URL = originalEnv;
    } else {
      delete process.env.PUBLIC_BASE_URL;
    }
  });

  describe('buildPublicUrl', () => {
    it('should use PUBLIC_BASE_URL when set', () => {
      process.env.PUBLIC_BASE_URL = 'https://example.com';
      const result = buildPublicUrl('/uploads/x.mp4');
      expect(result).toBe('https://example.com/uploads/x.mp4');
    });

    it('should handle PUBLIC_BASE_URL with trailing slash', () => {
      process.env.PUBLIC_BASE_URL = 'https://example.com/';
      const result = buildPublicUrl('/uploads/x.mp4');
      expect(result).toBe('https://example.com/uploads/x.mp4');
    });

    it('should normalize path without leading slash', () => {
      process.env.PUBLIC_BASE_URL = 'https://example.com';
      const result = buildPublicUrl('uploads/x.mp4');
      expect(result).toBe('https://example.com/uploads/x.mp4');
    });

    it('should fall back to request protocol and host when PUBLIC_BASE_URL not set', () => {
      delete process.env.PUBLIC_BASE_URL;
      const mockReq = {
        protocol: 'http',
        get: (key) => {
          if (key === 'host') return 'localhost:3001';
          return null;
        },
        headers: { host: 'localhost:3001' },
      };
      const result = buildPublicUrl('/uploads/x.mp4', mockReq);
      expect(result).toBe('http://localhost:3001/uploads/x.mp4');
    });

    it('should handle HTTPS protocol in request fallback', () => {
      delete process.env.PUBLIC_BASE_URL;
      const mockReq = {
        protocol: 'https',
        get: (key) => {
          if (key === 'host') return 'cardbey-core.onrender.com';
          return null;
        },
        headers: { host: 'cardbey-core.onrender.com' },
      };
      const result = buildPublicUrl('/uploads/video.mp4', mockReq);
      expect(result).toBe('https://cardbey-core.onrender.com/uploads/video.mp4');
    });
  });

  describe('resolvePublicUrl', () => {
    it('should return absolute URLs as-is', () => {
      process.env.PUBLIC_BASE_URL = 'https://example.com';
      const result = resolvePublicUrl('https://external.com/image.jpg');
      expect(result).toBe('https://external.com/image.jpg');
    });

    it('should convert relative URLs using PUBLIC_BASE_URL', () => {
      process.env.PUBLIC_BASE_URL = 'https://example.com';
      const result = resolvePublicUrl('/uploads/file.mp4');
      expect(result).toBe('https://example.com/uploads/file.mp4');
    });

    it('should convert relative URLs without leading slash', () => {
      process.env.PUBLIC_BASE_URL = 'https://example.com';
      const result = resolvePublicUrl('uploads/file.mp4');
      expect(result).toBe('https://example.com/uploads/file.mp4');
    });

    it('should handle empty or null URLs', () => {
      expect(resolvePublicUrl('')).toBe('');
      expect(resolvePublicUrl(null)).toBe(null);
      expect(resolvePublicUrl(undefined)).toBe(undefined);
    });

    it('should fall back to request when PUBLIC_BASE_URL not set', () => {
      delete process.env.PUBLIC_BASE_URL;
      const mockReq = {
        protocol: 'http',
        get: (key) => {
          if (key === 'host') return 'localhost:3001';
          return null;
        },
        headers: { host: 'localhost:3001' },
      };
      const result = resolvePublicUrl('/uploads/x.mp4', mockReq);
      expect(result).toBe('http://localhost:3001/uploads/x.mp4');
    });

    it('should convert HTTP URLs to HTTPS when PUBLIC_BASE_URL is set and URL matches domain', () => {
      process.env.PUBLIC_BASE_URL = 'https://cardbey-core.onrender.com';
      const result = resolvePublicUrl('http://cardbey-core.onrender.com/uploads/video.mp4');
      expect(result).toBe('https://cardbey-core.onrender.com/uploads/video.mp4');
    });

    it('should normalize HTTPS URLs to use PUBLIC_BASE_URL when domain matches', () => {
      process.env.PUBLIC_BASE_URL = 'https://cardbey-core.onrender.com';
      const result = resolvePublicUrl('https://cardbey-core.onrender.com/uploads/video.mp4');
      expect(result).toBe('https://cardbey-core.onrender.com/uploads/video.mp4');
    });

    it('should not modify external HTTP URLs', () => {
      process.env.PUBLIC_BASE_URL = 'https://cardbey-core.onrender.com';
      const result = resolvePublicUrl('http://example.com/image.jpg');
      expect(result).toBe('http://example.com/image.jpg');
    });
  });

  describe('normalizePublicOrigin (malformed LAN host + port)', () => {
    it('repairs missing colon between last IPv4 octet and port (3001)', () => {
      expect(normalizePublicOrigin('http://192.168.1.13001/uploads/media/x.mp4')).toBe(
        'http://192.168.1.1:3001/uploads/media/x.mp4',
      );
    });

    it('repairs missing colon for port 13001', () => {
      expect(normalizePublicOrigin('http://192.168.1.113001/uploads/media/x.mp4')).toBe(
        'http://192.168.1.1:13001/uploads/media/x.mp4',
      );
    });

    it('leaves valid URLs unchanged', () => {
      expect(normalizePublicOrigin('http://192.168.1.1:3001/uploads/a.mp4')).toBe('http://192.168.1.1:3001/uploads/a.mp4');
    });
  });

  describe('joinMediaUrl', () => {
    it('joins base and path without double slashes', () => {
      expect(joinMediaUrl('http://192.168.1.1:3001', '/uploads/media/a.mp4')).toBe(
        'http://192.168.1.1:3001/uploads/media/a.mp4',
      );
    });
  });
});

