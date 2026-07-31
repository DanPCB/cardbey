import { describe, it, expect } from 'vitest';
import { classifyGenerateDraftFailure } from '../classifyGenerateDraftFailure.js';

describe('classifyGenerateDraftFailure', () => {
  it('maps MODULE_NOT_FOUND to STORE_BUILD_RUNTIME_DEPENDENCY_MISSING with safe copy', () => {
    const err = Object.assign(new Error("Cannot find module '/app/src/lib/location/resolveCanonicalBusinessLocation.js'"), {
      code: 'ERR_MODULE_NOT_FOUND',
    });
    const c = classifyGenerateDraftFailure(err);
    expect(c.code).toBe('STORE_BUILD_RUNTIME_DEPENDENCY_MISSING');
    expect(c.message).toBe("We couldn't finish preparing your store draft.");
    expect(c.developerMessage).toMatch(/Cannot find module/);
    expect(c.message).not.toMatch(/resolveCanonical|node_modules|\.js/);
  });

  it('uses safe copy for generic generateDraft failures', () => {
    const c = classifyGenerateDraftFailure(new Error('prisma timeout'));
    expect(c.code).toBe('GENERATE_DRAFT_FAILED');
    expect(c.message).toBe("We couldn't finish preparing your store draft.");
    expect(c.developerMessage).toContain('prisma timeout');
  });
});
