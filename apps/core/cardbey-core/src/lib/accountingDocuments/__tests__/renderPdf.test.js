import { describe, expect, it } from 'vitest';
import { renderAccountingDocumentPdf } from '../renderPdf.js';
import { DOC_TYPE } from '../constants.js';

function sampleSnapshot(overrides = {}) {
  return {
    type: DOC_TYPE.INVOICE,
    documentNumber: 'INV-000001',
    currency: 'AUD',
    gstMode: 'GST_EXCLUSIVE',
    taxInvoiceLabel: true,
    issueDate: '2026-08-01T00:00:00.000Z',
    dueDate: '2026-08-15T00:00:00.000Z',
    supplier: {
      legalBusinessName: 'ABC Signs Pty Ltd',
      abn: '51824753556',
      billingAddress: '1 Old Street, Melbourne VIC 3000',
      bankAccountName: 'ABC Signs Pty Ltd',
      bsb: '063-000',
      accountNumber: '12345678',
    },
    buyer: { name: 'XYZ Cafe Pty Ltd', billingAddress: '2 Cafe Rd' },
    lines: [
      {
        sku: 'SIGN001',
        name: 'Outdoor sign',
        description: '1200x600',
        quantity: 2,
        unitPriceCents: 50000,
        lineSubtotalCents: 100000,
        lineGstCents: 10000,
        lineTotalCents: 110000,
      },
    ],
    totals: { subtotalCents: 100000, gstCents: 10000, totalCents: 110000 },
    notes: 'Thanks',
    terms: 'Net 14',
    ...overrides,
  };
}

describe('renderAccountingDocumentPdf', () => {
  it('returns a PDF buffer starting with %PDF', async () => {
    const buf = await renderAccountingDocumentPdf(sampleSnapshot());
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.slice(0, 4).toString('utf8')).toBe('%PDF');
    expect(buf.length).toBeGreaterThan(500);
  });

  it('snapshot integrity: PDF follows snapshot only; live profile mutation is irrelevant', async () => {
    const snap = sampleSnapshot();
    const pdfA = await renderAccountingDocumentPdf(snap);
    // Live profile changed after issue — caller must still pass frozen snap
    const pdfB = await renderAccountingDocumentPdf({ ...snap });
    expect(pdfA.equals(pdfB)).toBe(true);

    const snapAfterBusinessChange = sampleSnapshot({
      supplier: {
        ...snap.supplier,
        billingAddress: '99 New Street, Melbourne VIC 3000',
        bankAccountName: 'NEW ACCOUNT',
        accountNumber: '99999999',
      },
    });
    const pdfChanged = await renderAccountingDocumentPdf(snapAfterBusinessChange);
    expect(pdfA.equals(pdfChanged)).toBe(false);
  });
  it('renders multi-line documents without throwing', async () => {
    const lines = Array.from({ length: 14 }, (_, i) => ({
      sku: `SKU${i}`,
      name: `Item ${i}`,
      description: `Desc ${i} `.repeat(8),
      quantity: 1,
      unitPriceCents: 999,
      lineSubtotalCents: 999,
      lineGstCents: 100,
      lineTotalCents: 1099,
    }));
    const buf = await renderAccountingDocumentPdf(
      sampleSnapshot({
        lines,
        totals: { subtotalCents: 999 * 14, gstCents: 100 * 14, totalCents: 1099 * 14 },
      }),
    );
    expect(buf.slice(0, 4).toString()).toBe('%PDF');
  });
});
