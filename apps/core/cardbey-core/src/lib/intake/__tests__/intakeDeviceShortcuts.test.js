import { describe, it, expect } from 'vitest';
import { detectDeviceIntent } from '../intakeSystemShortcuts.js';
import { validateIntakeClassification } from '../intakeContractValidate.js';

describe('detectDeviceIntent', () => {
  it('matches desktop control phrases', () => {
    const hit = detectDeviceIntent('use device control to open Notepad');
    expect(hit?.tool).toBe('device.sendInput');
    expect(hit?.params.task).toMatch(/open Notepad/i);
    expect(hit?.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('matches open notepad on computer', () => {
    expect(detectDeviceIntent('open notepad on my computer')?.tool).toBe('device.sendInput');
  });

  it('does not hijack signage device listing', () => {
    expect(detectDeviceIntent('list my devices')).toBeNull();
    expect(detectDeviceIntent('show my screens')).toBeNull();
  });

  it('returns null for empty message', () => {
    expect(detectDeviceIntent('')).toBeNull();
  });
});

describe('device.sendInput confirm validation', () => {
  it('passes revalidation when runtime injects storeId (active store context)', () => {
    const v = validateIntakeClassification(
      {
        executionPath: 'proactive_plan',
        tool: 'device.sendInput',
        parameters: { task: 'open Notepad and type hello', storeId: 'store-abc' },
      },
      'store-abc',
    );
    expect(v.ok).toBe(true);
    expect(v.cleanedParameters?.task).toMatch(/Notepad/i);
    expect(v.cleanedParameters?.storeId).toBeUndefined();
  });
});
