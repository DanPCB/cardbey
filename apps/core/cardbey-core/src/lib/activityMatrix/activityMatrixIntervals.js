/**
 * Timezone-aware interval generation for User Activity Matrix.
 */

/** @typedef {'hour' | 'day' | 'week' | 'month'} ActivityGranularity */

/** @type {Record<ActivityGranularity, number>} Max range in days per granularity */
export const MAX_RANGE_DAYS = {
  hour: 14,
  day: 180,
  week: 730,
  month: 1825,
};

/**
 * @typedef {object} ActivityInterval
 * @property {string} key
 * @property {string} label
 * @property {string} start ISO
 * @property {string} end ISO
 */

/**
 * @param {Date} date
 * @param {string} timeZone
 */
function getZonedYmd(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const y = Number(parts.find((p) => p.type === 'year')?.value);
  const m = Number(parts.find((p) => p.type === 'month')?.value);
  const d = Number(parts.find((p) => p.type === 'day')?.value);
  return { y, m, d };
}

/**
 * UTC instant for local midnight in timezone on given y-m-d.
 * @param {number} y
 * @param {number} m
 * @param {number} d
 * @param {string} timeZone
 */
export function zonedMidnightUtc(y, m, d, timeZone) {
  // Binary search offset: find UTC time whose zoned y-m-d matches
  let guess = Date.UTC(y, m - 1, d, 0, 0, 0);
  for (let i = 0; i < 4; i += 1) {
    const z = getZonedYmd(new Date(guess), timeZone);
    const target = Date.UTC(y, m - 1, d);
    const actual = Date.UTC(z.y, z.m - 1, z.d);
    const diffDays = Math.round((target - actual) / 86_400_000);
    guess += diffDays * 86_400_000;
  }
  return new Date(guess);
}

/** @type {Record<ActivityGranularity, number>} Max range in days per granularity — platform-wide queries */
export const PLATFORM_MAX_RANGE_DAYS = {
  hour: 7,
  day: 90,
  week: 365,
  month: 1825,
};

/**
 * @param {Date} from
 * @param {Date} to
 * @param {ActivityGranularity} granularity
 * @param {string} timeZone
 * @param {Record<ActivityGranularity, number>} [maxRangeDays]
 */
export function validateDateRange(from, to, granularity, timeZone = 'UTC', maxRangeDays = MAX_RANGE_DAYS) {
  if (!(from instanceof Date) || !(to instanceof Date) || Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return { ok: false, error: 'Invalid date range' };
  }
  if (from > to) {
    return { ok: false, error: 'from must be before to' };
  }
  const maxDays = maxRangeDays[granularity] ?? maxRangeDays.day;
  const spanMs = to.getTime() - from.getTime();
  const spanDays = spanMs / 86_400_000;
  if (spanDays > maxDays) {
    return {
      ok: false,
      error: `Date range exceeds maximum of ${maxDays} days for ${granularity} granularity`,
    };
  }
  try {
    Intl.DateTimeFormat(undefined, { timeZone });
  } catch {
    return { ok: false, error: 'Invalid timezone' };
  }
  return { ok: true };
}

/**
 * @param {Date} from
 * @param {Date} to
 * @param {ActivityGranularity} granularity
 * @param {string} timeZone
 * @param {Record<ActivityGranularity, number>} [maxRangeDays]
 * @returns {ActivityInterval[]}
 */
