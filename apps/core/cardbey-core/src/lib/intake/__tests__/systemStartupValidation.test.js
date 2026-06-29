import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { validateSystemStartup } from '../systemStartupValidation.js';
import { resetDecisionLoopHealthForTests } from '../../decision/decisionLoopHealth.js';

describe('systemStartupValidation', () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    resetDecisionLoopHealthForTests();
    process.env = { ...envBackup, NODE_ENV: 'test' };
  });

  afterEach(() => {
    process.env = envBackup;
    resetDecisionLoopHealthForTests();
  });

  it('validates belief loader and decision loop probe', async () => {
    const result = await validateSystemStartup();
    expect(result.beliefLoader).toBe(true);
    expect(result.decisionLoop).toBe(true);
    expect(result.ok).toBe(true);
  });
});
