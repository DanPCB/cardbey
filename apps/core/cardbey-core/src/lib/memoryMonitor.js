/**
 * Heap monitor — early warning before OOM (ratio vs V8 heap_size_limit, not heapTotal).
 */

import v8 from 'v8';
import { getHeapLimitMb } from './memoryLimit.js';

const HEAP_PRESSURE_WARNING_THRESHOLD = 0.7;
const HEAP_PRESSURE_CRITICAL_THRESHOLD = 0.85;
const RSS_GROWTH_WARNING_RATIO = 0.5;
const RSS_HISTORY_MIN_SAMPLES = 3;
const RSS_HISTORY_MAX_SAMPLES = 5;

/**
 * @param {number} bytes
 * @returns {number}
 */
function bytesToMb(bytes) {
  return Math.round(bytes / 1024 / 1024);
}

/**
 * @param {number} ratio
 * @param {number} [decimals]
 * @returns {string}
 */
function formatPercent(ratio, decimals = 1) {
  return (ratio * 100).toFixed(decimals);
}

/**
 * @returns {{
 *   heapUsedMb: number,
 *   heapTotalMb: number,
 *   heapLimitMb: number,
 *   rssMb: number,
 *   heapPressurePercent: number,
 *   allocatedHeapUsagePercent: number,
 * }}
 */
export function sampleMemoryStats() {
  const memoryUsage = process.memoryUsage();
  const heapLimitBytes = v8.getHeapStatistics().heap_size_limit;

  const heapUsedMb = bytesToMb(memoryUsage.heapUsed);
  const heapTotalMb = bytesToMb(memoryUsage.heapTotal);
  const heapLimitMb = bytesToMb(heapLimitBytes);
  const rssMb = bytesToMb(memoryUsage.rss);

  const heapPressurePercent = heapLimitBytes > 0 ? memoryUsage.heapUsed / heapLimitBytes : 0;
  const allocatedHeapUsagePercent =
    memoryUsage.heapTotal > 0 ? memoryUsage.heapUsed / memoryUsage.heapTotal : 0;

  return {
    heapUsedMb,
    heapTotalMb,
    heapLimitMb,
    rssMb,
    heapPressurePercent,
    allocatedHeapUsagePercent,
  };
}

/**
 * @param {ReturnType<typeof sampleMemoryStats>} stats
 * @returns {string}
 */
export function formatMemoryLogLine(stats) {
  const pressurePct = formatPercent(stats.heapPressurePercent);
  const allocatedPct = Math.round(stats.allocatedHeapUsagePercent * 100);
  return `[MEM] heapUsed=${stats.heapUsedMb}MB / limit=${stats.heapLimitMb}MB (${pressurePct}%) | allocated=${stats.heapUsedMb}/${stats.heapTotalMb}MB (${allocatedPct}%) | RSS=${stats.rssMb}MB`;
}

/**
 * @param {number} heapPressurePercent
 * @returns {'critical' | 'warning' | null}
 */
export function evaluateHeapPressureLevel(heapPressurePercent) {
  if (heapPressurePercent > HEAP_PRESSURE_CRITICAL_THRESHOLD) return 'critical';
  if (heapPressurePercent > HEAP_PRESSURE_WARNING_THRESHOLD) return 'warning';
  return null;
}

/**
 * @param {number[]} rssHistory
 * @param {number} rssMb
 * @param {{
 *   minSamples?: number,
 *   maxSamples?: number,
 *   growthRatio?: number,
 * }} [options]
 * @returns {{ oldestMb: number, newestMb: number, growthPercent: number, history: number[] } | null}
 */
export function evaluateRssGrowthTrend(
  rssHistory,
  rssMb,
  options = {},
) {
  const minSamples = options.minSamples ?? RSS_HISTORY_MIN_SAMPLES;
  const maxSamples = options.maxSamples ?? RSS_HISTORY_MAX_SAMPLES;
  const growthRatio = options.growthRatio ?? RSS_GROWTH_WARNING_RATIO;

  const history = [...rssHistory, rssMb];
  while (history.length > maxSamples) history.shift();

  if (history.length < minSamples) {
    return { history, warning: null };
  }

  const oldestMb = history[0];
  const newestMb = history[history.length - 1];
  if (oldestMb <= 0) {
    return { history, warning: null };
  }

  const growth = (newestMb - oldestMb) / oldestMb;
  if (growth >= growthRatio) {
    return {
      history,
      warning: {
        oldestMb,
        newestMb,
        growthPercent: Math.round(growth * 100),
      },
    };
  }

  return { history, warning: null };
}

/**
 * @param {number} [intervalMs]
 * @returns {{ stop: () => void }}
 */
export function startMemoryMonitor(intervalMs = 30_000) {
  const initialLimitMb = getHeapLimitMb();
  console.log(`[MEM] Monitor started. Heap limit: ${initialLimitMb}MB`);

  let rssHistory = [];

  const interval = setInterval(() => {
    const stats = sampleMemoryStats();
    console.log(formatMemoryLogLine(stats));

    const pressureLevel = evaluateHeapPressureLevel(stats.heapPressurePercent);
    const pressurePct = formatPercent(stats.heapPressurePercent);

    if (pressureLevel === 'critical') {
      console.error(
        `[MEM] CRITICAL: Heap pressure at ${pressurePct}% of limit — possible OOM soon`,
      );
    } else if (pressureLevel === 'warning') {
      console.warn(`[MEM] WARNING: Heap pressure at ${pressurePct}% of limit`);
    }

    const rssTrend = evaluateRssGrowthTrend(rssHistory, stats.rssMb);
    rssHistory = rssTrend.history;
    if (rssTrend.warning) {
      const { oldestMb, newestMb, growthPercent } = rssTrend.warning;
      console.warn(
        `[MEM] WARNING: RSS growth trend +${growthPercent}% (${oldestMb}MB → ${newestMb}MB) — allocation usage ${Math.round(stats.allocatedHeapUsagePercent * 100)}%, not heap limit pressure`,
      );
    }
  }, intervalMs);

  if (typeof interval.unref === 'function') interval.unref();

  return { stop: () => clearInterval(interval) };
}
