import { describe, it, expect } from 'vitest';
import {
  inferEntryPointFromInsight,
  buildPayloadForEntryPoint,
  InsightInputError,
  isInsightInputErrorLike,
  kindAllowsDeviceMaintenancePlan,
} from '../insightActionBuilder.js';

describe('insightActionBuilder — device_maintenance_plan eligibility', () => {
  it('returns device_maintenance_plan for daily_device + maintenance text + deviceId', () => {
    const ep = inferEntryPointFromInsight(
      'device,uptime',
      'daily_device',
      'Schedule device maintenance',
      'Plan weekly checks.',
      { deviceId: 'dev_123' },
    );
    expect(ep).toBe('device_maintenance_plan');
  });

  it('skips device_maintenance_plan for daily_tenant even with schedule text and deviceId (wrong scope)', () => {
    const ep = inferEntryPointFromInsight(
      'campaign,schedule',
      'daily_tenant',
      'Posting schedule',
      'Review your posting schedule.',
      { deviceId: 'dev_123' },
    );
    expect(ep).not.toBe('device_maintenance_plan');
  });

  it('allows maintenance when kind is not device-scoped but tags include device:<id>', () => {
    const ep = inferEntryPointFromInsight(
      'risk,device:abc',
      'daily_tenant',
      'Maintenance window',
      'Schedule downtime.',
      { deviceId: 'abc' },
    );
    expect(ep).toBe('device_maintenance_plan');
  });

  it('returns null for maintenance wording without deviceId', () => {
    const ep = inferEntryPointFromInsight(
      'ops',
      'daily_device',
      'Maintenance needed',
      'Fix soon.',
      { deviceId: null },
    );
    expect(ep).toBeNull();
  });

  it('buildPayloadForEntryPoint throws InsightInputError when deviceId missing', () => {
    expect(() =>
      buildPayloadForEntryPoint('device_maintenance_plan', 't1', { kind: 'daily_device' }),
    ).toThrow(InsightInputError);
  });

  it('buildPayloadForEntryPoint succeeds with deviceId', () => {
    const p = buildPayloadForEntryPoint('device_maintenance_plan', 't1', {
      deviceId: 'd1',
      kind: 'daily_device',
    });
    expect(p.deviceId).toBe('d1');
  });
});

describe('isInsightInputErrorLike', () => {
  it('returns true for InsightInputError instance', () => {
    expect(isInsightInputErrorLike(new InsightInputError('x', { entryPoint: 'device_maintenance_plan' }))).toBe(
      true,
    );
  });

  it('returns true for duck-typed insight input error', () => {
    const e = new Error('deviceId is required');
    e.name = 'InsightInputError';
    e.code = 'INSIGHT_INPUT_ERROR';
    expect(isInsightInputErrorLike(e)).toBe(true);
  });

  it('returns false for generic Error', () => {
    expect(isInsightInputErrorLike(new Error('boom'))).toBe(false);
  });
});

describe('kindAllowsDeviceMaintenancePlan', () => {
  it('accepts daily_device and device_* kinds', () => {
    expect(kindAllowsDeviceMaintenancePlan('daily_device')).toBe(true);
    expect(kindAllowsDeviceMaintenancePlan('device_health')).toBe(true);
    expect(kindAllowsDeviceMaintenancePlan('daily_tenant')).toBe(false);
  });
});
