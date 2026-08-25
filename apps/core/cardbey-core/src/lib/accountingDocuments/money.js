/**
 * Accounting Documents V1 — integer-cents money + GST (authoritative; never LLM).
 * Rounding: half-up to nearest cent.
 */

export const GST_BPS_DEFAULT = 1000; // 10%

export const GST_MODE = Object.freeze({
  GST_EXCLUSIVE: 'GST_EXCLUSIVE',
  GST_INCLUDED: 'GST_INCLUDED',
  GST_FREE: 'GST_FREE',
});

/** Half-up divide: round(n / d) for positive integers. */
export function roundHalfUpDiv(numerator, denominator) {
  if (denominator <= 0) throw new Error('denominator must be positive');
  const n = Number(numerator);
  const d = Number(denominator);
  if (!Number.isFinite(n) || !Number.isFinite(d)) throw new Error('invalid division');
  const sign = n < 0 ? -1 : 1;
  const abs = Math.abs(n);
  return sign * Math.floor((abs + Math.floor(d / 2)) / d);
}

/** Convert decimal money string/number to integer cents. Rejects unsafe float ambiguity when possible. */
export function toCents(value) {
  if (value == null || value === '') return 0;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('invalid money');
    return Math.round(value * 100);
  }
  const raw = String(value).trim().replace(/,/g, '');
  if (!/^-?\d+(\.\d{1,4})?$/.test(raw)) throw new Error(`invalid money: ${value}`);
  const neg = raw.startsWith('-');
  const [whole, frac = ''] = raw.replace(/^-/, '').split('.');
  const fracPadded = `${frac}00`.slice(0, 2);
  const fracExtra = frac.length > 2 ? frac.slice(2) : '';
  let cents = Number(whole) * 100 + Number(fracPadded);
  if (fracExtra) {
    // half-up from further digits
    const next = Number(fracExtra[0] || 0);
    if (next >= 5) cents += 1;
  }
  return neg ? -cents : cents;
}

export function formatCents(cents, currency = 'AUD') {
  const n = Number(cents) || 0;
  const abs = Math.abs(n);
  const dollars = Math.floor(abs / 100);
  const rem = String(abs % 100).padStart(2, '0');
  const body = `${dollars}.${rem}`;
  const signed = n < 0 ? `-${body}` : body;
  if (currency === 'AUD') return `$${signed}`;
  return `${signed} ${currency}`;
}

/**
 * @param {object} input
 * @param {string|number} input.quantity
 * @param {number} input.unitPriceCents
 * @param {'GST_EXCLUSIVE'|'GST_INCLUDED'|'GST_FREE'} input.gstMode
 * @param {number} [input.gstBps]
 * @param {boolean} [input.gstRegistered]
 */
export function calculateLineTotals(input) {
  const qty = Number(input.quantity);
  if (!Number.isFinite(qty) || qty <= 0) throw new Error('quantity must be > 0');
  const unitPriceCents = Math.trunc(Number(input.unitPriceCents));
  if (!Number.isFinite(unitPriceCents) || unitPriceCents < 0) {
    throw new Error('unitPriceCents must be >= 0');
  }

  const gstRegistered = input.gstRegistered !== false;
  const mode = gstRegistered ? input.gstMode || GST_MODE.GST_EXCLUSIVE : GST_MODE.GST_FREE;
  const gstBps = Math.trunc(Number(input.gstBps ?? GST_BPS_DEFAULT));

  // qty may be decimal (e.g. 1.5) — scale: line = round(qty * unitPrice)
  const raw = qty * unitPriceCents;
  const baseCents = Math.round(raw);

  if (mode === GST_MODE.GST_FREE || gstBps <= 0) {
    return {
      quantity: qty,
      unitPriceCents,
      lineSubtotalCents: baseCents,
      lineGstCents: 0,
      lineTotalCents: baseCents,
      gstMode: GST_MODE.GST_FREE,
      gstBps: 0,
    };
  }

  if (mode === GST_MODE.GST_INCLUDED) {
    const lineTotalCents = baseCents;
    const lineGstCents = roundHalfUpDiv(lineTotalCents * gstBps, 10000 + gstBps);
    const lineSubtotalCents = lineTotalCents - lineGstCents;
    return {
      quantity: qty,
      unitPriceCents,
      lineSubtotalCents,
      lineGstCents,
      lineTotalCents,
      gstMode: mode,
      gstBps,
    };
  }

  // GST_EXCLUSIVE
  const lineSubtotalCents = baseCents;
  const lineGstCents = roundHalfUpDiv(lineSubtotalCents * gstBps, 10000);
  return {
    quantity: qty,
    unitPriceCents,
    lineSubtotalCents,
    lineGstCents,
    lineTotalCents: lineSubtotalCents + lineGstCents,
    gstMode: mode,
    gstBps,
  };
}

/**
 * @param {Array<ReturnType<typeof calculateLineTotals>>} lines
 * @param {{ discountCents?: number }} [opts]
 */
export function calculateDocumentTotals(lines, opts = {}) {
  const discountCents = Math.max(0, Math.trunc(Number(opts.discountCents) || 0));
  let subtotalCents = 0;
  let gstCents = 0;
  let totalCents = 0;
  for (const line of lines) {
    subtotalCents += line.lineSubtotalCents;
    gstCents += line.lineGstCents;
    totalCents += line.lineTotalCents;
  }
  totalCents = Math.max(0, totalCents - discountCents);
  // When discount applied, reduce GST proportionally only if exclusive total includes gst —
  // V1: discount reduces subtotal+gst equally by applying to total after sum (simple).
  const amountPaidCents = Math.max(0, Math.trunc(Number(opts.amountPaidCents) || 0));
  return {
    subtotalCents,
    discountCents,
    gstCents,
    totalCents: discountCents ? Math.max(0, subtotalCents + gstCents - discountCents) : totalCents,
    amountPaidCents,
    balanceDueCents: Math.max(
      0,
      (discountCents ? Math.max(0, subtotalCents + gstCents - discountCents) : totalCents) -
        amountPaidCents,
    ),
  };
}
