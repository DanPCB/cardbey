/**
 * Deterministic behavioural classifications for User Activity Matrix.
 */

/** @typedef {import('./activityMatrixIntervals.js').ActivityInterval} ActivityInterval */

export const CLASSIFICATION_CONFIG = {
  /** Intervals below this count with first event in range → New */
  newMaxIntervals: 2,
  /** Minimum intervals for Habitual */
  habitualMinIntervals: 4,
  /** Top percentile threshold for Power user */
  powerUserPercentile: 0.92,
  /** Days without activity to consider dormant */
  dormantInactivityDays: 14,
  /** Gap in days that qualifies as reactivation */
  reactivationGapDays: 14,
  /** Slipping: recent window activity vs prior window ratio threshold */
  slippingRatioThreshold: 0.5,
};

/**
 * @typedef {object} UserClassification
 * @property {string} key
 * @property {string} label
 * @property {string} explanation
 */

/**
 * @typedef {object} UserActivitySummary
 * @property {number} activeIntervals
 * @property {number} totalEvents
 * @property {number} longestStreak
 * @property {string} [firstSeen]
 * @property {string} [lastActive]
 * @property {number} [inactivityDays]
 * @property {boolean} [firstEventInRange]
 * @property {boolean} [hadPriorActivity]
 */

/**
 * @param {Set<string>} activeIntervalKeys
 * @param {ActivityInterval[]} intervals ordered
 */
export function computeLongestStreak(activeIntervalKeys, intervals) {
  let longest = 0;
  let current = 0;
  for (const interval of intervals) {
    if (activeIntervalKeys.has(interval.key)) {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  }
  return longest;
}

/**
 * @param {number[]} values
 */
export function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * @param {UserActivitySummary} summary
 * @param {ActivityInterval[]} intervals
 * @param {Set<string>} activeIntervalKeys
 * @param {object} ctx
 * @param {string} ctx.eventLabel
 * @param {number} ctx.rankPercentile
 * @param {boolean} ctx.isPowerUserCandidate
 */
export function classifyUser(summary, intervals, activeIntervalKeys, ctx) {
  const { eventLabel, rankPercentile, isPowerUserCandidate } = ctx;
  const active = summary.activeIntervals;
  const streak = summary.longestStreak;
  const inactivityDays = summary.inactivityDays ?? 0;

  if (active === 1 && streak === 1) {
    return {
      key: 'one_time',
      label: 'One-time user',
      explanation: `Only one active interval with ${eventLabel} and no return in this view.`,
    };
  }

  if (summary.firstEventInRange && active <= CLASSIFICATION_CONFIG.newMaxIntervals) {
    return {
      key: 'new',
      label: 'New',
      explanation: `First ${eventLabel} occurred during the selected range with fewer than 3 active intervals.`,
    };
  }

  if (inactivityDays >= CLASSIFICATION_CONFIG.dormantInactivityDays && summary.hadPriorActivity) {
    if (summary.lastActive && active > 0) {
      const last = new Date(summary.lastActive).getTime();
      const now = Date.now();
      const gap = (now - last) / 86_400_000;
      if (gap >= CLASSIFICATION_CONFIG.reactivationGapDays && active >= 1) {
        return {
          key: 'reactivated',
          label: 'Reactivated',
          explanation: `Returned to ${eventLabel} after ${Math.round(gap)} days of inactivity.`,
        };
      }
    }
    return {
      key: 'dormant',
      label: 'Dormant',
      explanation: `No recent ${eventLabel} for ${inactivityDays} days after previously being active in ${active} intervals.`,
    };
  }

  if (isPowerUserCandidate && rankPercentile >= CLASSIFICATION_CONFIG.powerUserPercentile) {
    return {
      key: 'power_user',
      label: 'Power user',
      explanation: `Among the top users by ${eventLabel} frequency in this filtered dataset (${active} active intervals).`,
    };
  }

  if (active >= 2 && active <= 3) {
    return {
      key: 'exploring',
      label: 'Exploring',
      explanation: `Active in ${active} intervals with ${eventLabel} but no stable cadence yet.`,
    };
  }

  if (active >= CLASSIFICATION_CONFIG.habitualMinIntervals && streak >= 2) {
    return {
      key: 'habitual',
      label: 'Habitual',
      explanation: `Active in ${active} intervals with repeated ${eventLabel} cadence (longest streak: ${streak}).`,
    };
  }

  if (summary.slipping) {
    return {
      key: 'slipping',
      label: 'Slipping',
      explanation: `Recent ${eventLabel} activity is materially lower than the prior comparable window in this dataset.`,
    };
  }

  if (active >= CLASSIFICATION_CONFIG.habitualMinIntervals) {
    return {
      key: 'habitual',
      label: 'Habitual',
      explanation: `Active in ${active} intervals with ${eventLabel}.`,
    };
  }

  return {
    key: 'exploring',
    label: 'Exploring',
    explanation: `Active in ${active} interval(s) with ${eventLabel} in the selected range.`,
  };
}

/**
 * Detect slipping: compare activity in last third vs middle third of intervals.
 * @param {Set<string>} activeIntervalKeys
 * @param {ActivityInterval[]} intervals
 */
export function detectSlipping(activeIntervalKeys, intervals) {
  if (intervals.length < 6) return false;
  const third = Math.floor(intervals.length / 3);
  const prior = intervals.slice(third, third * 2);
  const recent = intervals.slice(third * 2);
  const priorCount = prior.filter((i) => activeIntervalKeys.has(i.key)).length;
  const recentCount = recent.filter((i) => activeIntervalKeys.has(i.key)).length;
  if (priorCount === 0) return false;
  return recentCount / priorCount < CLASSIFICATION_CONFIG.slippingRatioThreshold;
}
