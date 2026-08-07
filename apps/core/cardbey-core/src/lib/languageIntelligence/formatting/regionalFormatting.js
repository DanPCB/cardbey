/**
 * RegionalFormatting — pure locale-aware formatting (no AI, no I/O).
 */

const KM_TO_MILES = 0.621371;

/**
 * @param {number} amount
 * @param {string} currency
 * @param {string} [intlLocale]
 * @returns {string}
 */
export function formatCurrency(amount, currency, intlLocale = 'en') {
  const value = Number(amount);
  if (!Number.isFinite(value)) return '';
  const code = String(currency || 'AUD').toUpperCase();
  try {
    return new Intl.NumberFormat(intlLocale || 'en', {
      style: 'currency',
      currency: code,
      maximumFractionDigits: code === 'VND' || code === 'JPY' ? 0 : 2,
    }).format(value);
  } catch {
    return `${value} ${code}`;
  }
}

/**
 * @param {Date|string|number} date
 * @param {string} dateFormat   Token pattern dd/MM/yyyy | MM/dd/yyyy | yyyy/MM/dd | dd.MM.yyyy
 * @returns {string}
 */
export function formatDate(date, dateFormat = 'dd/MM/yyyy') {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = String(d.getUTCFullYear());
  const fmt = String(dateFormat || 'dd/MM/yyyy');
  return fmt.replace(/yyyy/g, yyyy).replace(/dd/g, dd).replace(/MM/g, mm);
}

/**
 * @param {number} kilometers
 * @param {'metric'|'imperial'} units
 * @param {string} [intlLocale]
 * @returns {string}
 */
export function formatDistance(kilometers, units = 'metric', intlLocale = 'en') {
  const km = Number(kilometers);
  if (!Number.isFinite(km)) return '';
  if (units === 'imperial') {
    const miles = km * KM_TO_MILES;
    const n = new Intl.NumberFormat(intlLocale, { maximumFractionDigits: 1 }).format(miles);
    return `${n} miles`;
  }
  const n = new Intl.NumberFormat(intlLocale, { maximumFractionDigits: 1 }).format(km);
  return `${n} km`;
}

/**
 * Format 24h "HH:mm" or Date into region-friendly time.
 * @param {string|Date} time
 * @param {string} [regionId]
 * @param {string} [intlLocale]
 * @returns {string}
 */
export function formatTimeOfDay(time, regionId = 'AU', intlLocale) {
  let hours;
  let minutes;
  if (time instanceof Date) {
    hours = time.getUTCHours();
    minutes = time.getUTCMinutes();
  } else {
    const m = String(time ?? '').trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return String(time ?? '');
    hours = Number(m[1]);
    minutes = Number(m[2]);
  }
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return String(time ?? '');

  const use12h = String(regionId).toUpperCase() === 'US';
  const locale = intlLocale || (use12h ? 'en-US' : 'en-AU');
  const d = new Date(Date.UTC(2000, 0, 1, hours, minutes));
  return new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: use12h,
    timeZone: 'UTC',
  }).format(d);
}
