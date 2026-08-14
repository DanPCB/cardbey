/**
 * Hard budget for multi-source enrichment — fetch / Claude / wall-clock.
 * Caps are enforced, not documented-only.
 */

import {
  MAX_CLAUDE_CALLS_PER_RECORD,
  MAX_WALL_CLOCK_MS_PER_RECORD,
  MAX_WEB_FETCHES_PER_RECORD,
} from './constants.js';

export class EnrichmentBudgetExhaustedError extends Error {
  readonly code: 'FETCH_CAP' | 'CLAUDE_CAP' | 'TIMEOUT';

  constructor(code: 'FETCH_CAP' | 'CLAUDE_CAP' | 'TIMEOUT', message: string) {
    super(message);
    this.name = 'EnrichmentBudgetExhaustedError';
    this.code = code;
  }
}

export class EnrichmentBudget {
  readonly startedAtMs: number;
  websiteFetches = 0;
  claudeCalls = 0;
  private readonly deadlineMs: number;

  constructor(
    readonly maxFetches = MAX_WEB_FETCHES_PER_RECORD,
    readonly maxClaude = MAX_CLAUDE_CALLS_PER_RECORD,
    readonly maxWallClockMs = MAX_WALL_CLOCK_MS_PER_RECORD,
  ) {
    this.startedAtMs = Date.now();
    this.deadlineMs = this.startedAtMs + maxWallClockMs;
  }

  elapsedMs(): number {
    return Date.now() - this.startedAtMs;
  }

  remainingMs(): number {
    return Math.max(0, this.deadlineMs - Date.now());
  }

  assertWithinBudget(): void {
    if (Date.now() >= this.deadlineMs) {
      throw new EnrichmentBudgetExhaustedError(
        'TIMEOUT',
        `Wall-clock limit ${this.maxWallClockMs}ms exceeded`,
      );
    }
    if (this.websiteFetches > this.maxFetches) {
      throw new EnrichmentBudgetExhaustedError(
        'FETCH_CAP',
        `Fetch cap ${this.maxFetches} exceeded`,
      );
    }
    if (this.claudeCalls > this.maxClaude) {
      throw new EnrichmentBudgetExhaustedError(
        'CLAUDE_CAP',
        `Claude call cap ${this.maxClaude} exceeded`,
      );
    }
  }

  /** Reserve one web fetch slot before performing the fetch. */
  consumeFetch(): void {
    this.assertWithinBudget();
    if (this.websiteFetches >= this.maxFetches) {
      throw new EnrichmentBudgetExhaustedError(
        'FETCH_CAP',
        `Fetch cap ${this.maxFetches} reached`,
      );
    }
    this.websiteFetches += 1;
  }

  /** Reserve one Claude synthesis slot before calling the model. */
  consumeClaude(): void {
    this.assertWithinBudget();
    if (this.claudeCalls >= this.maxClaude) {
      throw new EnrichmentBudgetExhaustedError(
        'CLAUDE_CAP',
        `Claude call cap ${this.maxClaude} reached`,
      );
    }
    this.claudeCalls += 1;
  }

  /**
   * Run async work under wall-clock deadline.
   * Rejects with TIMEOUT if the work exceeds remaining budget.
   */
  async runWithDeadline<T>(work: () => Promise<T>): Promise<T> {
    this.assertWithinBudget();
    const remaining = this.remainingMs();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        work(),
        new Promise<T>((_, reject) => {
          timer = setTimeout(() => {
            reject(
              new EnrichmentBudgetExhaustedError(
                'TIMEOUT',
                `Wall-clock limit ${this.maxWallClockMs}ms exceeded`,
              ),
            );
          }, remaining);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
