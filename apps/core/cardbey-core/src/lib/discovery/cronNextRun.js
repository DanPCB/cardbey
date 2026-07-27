/**
 * Minimal next-run estimation for common cron patterns (no external parser).
 */

/**
 * @param {string} cronExpression
 * @param {Date} [from]
 * @returns {{ next: Date | null, label: string }}
 */
export function estimateNextCronRun(cronExpression, from = new Date()) {
  const expr = String(cronExpression || '').trim();
  const parts = expr.split(/\s+/);
  if (parts.length !== 5) {
    return { next: null, label: 'Scheduled' };
  }

  const [minute, hour, , ,] = parts;
  const now = new Date(from);

  // Every N hours: 0 */N * * *
  const everyHours = hour.match(/^\*\/(\d+)$/);
  if (minute === '0' && everyHours) {
    const n = parseInt(everyHours[1], 10);
    if (n >= 1 && n <= 23) {
      const next = new Date(now);
      next.setUTCSeconds(0, 0);
      const currentHour = next.getUTCHours();
      const nextHour = Math.ceil((currentHour + 0.001) / n) * n;
      if (nextHour >= 24) {
        next.setUTCDate(next.getUTCDate() + 1);
        next.setUTCHours(0);
      } else {
        next.setUTCHours(nextHour);
      }
      next.setUTCMinutes(0);
      if (next <= now) {
        next.setUTCHours(next.getUTCHours() + n);
      }
      return { next, label: formatRelative(next, now) };
    }
  }

  // Daily at hour H: 0 H * * *
  if (minute === '0' && /^\d+$/.test(hour)) {
    const h = parseInt(hour, 10);
    if (h >= 0 && h <= 23) {
      const next = new Date(now);
      next.setUTCHours(h, 0, 0, 0);
      if (next <= now) {
        next.setUTCDate(next.getUTCDate() + 1);
      }
      return { next, label: formatRelative(next, now) };
    }
  }

  return { next: null, label: 'Scheduled' };
}

function formatRelative(target, from) {
  const diffMs = target.getTime() - from.getTime();
  if (diffMs < 0) return 'Scheduled';
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `in ${mins}m`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `in ${hours}h ${remMins}m`;
}
