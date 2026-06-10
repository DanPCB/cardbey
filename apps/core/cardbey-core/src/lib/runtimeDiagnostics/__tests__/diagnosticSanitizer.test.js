import { describe, it, expect } from 'vitest';
import { sanitizeDiagnosticPayload, sanitizeUrl } from '../diagnosticSanitizer.js';

describe('diagnosticSanitizer', () => {
  it('redacts secrets and strips signed query params', () => {
    const sanitized = sanitizeDiagnosticPayload(
      {
        source: 'frontend',
        severity: 'error',
        category: 'network',
        eventName: 'api_error',
        message: 'Bearer eyJhbGciOiJIUzI1NiJ9.abc.def failed',
        route: '/app',
        evidence: {
          authorization: 'Bearer secret-token',
          publicUrl: 'https://media.cardbey.com/x.mp4?X-Amz-Signature=abc&X-Amz-Credential=def&v=1',
        },
        deployment: {},
        browser: {},
        breadcrumbs: [],
        rawError: {},
      },
      { authenticated: false },
    );

    expect(JSON.stringify(sanitized)).not.toContain('secret-token');
    expect(JSON.stringify(sanitized)).not.toContain('X-Amz-Signature');
    expect(sanitizeUrl('https://media.cardbey.com/x.mp4?X-Amz-Signature=abc&v=2')).toBe(
      'https://media.cardbey.com/x.mp4?v=2',
    );
  });
});
