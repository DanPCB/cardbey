import { describe, expect, it } from 'vitest';
import { classifyOpenMediaLicense } from '../openMediaRights.js';

describe('classifyOpenMediaLicense', () => {
  it('clears CC0 / by / by-sa', () => {
    expect(classifyOpenMediaLicense('cc0').reusable).toBe(true);
    expect(classifyOpenMediaLicense('by').reusable).toBe(true);
    expect(classifyOpenMediaLicense('by-sa 4.0').reusable).toBe(true);
    expect(classifyOpenMediaLicense('Pexels License').reusable).toBe(true);
  });

  it('fails closed on NC/ND and unknown', () => {
    expect(classifyOpenMediaLicense('by-nc').reusable).toBe(false);
    expect(classifyOpenMediaLicense('by-nd').rightsStatus).toBe('RESTRICTED');
    expect(classifyOpenMediaLicense('').rightsStatus).toBe('UNKNOWN');
    expect(classifyOpenMediaLicense('mystery-licence').reusable).toBe(false);
  });
});