export function generateIntervals(from, to, granularity, timeZone = 'UTC', maxRangeDays = MAX_RANGE_DAYS) {
  const validation = validateDateRange(from, to, granularity, timeZone, maxRangeDays);
  if (!validation.ok) {
    throw new Error(validation.error);
  }

  const intervals = [];
  const endBound = to.getTime();

  if (granularity === 'hour') {
    let cursor = new Date(from);
    cursor.setUTCMinutes(0, 0, 0);
    while (cursor.getTime() <= endBound) {
      const start = new Date(cursor);
      const end = new Date(cursor.getTime() + 3_600_000 - 1);
      const key = start.toISOString().slice(0, 13);
      intervals.push({
        key,
        label: formatIntervalLabel(start, granularity, timeZone),
        start: start.toISOString(),
        end: end.toISOString(),
      });
      cursor = new Date(cursor.getTime() + 3_600_000);
    }
    return intervals;
  }

  const startYmd = getZonedYmd(from, timeZone);
  let cursor = zonedMidnightUtc(startYmd.y, startYmd.m, startYmd.d, timeZone);

  while (cursor.getTime() <= endBound) {
    const z = getZonedYmd(cursor, timeZone);
    let next;
    let key;
    let labelDate = cursor;

    if (granularity === 'day') {
      next = zonedMidnightUtc(z.y, z.m, z.d + 1, timeZone);
      key = `${z.y}-${String(z.m).padStart(2, '0')}-${String(z.d).padStart(2, '0')}`;
    } else if (granularity === 'week') {
      const dayOfWeek = new Date(cursor).getUTCDay();
      const mondayOffset = (dayOfWeek + 6) % 7;
      const weekStart = zonedMidnightUtc(z.y, z.m, z.d - mondayOffset, timeZone);
      const ws = getZonedYmd(weekStart, timeZone);
      key = `${ws.y}-W${isoWeekNumber(weekStart, timeZone)}`;
      labelDate = weekStart;
      const wz = getZonedYmd(weekStart, timeZone);
      next = zonedMidnightUtc(wz.y, wz.m, wz.d + 7, timeZone);
      cursor = weekStart;
    } else {
      next = zonedMidnightUtc(z.y, z.m + 1, 1, timeZone);
      key = `${z.y}-${String(z.m).padStart(2, '0')}`;
      labelDate = cursor;
    }

    const start = new Date(cursor);
    const end = new Date(Math.min(next.getTime() - 1, endBound));
    if (!intervals.some((i) => i.key === key)) {
      intervals.push({
        key,
        label: formatIntervalLabel(labelDate, granularity, timeZone),
        start: start.toISOString(),
        end: end.toISOString(),
      });
    }
    cursor = next;
    if (granularity === 'week' && cursor.getTime() > endBound) break;
  }

  return intervals;
}

/**
 * @param {Date} date
 * @param {ActivityGranularity} granularity
 * @param {string} timeZone
 */
function formatIntervalLabel(date, granularity, timeZone) {
  if (granularity === 'hour') {
    return new Intl.DateTimeFormat('en-US', { timeZone, month: 'short', day: 'numeric', hour: 'numeric' }).format(date);
  }
  if (granularity === 'day') {
    return new Intl.DateTimeFormat('en-US', { timeZone, month: 'short', day: 'numeric' }).format(date);
  }
  if (granularity === 'week') {
    return `W${isoWeekNumber(date, timeZone)}`;
  }
  return new Intl.DateTimeFormat('en-US', { timeZone, month: 'short', year: 'numeric' }).format(date);
}

/**
 * @param {Date} date
 * @param {string} timeZone
 */
function isoWeekNumber(date, timeZone) {
  const z = getZonedYmd(date, timeZone);
  const jan1 = zonedMidnightUtc(z.y, 1, 1, timeZone);
  const dayOfYear = Math.floor((date.getTime() - jan1.getTime()) / 86_400_000) + 1;
  return Math.ceil((dayOfYear + (jan1.getUTCDay() + 6) % 7) / 7);
}

/**
 * Assign an event timestamp to an interval key.
 * @param {string} occurredAtIso
 * @param {ActivityInterval[]} intervals
 * @param {ActivityGranularity} granularity
 * @param {string} timeZone
 */
export function intervalKeyForTimestamp(occurredAtIso, intervals, granularity, timeZone) {
  const ts = new Date(occurredAtIso).getTime();
  for (const interval of intervals) {
    const start = new Date(interval.start).getTime();
    const end = new Date(interval.end).getTime();
    if (ts >= start && ts <= end) return interval.key;
  }
  if (granularity === 'hour') {
    const d = new Date(occurredAtIso);
    return d.toISOString().slice(0, 13);
  }
  const z = getZonedYmd(new Date(occurredAtIso), timeZone);
  if (granularity === 'day') {
    return `${z.y}-${String(z.m).padStart(2, '0')}-${String(z.d).padStart(2, '0')}`;
  }
  if (granularity === 'month') {
    return `${z.y}-${String(z.m).padStart(2, '0')}`;
  }
  const monday = zonedMidnightUtc(z.y, z.m, z.d, timeZone);
  const ws = getZonedYmd(monday, timeZone);
  return `${ws.y}-W${isoWeekNumber(monday, timeZone)}`;
}
