/**
 * HTML document body for preview / PDF (A4-friendly). Uses issuedSnapshot when present.
 */

import { formatCents } from './money.js';
import { DOC_TYPE } from './constants.js';

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtDate(d) {
  if (!d) return '—';
  const x = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(x.getTime())) return '—';
  return x.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * @param {object} snapshot — issuedSnapshot or live projection
 */
export function renderAccountingDocumentHtml(snapshot) {
  const supplier = snapshot.supplier || {};
  const buyer = snapshot.buyer || {};
  const lines = snapshot.lines || [];
  const totals = snapshot.totals || {};
  const isInvoice = snapshot.type === DOC_TYPE.INVOICE;
  const title = snapshot.taxInvoiceLabel
    ? 'TAX INVOICE'
    : isInvoice
      ? 'INVOICE'
      : 'QUOTE';
  const currency = snapshot.currency || 'AUD';

  const rows = lines
    .map(
      (l) => `
    <tr>
      <td>${esc(l.sku || '—')}</td>
      <td><strong>${esc(l.name)}</strong>${l.description ? `<div class="muted">${esc(l.description)}</div>` : ''}</td>
      <td class="num">${esc(l.quantity)}</td>
      <td class="num">${esc(formatCents(l.unitPriceCents, currency))}</td>
      <td class="num">${esc(formatCents(l.lineGstCents, currency))}</td>
      <td class="num">${esc(formatCents(l.lineTotalCents, currency))}</td>
    </tr>`,
    )
    .join('');

  const bank =
    isInvoice && supplier.bankAccountName
      ? `
    <section class="block">
      <h2>Payment details</h2>
      <p>Account Name: ${esc(supplier.bankAccountName)}<br/>
      BSB: ${esc(supplier.bsb || '—')}<br/>
      Account Number: ${esc(supplier.accountNumber || '—')}<br/>
      ${supplier.bankName ? `Bank: ${esc(supplier.bankName)}<br/>` : ''}
      Reference: Please use ${esc(snapshot.documentNumber || 'invoice number')}.
      ${supplier.paymentReferenceInstructions ? `<br/>${esc(supplier.paymentReferenceInstructions)}` : ''}
      </p>
    </section>`
      : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>${esc(title)} ${esc(snapshot.documentNumber || '')}</title>
<style>
  @page { size: A4; margin: 18mm; }
  body { font-family: "Segoe UI", Helvetica, Arial, sans-serif; color: #0f172a; font-size: 12px; }
  h1 { font-size: 22px; margin: 0 0 4px; letter-spacing: 0.04em; }
  h2 { font-size: 13px; margin: 18px 0 6px; text-transform: uppercase; letter-spacing: 0.06em; color: #475569; }
  .muted { color: #64748b; font-size: 11px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 16px; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  th, td { border-bottom: 1px solid #e2e8f0; padding: 8px 6px; text-align: left; vertical-align: top; }
  th { font-size: 10px; text-transform: uppercase; color: #64748b; }
  .num { text-align: right; white-space: nowrap; }
  .totals { margin-top: 12px; width: 240px; margin-left: auto; }
  .totals div { display: flex; justify-content: space-between; padding: 4px 0; }
  .totals .grand { font-weight: 700; font-size: 14px; border-top: 2px solid #0f172a; margin-top: 6px; padding-top: 8px; }
  .logo { max-height: 48px; margin-bottom: 8px; }
  .block { margin-top: 16px; }
  .gst-note { margin-top: 8px; font-size: 11px; color: #475569; }
</style>
</head>
<body>
  ${supplier.logoUrl ? `<img class="logo" src="${esc(supplier.logoUrl)}" alt=""/>` : ''}
  <h1>${esc(title)}</h1>
  <div class="muted">${esc(snapshot.documentNumber || 'DRAFT')}</div>
  <div class="grid">
    <div>
      <h2>Supplier</h2>
      <strong>${esc(supplier.legalBusinessName || supplier.tradingName || '')}</strong>
      ${supplier.tradingName && supplier.tradingName !== supplier.legalBusinessName ? `<div>${esc(supplier.tradingName)}</div>` : ''}
      ${supplier.abn ? `<div>ABN ${esc(supplier.abn)}</div>` : ''}
      ${supplier.acn ? `<div>ACN ${esc(supplier.acn)}</div>` : ''}
      <div class="muted">${esc(supplier.billingAddress || '')}</div>
      <div class="muted">${esc(supplier.billingEmail || '')} ${esc(supplier.billingPhone || '')}</div>
    </div>
    <div>
      <h2>Customer</h2>
      <strong>${esc(buyer.name || '')}</strong>
      ${buyer.abn ? `<div>ABN ${esc(buyer.abn)}</div>` : ''}
      <div class="muted">${esc(buyer.billingAddress || '')}</div>
      <div class="muted">${esc(buyer.email || '')} ${esc(buyer.phone || '')}</div>
      <div style="margin-top:10px">
        <div>Issue date: ${esc(fmtDate(snapshot.issueDate))}</div>
        ${
          isInvoice
            ? `<div>Due date: ${esc(fmtDate(snapshot.dueDate))}</div>`
            : `<div>Valid until: ${esc(fmtDate(snapshot.expiryDate))}</div>`
        }
        ${snapshot.purchaseOrderRef ? `<div>PO / Ref: ${esc(snapshot.purchaseOrderRef)}</div>` : ''}
      </div>
    </div>
  </div>
  <table>
    <thead>
      <tr>
        <th>SKU</th><th>Item / Description</th><th class="num">Qty</th>
        <th class="num">Price</th><th class="num">GST</th><th class="num">Total</th>
      </tr>
    </thead>
    <tbody>${rows || '<tr><td colspan="6">No line items</td></tr>'}</tbody>
  </table>
  <div class="gst-note">Prices are ${esc(String(snapshot.gstMode || '').replace(/_/g, ' ').toLowerCase())} · Currency ${esc(currency)}</div>
  <div class="totals">
    <div><span>Subtotal</span><span>${esc(formatCents(totals.subtotalCents, currency))}</span></div>
    <div><span>GST</span><span>${esc(formatCents(totals.gstCents, currency))}</span></div>
    <div class="grand"><span>${isInvoice ? 'TOTAL DUE' : 'TOTAL'}</span><span>${esc(formatCents(totals.totalCents, currency))}</span></div>
  </div>
  ${bank}
  ${snapshot.notes ? `<section class="block"><h2>Notes</h2><p>${esc(snapshot.notes)}</p></section>` : ''}
  ${snapshot.terms ? `<section class="block"><h2>Terms</h2><p>${esc(snapshot.terms)}</p></section>` : ''}
  <p class="muted" style="margin-top:28px">Generated with Cardbey · Page 1</p>
</body>
</html>`;
}
