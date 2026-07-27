// DANH: skill-round3-health
import { describe, it, expect } from 'vitest';
import {
  scoreStoreCompleteness,
  execute as auditCompleteness,
} from '../../lib/toolExecutors/audit_store_completeness.js';
import {
  buildHealthReport,
  execute as generateHealthReport,
} from '../../lib/toolExecutors/generate_health_report.js';

const fullBusiness = {
  name: 'Cafe',
  description: 'Great coffee',
  phone: '0400000000',
  address: '1 Main St',
  logo: '{"url":"https://x"}',
  heroImageUrl: 'https://hero.jpg',
  type: 'cafe',
  socialLinks: { instagram: 'https://ig' },
  brandTone: 'friendly',
  brandStyle: 'modern',
};

describe('store health executors', () => {
  it('audit scores complete store highly', () => {
    const audit = scoreStoreCompleteness(fullBusiness, 3);
    expect(audit.score).toBeGreaterThanOrEqual(90);
    expect(audit.criticalMissing).toHaveLength(0);
  });

  it('audit flags critical missing fields', () => {
    const audit = scoreStoreCompleteness({ name: 'X' }, 0);
    expect(audit.missing).toContain('products');
    expect(audit.criticalMissing).toContain('heroImageUrl');
    expect(audit.criticalMissing).toContain('phone');
  });

  it('audit_store_completeness fails without storeId', async () => {
    const result = await auditCompleteness({});
    expect(result.status).toBe('failed');
  });

  it('generate_health_report labels Starter for low score', () => {
    const report = buildHealthReport({ score: 20, missing: ['products', 'phone'] });
    expect(report.scoreLabel).toBe('Starter');
    expect(report.topFixes[0]?.field).toBe('products');
  });

  it('generate_health_report labels Established for high score', () => {
    const report = buildHealthReport({ score: 90, missing: [], criticalMissing: [] });
    expect(report.scoreLabel).toBe('Established');
    expect(report.celebrationNote).toBeTruthy();
  });

  it('generate_health_report executor returns ok', async () => {
    const result = await generateHealthReport({ audit: { score: 50, missing: ['logo'] } });
    expect(result.status).toBe('ok');
    expect(result.output.topFixes.length).toBeGreaterThan(0);
  });
});
