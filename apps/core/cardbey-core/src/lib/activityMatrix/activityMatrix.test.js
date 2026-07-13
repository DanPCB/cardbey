import { describe, it, expect } from 'vitest';
import {
  generateIntervals,
  validateDateRange,
  intervalKeyForTimestamp,
  MAX_RANGE_DAYS,
  PLATFORM_MAX_RANGE_DAYS,
} from './activityMatrixIntervals.js';
import {
  classifyUser,
  computeLongestStreak,
  median,
  detectSlipping,
  CLASSIFICATION_CONFIG,
} from './activityMatrixClassifier.js';
import { generateMatrixInsights } from './activityMatrixInsights.js';
import { getEventDefinition, resolveEventSources, listEventDefinitions } from './activityMatrixEventRegistry.js';

describe('activityMatrixIntervals', () => {
  it('generates day intervals', () => {
    const from = new Date('2026-06-01T00:00:00.000Z');
    const to = new Date('2026-06-03T23:59:59.999Z');
    const intervals = generateIntervals(from, to, 'day', 'UTC');
    expect(intervals.length).toBeGreaterThanOrEqual(3);
    expect(intervals[0].key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('enforces maximum range for hour granularity', () => {
    const from = new Date('2026-01-01T00:00:00.000Z');
    const to = new Date('2026-02-01T00:00:00.000Z');
    const result = validateDateRange(from, to, 'hour', 'UTC');
    expect(result.ok).toBe(false);
    expect(result.error).toContain(String(MAX_RANGE_DAYS.hour));
  });

  it('assigns timestamps to day interval keys', () => {
    const from = new Date('2026-07-01T00:00:00.000Z');
    const to = new Date('2026-07-05T23:59:59.999Z');
    const intervals = generateIntervals(from, to, 'day', 'UTC');
    const key = intervalKeyForTimestamp('2026-07-03T15:30:00.000Z', intervals, 'day', 'UTC');
    expect(key).toBe('2026-07-03');
  });

  it('rejects invalid timezone', () => {
    const from = new Date('2026-06-01T00:00:00.000Z');
    const to = new Date('2026-06-07T00:00:00.000Z');
    const result = validateDateRange(from, to, 'day', 'Not/A_Timezone');
    expect(result.ok).toBe(false);
  });
});

describe('activityMatrixClassifier', () => {
  const intervals = [
    { key: 'd1', label: 'D1', start: '2026-06-01T00:00:00.000Z', end: '2026-06-01T23:59:59.999Z' },
    { key: 'd2', label: 'D2', start: '2026-06-02T00:00:00.000Z', end: '2026-06-02T23:59:59.999Z' },
    { key: 'd3', label: 'D3', start: '2026-06-03T00:00:00.000Z', end: '2026-06-03T23:59:59.999Z' },
    { key: 'd4', label: 'D4', start: '2026-06-04T00:00:00.000Z', end: '2026-06-04T23:59:59.999Z' },
  ];

  it('computes longest streak', () => {
    const keys = new Set(['d1', 'd2', 'd4']);
    expect(computeLongestStreak(keys, intervals)).toBe(2);
  });

  it('classifies one-time user', () => {
    const summary = {
      activeIntervals: 1,
      totalEvents: 1,
      longestStreak: 1,
      firstEventInRange: true,
      hadPriorActivity: false,
      inactivityDays: 1,
    };
    const c = classifyUser(summary, intervals, new Set(['d1']), {
      eventLabel: 'Store viewed',
      rankPercentile: 0.1,
      isPowerUserCandidate: false,
    });
    expect(c.key).toBe('one_time');
  });

  it('computes median active intervals', () => {
    expect(median([1, 3, 5])).toBe(3);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it('detects slipping behaviour', () => {
    const longIntervals = Array.from({ length: 9 }, (_, i) => ({
      key: `d${i}`,
      label: `D${i}`,
      start: '',
      end: '',
    }));
    const active = new Set(['d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd9']);
    expect(detectSlipping(active, longIntervals)).toBe(true);
  });
});

describe('activityMatrixInsights', () => {
  it('returns empty for insufficient data', () => {
    expect(generateMatrixInsights([], { totalEvents: 0 }, [], 'Store viewed')).toEqual([]);
  });

  it('generates concentration insight', () => {
    const users = Array.from({ length: 10 }, (_, i) => ({
      userId: `u${i}`,
      summary: { activeIntervals: i + 1, totalEvents: i === 9 ? 50 : 1, longestStreak: 1 },
      cells: [],
    }));
    const metrics = {
      uniqueUsers: 10,
      activeUsers: 10,
      returningUsers: 5,
      newlyActivatedUsers: 2,
      dormantUsers: 0,
      reactivatedUsers: 0,
      medianActiveIntervals: 3,
      totalEvents: 59,
    };
    const insights = generateMatrixInsights(users, metrics, [], 'Store viewed');
    expect(insights.length).toBeGreaterThan(0);
    expect(insights[0].confidence).toBeDefined();
  });
});

describe('activityMatrixEventRegistry', () => {
  it('resolves store activity sources', () => {
    const { storeActivityTypes } = resolveEventSources(['store_viewed', 'offer_claimed']);
    expect(storeActivityTypes).toContain('STORE_VIEWED');
    expect(storeActivityTypes).toContain('OFFER_CLAIMED');
  });

  it('returns event definition by key', () => {
    const def = getEventDefinition('store_viewed');
    expect(def?.label).toBe('Store viewed');
  });

  it('lists platform events including feed_view', () => {
    const platform = listEventDefinitions('platform');
    expect(platform.some((e) => e.key === 'feed_view')).toBe(true);
  });
});

describe('platform range limits', () => {
  it('enforces stricter platform day range', () => {
    const from = new Date('2026-01-01T00:00:00.000Z');
    const to = new Date('2026-05-01T00:00:00.000Z');
    const result = validateDateRange(from, to, 'day', 'UTC', PLATFORM_MAX_RANGE_DAYS);
    expect(result.ok).toBe(false);
  });
});
