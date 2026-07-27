import { describe, it, expect, beforeEach } from 'vitest';
import { CircuitBreaker } from '../circuitBreaker.js';

describe('CircuitBreaker', () => {
  let breaker;

  beforeEach(() => {
    breaker = new CircuitBreaker();
    breaker.defaults.threshold = 3;
    breaker.defaults.halfOpenTimeout = 50;
  });

  it('executes successfully when closed', async () => {
    const result = await breaker.execute('test', async () => 'ok');
    expect(result).toBe('ok');
    expect(breaker.getStatus('test')?.state).toBe('closed');
  });

  it('opens after threshold failures', async () => {
    breaker.defaults.threshold = 3;
    const failing = () => breaker.execute('skill_execution', async () => {
      throw new Error('boom');
    });

    await expect(failing()).rejects.toThrow('boom');
    await expect(failing()).rejects.toThrow('boom');
    await expect(failing()).rejects.toThrow('boom');

    expect(breaker.getStatus('skill_execution')?.state).toBe('open');
    await expect(failing()).rejects.toThrow('Circuit skill_execution is open');
  });

  it('resets on success after half-open', async () => {
    breaker.defaults.threshold = 3;
    for (let i = 0; i < 3; i += 1) {
      await breaker.execute('recover', async () => {
        throw new Error('fail');
      }).catch(() => {});
    }

    await new Promise((r) => setTimeout(r, 60));

    const result = await breaker.execute('recover', async () => 'recovered');
    expect(result).toBe('recovered');
    expect(breaker.getStatus('recover')?.state).toBe('closed');
  });

  it('supports manual open()', () => {
    breaker.open('api_latency', 'test breach');
    expect(breaker.getStatus('api_latency')?.state).toBe('open');
  });
});
