import { describe, expect, it } from 'vitest';
import { validateProductClaims } from '../claimValidator.js';

describe('marketingOperator/claimValidator', () => {
  it('accepts truthful under-development pilot copy', () => {
    const result = validateProductClaims(
      'Cardbey is an AI business creation platform under development. Join our Vietnamese SME pilot.',
      'en',
    );
    expect(result.ok).toBe(true);
    expect(result.status).toBe('PASS');
    expect(result.validatorVersion).toBeTruthy();
    expect(result.findings.every((f) => f.severity && f.claim)).toBe(true);
  });

  it('blocks guaranteed results claims', () => {
    const result = validateProductClaims('Guaranteed ROI and guaranteed results for every store.', 'en');
    expect(result.ok).toBe(false);
    expect(result.status).toBe('BLOCKED');
    expect(result.findings.some((f) => f.id === 'guaranteed_results')).toBe(true);
  });

  it('blocks fabricated testimonials and live verification', () => {
    const result = validateProductClaims(
      'Customers say we are amazing. Live-verified on Facebook partner network.',
      'en',
    );
    expect(result.ok).toBe(false);
    expect(result.risk).toBe('critical');
  });

  it('blocks empty body', () => {
    const result = validateProductClaims('   ', 'en');
    expect(result.ok).toBe(false);
  });
});
