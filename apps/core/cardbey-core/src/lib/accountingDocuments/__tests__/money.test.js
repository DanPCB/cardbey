import { describe, expect, it } from 'vitest';
import {
  calculateDocumentTotals,
  calculateLineTotals,
  formatCents,
  GST_MODE,
  toCents,
} from './money.js';

describe('accountingDocuments money', () => {
  it('Scenario A — GST exclusive 2 × $500', () => {
    const line = calculateLineTotals({
      quantity: 2,
      unitPriceCents: toCents(500),
      gstMode: GST_MODE.GST_EXCLUSIVE,
      gstRegistered: true,
    });
    expect(line.lineSubtotalCents).toBe(100000);
    expect(line.lineGstCents).toBe(10000);
    expect(line.lineTotalCents).toBe(110000);
    const totals = calculateDocumentTotals([line]);
    expect(totals.subtotalCents).toBe(100000);
    expect(totals.gstCents).toBe(10000);
    expect(totals.totalCents).toBe(110000);
    expect(formatCents(totals.totalCents)).toBe('$1100.00');
  });

  it('GST inclusive extracts component', () => {
    const line = calculateLineTotals({
      quantity: 1,
      unitPriceCents: toCents(110),
      gstMode: GST_MODE.GST_INCLUDED,
      gstRegistered: true,
    });
    expect(line.lineTotalCents).toBe(11000);
    expect(line.lineGstCents).toBe(1000);
    expect(line.lineSubtotalCents).toBe(10000);
  });

  it('GST free when not registered', () => {
    const line = calculateLineTotals({
      quantity: 3,
      unitPriceCents: toCents(100),
      gstMode: GST_MODE.GST_EXCLUSIVE,
      gstRegistered: false,
    });
    expect(line.lineGstCents).toBe(0);
    expect(line.lineTotalCents).toBe(30000);
  });

  it('handles $0.01 and multi-qty', () => {
    const line = calculateLineTotals({
      quantity: 3,
      unitPriceCents: 1,
      gstMode: GST_MODE.GST_EXCLUSIVE,
    });
    expect(line.lineSubtotalCents).toBe(3);
    expect(line.lineGstCents).toBe(0); // roundHalfUp(3*1000/10000)=0
  });

  it('Performer scenario C — 5 × $300 + GST', () => {
    const line = calculateLineTotals({
      quantity: 5,
      unitPriceCents: toCents(300),
      gstMode: GST_MODE.GST_EXCLUSIVE,
    });
    const totals = calculateDocumentTotals([line]);
    expect(totals.subtotalCents).toBe(150000);
    expect(totals.gstCents).toBe(15000);
    expect(totals.totalCents).toBe(165000);
  });
});
