// DANH: skill-runtime-phase7
/**
 * Phase 7 tests — classifier gap fixes: query priority, tool registry, ontology.
 */

import { describe, it, expect } from 'vitest';
import { buildSkillContext } from '../skillContextBuilder.js';
import { getToolEntry, isRegisteredTool } from '../../intake/intakeToolRegistry.js';
import { INTENT_SUBTYPES, inferFamilyFromTool } from '../../intake/intakeIntentOntology.js';

const prismaStub = {
  business: { findUnique: async () => null },
};

describe('buildSkillContext — query priority (phase 7)', () => {
  it('userMessage wins when both userMessage and intentLabel are present', async () => {
    const ctx = await buildSkillContext(
      {
        userMessage: 'How is my store performing?',
        intentLabel: 'get_store_analytics',
      },
      prismaStub
    );
    expect(ctx.query).toBe('How is my store performing?');
  });

  it('falls back to intentLabel when userMessage is absent', async () => {
    const ctx = await buildSkillContext({ intentLabel: 'orders_report' }, prismaStub);
    expect(ctx.query).toBe('orders_report');
  });

  it('uses userMessage when intentLabel is absent', async () => {
    const ctx = await buildSkillContext(
      { userMessage: 'Show store stats for last month' },
      prismaStub
    );
    expect(ctx.query).toBe('Show store stats for last month');
  });
});

describe('intake tool registry — get_store_analytics', () => {
  it('is registered with proactive_plan execution path', () => {
    expect(isRegisteredTool('get_store_analytics')).toBe(true);
    const entry = getToolEntry('get_store_analytics');
    expect(entry).not.toBeNull();
    expect(entry?.executionPath).toBe('proactive_plan');
    expect(entry?.requiresStore).toBe(true);
    expect(entry?.riskLevel).toBe('safe_read');
  });

  it('maps to analytics_reporting family via inferFamilyFromTool', () => {
    expect(inferFamilyFromTool('get_store_analytics')).toBe('analytics_reporting');
  });
});

describe('intake ontology — store_performance_report', () => {
  const perfSubtype = INTENT_SUBTYPES.find((s) => s.subtype === 'store_performance_report');

  it('includes store_performance_report under analytics_reporting', () => {
    expect(perfSubtype).toBeDefined();
    expect(perfSubtype?.family).toBe('analytics_reporting');
  });

  it('lists get_store_analytics as a candidate tool', () => {
    expect(perfSubtype?.candidateTools).toContain('get_store_analytics');
    expect(perfSubtype?.defaultTool).toBe('get_store_analytics');
  });

  it('includes how-is-my-store performance patterns', () => {
    const patterns = perfSubtype?.matchPatterns ?? [];
    const howIs = patterns.some((re) => re.test('how is my store performing'));
    const storePerform = patterns.some((re) => re.test('store performance overview'));
    const storeStats = patterns.some((re) => re.test('store stats for last month'));
    const healthReport = patterns.some((re) => re.test('store health report summary'));
    expect(howIs).toBe(true);
    expect(storePerform).toBe(true);
    expect(storeStats).toBe(true);
    expect(healthReport).toBe(true);
  });
});
