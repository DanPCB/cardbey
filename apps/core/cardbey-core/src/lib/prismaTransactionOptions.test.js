import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { getPrismaInteractiveTransactionOptions } from './prismaTransactionOptions.js';

describe('getPrismaInteractiveTransactionOptions', () => {
  const prevTimeout = process.env.PRISMA_TRANSACTION_TIMEOUT_MS;
  const prevMaxWait = process.env.PRISMA_TRANSACTION_MAX_WAIT_MS;

  afterEach(() => {
    if (prevTimeout === undefined) delete process.env.PRISMA_TRANSACTION_TIMEOUT_MS;
    else process.env.PRISMA_TRANSACTION_TIMEOUT_MS = prevTimeout;
    if (prevMaxWait === undefined) delete process.env.PRISMA_TRANSACTION_MAX_WAIT_MS;
    else process.env.PRISMA_TRANSACTION_MAX_WAIT_MS = prevMaxWait;
  });

  it('defaults to 60s timeout and 15s maxWait', () => {
    delete process.env.PRISMA_TRANSACTION_TIMEOUT_MS;
    delete process.env.PRISMA_TRANSACTION_MAX_WAIT_MS;
    expect(getPrismaInteractiveTransactionOptions()).toEqual({
      timeout: 60_000,
      maxWait: 15_000,
    });
  });

  it('reads overrides from env', () => {
    process.env.PRISMA_TRANSACTION_TIMEOUT_MS = '120000';
    process.env.PRISMA_TRANSACTION_MAX_WAIT_MS = '20000';
    expect(getPrismaInteractiveTransactionOptions()).toEqual({
      timeout: 120_000,
      maxWait: 20_000,
    });
  });
});
