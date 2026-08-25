/**
 * Accounting Documents V1 — A4 PDF from issued snapshot (pdfkit).
 * Authoritative source is the snapshot object — never live Business/catalog rows.
 */

import PDFDocument from 'pdfkit';
import { formatCents } from './money.js';
import { DOC_TYPE } from './constants.js';

function fmtDate(d) {
  if (!d) return '—';
  const x = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(x.getTime())) return '—';
  return x.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' });
}

function money(cents, currency) {
  return formatCents(Number(cents) || 0, currency || 'AUD');
}

/**
 * @param {object} snapshot — AccountingDocument.issuedSnapshot
 * @returns {Promise<Buffer>}
 */
export function renderAccountingDocumentPdf(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    return Promise.reject(Object.assign(new Error('snapshot_required'), { status: 400 }));
  }

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 48, bottom: 56, left: 48, right: 48 },
        bufferPages: true,
        autoFirstPage: true,
        info: {
          Title: `${snapshot.documentNumber || 'Document'}`,
          Author: snapshot.supplier?.legalBusinessName || 'Cardbey',
          Creator: 'Cardbey Accounting Documents V1',
          // Stable for snapshot integrity comparisons
          CreationDate: new Date('2026-01-01T00:00:00.000Z'),
          ModDate: new Date('2026-01-01T00:00:00.000Z'),
        },
      });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const supplier = snapshot.supplier || {};
      const buyer = snapshot.buyer || {};
      const lines = Array.isArray(snapshot.lines) ? snapshot.lines : [];
      const totals = snapshot.totals || {};
      const currency = snapshot.currency || 'AUD';
      const isInvoice = snapshot.type === DOC_TYPE.INVOICE;
      const title = snapshot.taxInvoiceLabel
        ? 'TAX INVOICE'
        : isInvoice
          ? 'INVOICE'
          : 'QUOTE';

      const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      let y = doc.page.margins.top;

      const ensureSpace = (need) => {
        const bottom = doc.page.height - doc.page.margins.bottom;
        if (y + need > bottom) {
          doc.addPage();
          y = doc.page.margins.top;
        }
      };

      doc.fontSize(18).font('Helvetica-Bold').text(title, { continued: false });
      y = doc.y + 4;
      doc
        .fontSize(11)
        .font('Helvetica')
        .fillColor('#334155')
        .text(String(snapshot.documentNumber || 'DRAFT'), doc.page.margins.left, y);
      y = doc.y + 12;
      doc.fillColor('#0f172a');

      const colW = pageWidth / 2 - 8;
      const leftX = doc.page.margins.left;
      const rightX = leftX + colW + 16;
      const blockTop = y;

      doc.fontSize(9).fillColor('#64748b').text('SUPPLIER', leftX, blockTop);
      doc
        .fontSize(11)
        .fillColor('#0f172a')
        .font('Helvetica-Bold')
        .text(supplier.legalBusinessName || supplier.tradingName || '—', leftX, blockTop + 12, {
          width: colW,
        });
      let ly = doc.y + 2;
      doc.font('Helvetica').fontSize(9).fillColor('#334155');
      if (supplier.tradingName && supplier.tradingName !== supplier.legalBusinessName) {
        doc.text(supplier.tradingName, leftX, ly, { width: colW });
        ly = doc.y;
      }
      if (supplier.abn) {
        doc.text(`ABN ${supplier.abn}`, leftX, ly, { width: colW });
        ly = doc.y;
      }
      if (supplier.acn) {
        doc.text(`ACN ${supplier.acn}`, leftX, ly, { width: colW });
        ly = doc.y;
      }
      if (supplier.billingAddress) {
        doc.text(String(supplier.billingAddress), leftX, ly, { width: colW });
        ly = doc.y;
      }
      const contact = [supplier.billingEmail, supplier.billingPhone].filter(Boolean).join(' · ');
      if (contact) {
        doc.text(contact, leftX, ly, { width: colW });
        ly = doc.y;
      }

      doc.fontSize(9).fillColor('#64748b').text('CUSTOMER', rightX, blockTop);
      doc
        .fontSize(11)
        .fillColor('#0f172a')
        .font('Helvetica-Bold')
        .text(buyer.name || '—', rightX, blockTop + 12, { width: colW });
      let ry = doc.y + 2;
      doc.font('Helvetica').fontSize(9).fillColor('#334155');
      if (buyer.abn) {
        doc.text(`ABN ${buyer.abn}`, rightX, ry, { width: colW });
        ry = doc.y;
      }
      if (buyer.billingAddress) {
        doc.text(String(buyer.billingAddress), rightX, ry, { width: colW });
        ry = doc.y;
      }
      const bContact = [buyer.email, buyer.phone].filter(Boolean).join(' · ');
      if (bContact) {
        doc.text(bContact, rightX, ry, { width: colW });
        ry = doc.y;
      }
      ry += 6;
      doc.text(`Issue date: ${fmtDate(snapshot.issueDate)}`, rightX, ry, { width: colW });
      ry = doc.y;
      if (isInvoice) {
        doc.text(`Due date: ${fmtDate(snapshot.dueDate)}`, rightX, ry, { width: colW });
      } else {
        doc.text(`Valid until: ${fmtDate(snapshot.expiryDate)}`, rightX, ry, { width: colW });
      }
      ry = doc.y;
      if (snapshot.purchaseOrderRef) {
        doc.text(`PO / Ref: ${snapshot.purchaseOrderRef}`, rightX, ry, { width: colW });
        ry = doc.y;
      }

      y = Math.max(ly, ry) + 16;
      doc.fillColor('#0f172a');

      // Table header
      const cols = [
        { key: 'sku', label: 'SKU', w: 52 },
        { key: 'item', label: 'Item / Description', w: 170 },
        { key: 'qty', label: 'Qty', w: 36, align: 'right' },
        { key: 'price', label: 'Price', w: 58, align: 'right' },
        { key: 'gst', label: 'GST', w: 50, align: 'right' },
        { key: 'total', label: 'Total', w: 58, align: 'right' },
      ];
      const drawHeader = () => {
        ensureSpace(28);
        let x = leftX;
        doc.fontSize(8).font('Helvetica-Bold').fillColor('#64748b');
        for (const c of cols) {
          doc.text(c.label, x, y, { width: c.w, align: c.align || 'left' });
          x += c.w;
        }
        y += 14;
        doc
          .moveTo(leftX, y)
          .lineTo(leftX + pageWidth, y)
          .strokeColor('#e2e8f0')
          .stroke();
        y += 6;
        doc.fillColor('#0f172a').font('Helvetica');
      };
      drawHeader();

      for (const line of lines) {
        const name = String(line.name || '');
        const desc = line.description ? String(line.description) : '';
        const itemText = desc ? `${name}\n${desc}` : name;
        const rowH = Math.max(
          18,
          doc.heightOfString(itemText, { width: cols[1].w, fontSize: 9 }) + 6,
        );
        ensureSpace(rowH + 8);
        if (y === doc.page.margins.top) drawHeader();

        let x = leftX;
        const rowY = y;
        doc.fontSize(9).font('Helvetica');
        doc.text(String(line.sku || '—'), x, rowY, { width: cols[0].w });
        x += cols[0].w;
        doc.font('Helvetica-Bold').text(name, x, rowY, { width: cols[1].w });
        if (desc) {
          doc.font('Helvetica').fillColor('#64748b').text(desc, x, doc.y, { width: cols[1].w });
          doc.fillColor('#0f172a');
        }
        x += cols[1].w;
        doc.font('Helvetica').text(String(line.quantity ?? ''), x, rowY, {
          width: cols[2].w,
          align: 'right',
        });
        x += cols[2].w;
        doc.text(money(line.unitPriceCents, currency), x, rowY, {
          width: cols[3].w,
          align: 'right',
        });
        x += cols[3].w;
        doc.text(money(line.lineGstCents, currency), x, rowY, {
          width: cols[4].w,
          align: 'right',
        });
        x += cols[4].w;
        doc.text(money(line.lineTotalCents, currency), x, rowY, {
          width: cols[5].w,
          align: 'right',
        });
        y = Math.max(y + rowH, doc.y + 4);
        doc
          .moveTo(leftX, y)
          .lineTo(leftX + pageWidth, y)
          .strokeColor('#f1f5f9')
          .stroke();
        y += 4;
      }

      y += 8;
      ensureSpace(70);
      doc
        .fontSize(9)
        .fillColor('#475569')
        .text(
          `Prices are ${String(snapshot.gstMode || '').replace(/_/g, ' ').toLowerCase()} · ${currency}`,
          leftX,
          y,
        );
      y = doc.y + 10;

      const totalsX = leftX + pageWidth - 200;
      const row = (label, value, bold = false) => {
        ensureSpace(16);
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 11 : 10).fillColor('#0f172a');
        doc.text(label, totalsX, y, { width: 100 });
        doc.text(value, totalsX + 100, y, { width: 100, align: 'right' });
        y += bold ? 18 : 14;
      };
      row('Subtotal', money(totals.subtotalCents, currency));
      row('GST', money(totals.gstCents, currency));
      row(isInvoice ? 'TOTAL DUE' : 'TOTAL', money(totals.totalCents, currency), true);

      if (isInvoice && supplier.bankAccountName) {
        y += 10;
        ensureSpace(80);
        doc.fontSize(10).font('Helvetica-Bold').text('PAYMENT DETAILS', leftX, y);
        y = doc.y + 4;
        doc.font('Helvetica').fontSize(9).fillColor('#334155');
        const payLines = [
          `Account Name: ${supplier.bankAccountName}`,
          `BSB: ${supplier.bsb || '—'}`,
          `Account Number: ${supplier.accountNumber || '—'}`,
          supplier.bankName ? `Bank: ${supplier.bankName}` : null,
          `Reference: Please use ${snapshot.documentNumber || 'invoice number'}.`,
          supplier.paymentReferenceInstructions || null,
        ].filter(Boolean);
        for (const p of payLines) {
          ensureSpace(14);
          doc.text(p, leftX, y, { width: pageWidth });
          y = doc.y + 2;
        }
        doc.fillColor('#0f172a');
      }

      if (snapshot.notes) {
        y += 8;
        ensureSpace(40);
        doc.fontSize(10).font('Helvetica-Bold').text('NOTES', leftX, y);
        y = doc.y + 2;
        doc.font('Helvetica').fontSize(9).text(String(snapshot.notes), leftX, y, { width: pageWidth });
        y = doc.y + 6;
      }
      if (snapshot.terms) {
        ensureSpace(40);
        doc.fontSize(10).font('Helvetica-Bold').text('TERMS', leftX, y);
        y = doc.y + 2;
        doc.font('Helvetica').fontSize(9).text(String(snapshot.terms), leftX, y, { width: pageWidth });
      }

      const pageCount = doc.bufferedPageRange().count;
      for (let i = 0; i < pageCount; i += 1) {
        doc.switchToPage(i);
        doc
          .fontSize(8)
          .fillColor('#94a3b8')
          .text(
            `Generated with Cardbey · Page ${i + 1} of ${pageCount}`,
            doc.page.margins.left,
            doc.page.height - 40,
            { width: pageWidth, align: 'center' },
          );
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
