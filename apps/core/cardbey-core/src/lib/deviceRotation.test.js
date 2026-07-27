import { describe, expect, it } from 'vitest';
import {
  normalizeRotationDegrees,
  orientationFromRotationDegrees,
  parseRotationUpdate,
  resolveDeviceRotation,
  rotationDegreesFromOrientation,
} from './deviceRotation.js';

describe('deviceRotation', () => {
  it('normalizes valid degrees', () => {
    expect(normalizeRotationDegrees(0)).toBe(0);
    expect(normalizeRotationDegrees(180)).toBe(180);
    expect(normalizeRotationDegrees('270')).toBe(270);
    expect(normalizeRotationDegrees(359)).toBe(359);
  });

  it('rejects out of range', () => {
    expect(normalizeRotationDegrees(-1)).toBeNull();
    expect(normalizeRotationDegrees(360)).toBeNull();
    expect(normalizeRotationDegrees('nope')).toBeNull();
  });

  it('maps orientation ↔ degrees', () => {
    expect(rotationDegreesFromOrientation('horizontal')).toBe(0);
    expect(rotationDegreesFromOrientation('vertical')).toBe(90);
    expect(orientationFromRotationDegrees(0)).toBe('horizontal');
    expect(orientationFromRotationDegrees(90)).toBe('vertical');
    expect(orientationFromRotationDegrees(180)).toBe('horizontal');
    expect(orientationFromRotationDegrees(270)).toBe('vertical');
  });

  it('resolve prefers rotationDegrees', () => {
    expect(
      resolveDeviceRotation({ rotationDegrees: 180, orientation: 'vertical' }),
    ).toEqual({ rotationDegrees: 180, orientation: 'horizontal' });
  });

  it('resolve falls back to orientation', () => {
    expect(resolveDeviceRotation({ orientation: 'vertical' })).toEqual({
      rotationDegrees: 90,
      orientation: 'vertical',
    });
  });

  it('parseRotationUpdate: degrees wins', () => {
    expect(
      parseRotationUpdate({ rotationDegrees: 270, orientation: 'horizontal' }),
    ).toEqual({ ok: true, rotationDegrees: 270, orientation: 'vertical' });
  });

  it('parseRotationUpdate: legacy orientation', () => {
    expect(parseRotationUpdate({ orientation: 'vertical' })).toEqual({
      ok: true,
      rotationDegrees: 90,
      orientation: 'vertical',
    });
  });
});
