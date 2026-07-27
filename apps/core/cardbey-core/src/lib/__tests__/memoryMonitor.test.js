import { describe, it, expect } from 'vitest';
import v8 from 'v8';
import {
  evaluateHeapPressureLevel,
  evaluateRssGrowthTrend,
  formatMemoryLogLine,
  sampleMemoryStats,
} from '../memoryMonitor.js';

describe('memoryMonitor', () => {
  it('uses heap_size_limit for heap pressure, not heapTotal', () => {
    const stats = sampleMemoryStats();
    const heapLimitBytes = v8.getHeapStatistics().heap_size_limit;

    expect(stats.heapLimitMb).toBe(Math.round(heapLimitBytes / 1024 / 1024));
    expect(stats.heapPressurePercent).toBeLessThan(stats.allocatedHeapUsagePercent);
    expect(stats.heapPressurePercent).toBeLessThan(0.5);
  });

  it('formats allocation usage separately from heap limit pressure', () => {
    const stats = {
      heapUsedMb: 112,
      heapTotalMb: 121,
      heapLimitMb: 8192,
      rssMb: 121,
      heapPressurePercent: 112 / 8192,
      allocatedHeapUsagePercent: 112 / 121,
    };

    expect(formatMemoryLogLine(stats)).toBe(
      '[MEM] heapUsed=112MB / limit=8192MB (1.4%) | allocated=112/121MB (93%) | RSS=121MB',
    );
  });

  it('warns on heap pressure thresholds only', () => {
    expect(evaluateHeapPressureLevel(0.5)).toBeNull();
    expect(evaluateHeapPressureLevel(0.71)).toBe('warning');
    expect(evaluateHeapPressureLevel(0.86)).toBe('critical');
    expect(evaluateHeapPressureLevel(112 / 8192)).toBeNull();
  });

  it('warns on RSS growth trend separately', () => {
    const first = evaluateRssGrowthTrend([], 100);
    expect(first.warning).toBeNull();

    const second = evaluateRssGrowthTrend(first.history, 120);
    expect(second.warning).toBeNull();

    const third = evaluateRssGrowthTrend(second.history, 160);
    expect(third.warning).toEqual({
      oldestMb: 100,
      newestMb: 160,
      growthPercent: 60,
    });
  });
});
