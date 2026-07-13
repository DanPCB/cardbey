/**
 * Deterministic pattern insights for User Activity Matrix.
 * Observational only — no causal claims.
 */

/**
 * @typedef {object} MatrixInsight
 * @property {string} id
 * @property {string} title
 * @property {string} explanation
 * @property {string} evidence
 * @property {number} sampleSize
 * @property {'low' | 'medium' | 'high'} confidence
 * @property {string} [recommendedAction]
 */

/**
 * @typedef {object} MatrixUserRow
 * @property {string} userId
 * @property {{ activeIntervals: number; totalEvents: number; longestStreak: number; firstSeen?: string; lastActive?: string }} summary
 * @property {{ key: string; label: string }} [classification]
 * @property {Array<{ intervalKey: string; eventCount: number }>} cells
 */

/**
 * @typedef {object} MatrixMetrics
 * @property {number} uniqueUsers
 * @property {number} activeUsers
 * @property {number} returningUsers
 * @property {number} newlyActivatedUsers
 * @property {number} dormantUsers
 * @property {number} reactivatedUsers
 * @property {number} medianActiveIntervals
 * @property {number} totalEvents
 */

/**
 * @param {MatrixUserRow[]} users
 * @param {MatrixMetrics} metrics
 * @param {Array<{ key: string; label: string }>} intervals
 * @param {string} eventLabel
 * @returns {MatrixInsight[]}
 */
export function generateMatrixInsights(users, metrics, intervals, eventLabel) {
  if (!users.length || metrics.totalEvents < 5) {
    return [];
  }

  const insights = [];
  const sampleSize = users.length;

  // Concentration among top users
  const sorted = [...users].sort((a, b) => b.summary.totalEvents - a.summary.totalEvents);
  const topCount = Math.max(1, Math.ceil(users.length * 0.08));
  const topEvents = sorted.slice(0, topCount).reduce((s, u) => s + u.summary.totalEvents, 0);
  const concentrationPct = metrics.totalEvents > 0 ? Math.round((topEvents / metrics.totalEvents) * 100) : 0;
  if (concentrationPct >= 40 && users.length >= 5) {
    insights.push({
      id: 'concentration',
      title: `${eventLabel} is concentrated among repeat users`,
      explanation: `In this filtered dataset, the top ${topCount} user(s) account for ${concentrationPct}% of ${eventLabel} events.`,
      evidence: `${topEvents} of ${metrics.totalEvents} events from top ${Math.round((topCount / users.length) * 100)}% of users.`,
      sampleSize,
      confidence: concentrationPct >= 60 ? 'high' : 'medium',
      recommendedAction: 'Segment top users and compare their paths to one-time visitors.',
    });
  }

  // Non-return rate (users with only 1 active interval)
  const oneTime = users.filter((u) => u.summary.activeIntervals === 1).length;
  if (oneTime >= 3) {
    const pct = Math.round((oneTime / users.length) * 100);
    insights.push({
      id: 'non_return',
      title: `${pct}% of users did not return after first ${eventLabel}`,
      explanation: `In this filtered dataset, ${oneTime} of ${users.length} users appear in only one active interval.`,
      evidence: `${oneTime} one-interval users of ${users.length} total.`,
      sampleSize,
      confidence: pct >= 30 ? 'medium' : 'low',
      recommendedAction: 'Expand the date range or compare with a follow-up event.',
    });
  }

  // Dormant / reactivated counts
  const dormant = users.filter((u) => u.classification?.key === 'dormant').length;
  if (dormant >= 2) {
    insights.push({
      id: 'dormant_count',
      title: `${dormant} previously active users appear dormant`,
      explanation: `In this filtered dataset, ${dormant} users show prolonged inactivity after prior ${eventLabel}.`,
      evidence: `${dormant} users classified as dormant.`,
      sampleSize,
      confidence: 'medium',
      recommendedAction: 'Review re-engagement campaigns for dormant segments.',
    });
  }

  const reactivated = users.filter((u) => u.classification?.key === 'reactivated').length;
  if (reactivated >= 1) {
    insights.push({
      id: 'reactivated_count',
      title: `${reactivated} dormant user(s) returned in this period`,
      explanation: `In this filtered dataset, ${reactivated} user(s) correlate with reactivation after an inactivity gap.`,
      evidence: `${reactivated} users classified as reactivated.`,
      sampleSize,
      confidence: reactivated >= 3 ? 'medium' : 'low',
      recommendedAction: 'Compare reactivated users to habitual users for shared attributes.',
    });
  }

  // Day-of-week pattern (day granularity intervals)
  if (intervals.length >= 7) {
    const byDow = new Array(7).fill(0);
    for (const user of users) {
      for (const cell of user.cells) {
        if (cell.eventCount > 0) {
          const dow = new Date(intervals.find((i) => i.key === cell.intervalKey)?.start ?? cell.intervalKey).getUTCDay();
          byDow[dow] += cell.eventCount;
        }
      }
    }
    const max = Math.max(...byDow);
    if (max > 0) {
      const dowNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const peak = byDow.indexOf(max);
      insights.push({
        id: 'dow_pattern',
        title: `${dowNames[peak]} has the strongest ${eventLabel} pattern`,
        explanation: `In this filtered dataset, ${eventLabel} appears more frequently on ${dowNames[peak]}s.`,
        evidence: `${max} events attributed to ${dowNames[peak]} intervals.`,
        sampleSize,
        confidence: 'low',
        recommendedAction: 'Validate with a longer date range before scheduling campaigns.',
      });
    }
  }

  // Returning vs new ratio
  if (metrics.returningUsers > 0 && metrics.newlyActivatedUsers > 0) {
    const ratio = (metrics.returningUsers / metrics.activeUsers).toFixed(2);
    insights.push({
      id: 'returning_ratio',
      title: `${Math.round(Number(ratio) * 100)}% of active users are returning`,
      explanation: `In this filtered dataset, returning users (2+ intervals) are associated with sustained ${eventLabel}.`,
      evidence: `${metrics.returningUsers} returning of ${metrics.activeUsers} active users.`,
      sampleSize,
      confidence: metrics.activeUsers >= 20 ? 'medium' : 'low',
      recommendedAction: 'Track cohort retention week over week.',
    });
  }

  return insights.slice(0, 5);
}
