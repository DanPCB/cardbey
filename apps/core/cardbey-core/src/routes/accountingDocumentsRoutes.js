/**
 * Accounting Documents V1 routes — owner + public share.
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { Features } from '../config/features.js';
import { renderAccountingDocumentHtml } from '../lib/accountingDocuments/renderHtml.js';
import { getPrismaClient } from '../lib/prisma.js';
import { DOC_TYPE } from '../lib/accountingDocuments/constants.js';
import {
  acceptQuote,
  convertQuoteToInvoice,
  createDocumentDraft,
  createShareToken,
  declineQuote,
  getDocument,
  getDocumentByShareToken,
  getOrCreateBillingProfile,
  issueDocument,
  listDocuments,
  markInvoicePaid,
  publicBillingSlice,
  renderIssuedDocumentPdfBuffer,
  updateBillingProfile,
  updateDocumentDraft,
} from '../lib/accountingDocuments/documentService.js';

const ownerRouter = Router({ mergeParams: true });
const publicRouter = Router();

function flagGate(req, res, next) {
  if (!Features.accountingDocuments?.v1) {
    return res.status(404).json({ ok: false, error: 'accounting_documents_disabled' });
  }
  next();
}

async function requireStoreOwner(req, res, next) {
  try {
    const storeId = String(req.params.storeId ?? '').trim();
    if (!storeId) return res.status(400).json({ ok: false, error: 'storeId required' });
    const prisma = getPrismaClient();
    const store = await prisma.business.findUnique({
      where: { id: storeId },
      select: { id: true, userId: true, name: true },
    });
    if (!store) return res.status(404).json({ ok: false, error: 'store_not_found' });
    if (store.userId !== req.userId) {
      return res.status(403).json({ ok: false, error: 'forbidden' });
    }
    req.storeRecord = store;
    next();
  } catch (err) {
    next(err);
  }
}

function handleErr(res, err) {
  const status = err.status || 500;
  return res.status(status).json({ ok: false, error: err.message || 'error' });
}

ownerRouter.use(flagGate, requireAuth, requireStoreOwner);

ownerRouter.get('/billing-profile', async (req, res) => {
  try {
    const profile = await getOrCreateBillingProfile(req.params.storeId, req.userId);
    res.json({ ok: true, profile });
  } catch (err) {
    handleErr(res, err);
  }
});

ownerRouter.patch('/billing-profile', async (req, res) => {
  try {
    const profile = await updateBillingProfile(req.params.storeId, req.userId, req.body || {});
    res.json({ ok: true, profile });
  } catch (err) {
    handleErr(res, err);
  }
});

ownerRouter.get('/documents', async (req, res) => {
  try {
    const docs = await listDocuments(req.params.storeId, req.userId, {
      type: req.query.type || undefined,
      status: req.query.status || undefined,
    });
    res.json({ ok: true, documents: docs });
  } catch (err) {
    handleErr(res, err);
  }
});

ownerRouter.post('/documents', async (req, res) => {
  try {
    const body = req.body || {};
    const doc = await createDocumentDraft({
      storeId: req.params.storeId,
      actorUserId: req.userId,
      type: body.type || DOC_TYPE.QUOTE,
      buyer: body.buyer,
      lines: body.lines,
      notes: body.notes,
      terms: body.terms,
      purchaseOrderRef: body.purchaseOrderRef,
      quoteRequestId: body.quoteRequestId,
      gstMode: body.gstMode,
    });
    res.status(201).json({ ok: true, document: doc });
  } catch (err) {
    handleErr(res, err);
  }
});

ownerRouter.get('/documents/:documentId', async (req, res) => {
  try {
    const doc = await getDocument(req.params.storeId, req.params.documentId, req.userId);
    res.json({ ok: true, document: doc });
  } catch (err) {
    handleErr(res, err);
  }
});

ownerRouter.patch('/documents/:documentId', async (req, res) => {
  try {
    const doc = await updateDocumentDraft(
      req.params.storeId,
      req.params.documentId,
      req.userId,
      req.body || {},
    );
    res.json({ ok: true, document: doc });
  } catch (err) {
    handleErr(res, err);
  }
});

/** HIGH IMPACT — client must confirm before calling. */
ownerRouter.post('/documents/:documentId/issue', async (req, res) => {
  try {
    const doc = await issueDocument(req.params.storeId, req.params.documentId, req.userId);
    res.json({ ok: true, document: doc });
  } catch (err) {
    handleErr(res, err);
  }
});

ownerRouter.post('/documents/:documentId/accept', async (req, res) => {
  try {
    const doc = await acceptQuote(req.params.storeId, req.params.documentId, {
      userId: req.userId,
    });
    res.json({ ok: true, document: doc });
  } catch (err) {
    handleErr(res, err);
  }
});

ownerRouter.post('/documents/:documentId/decline', async (req, res) => {
  try {
    const doc = await declineQuote(req.params.storeId, req.params.documentId, {
      userId: req.userId,
    });
    res.json({ ok: true, document: doc });
  } catch (err) {
    handleErr(res, err);
  }
});

ownerRouter.post('/documents/:documentId/convert-to-invoice', async (req, res) => {
  try {
    const invoice = await convertQuoteToInvoice(
      req.params.storeId,
      req.params.documentId,
      req.userId,
    );
    res.status(201).json({ ok: true, document: invoice });
  } catch (err) {
    handleErr(res, err);
  }
});

ownerRouter.post('/documents/:documentId/mark-paid', async (req, res) => {
  try {
    const doc = await markInvoicePaid(req.params.storeId, req.params.documentId, req.userId);
    res.json({ ok: true, document: doc });
  } catch (err) {
    handleErr(res, err);
  }
});

ownerRouter.post('/documents/:documentId/share', async (req, res) => {
  try {
    const share = await createShareToken(req.params.storeId, req.params.documentId, req.userId);
    res.status(201).json({
      ok: true,
      share: {
        token: share.token,
        expiresAt: share.expiresAt,
        path: `/d/${share.token}`,
      },
    });
  } catch (err) {
    handleErr(res, err);
  }
});

ownerRouter.get('/documents/:documentId/preview.html', async (req, res) => {
  try {
    const doc = await getDocument(req.params.storeId, req.params.documentId, req.userId);
    const profile = await getOrCreateBillingProfile(req.params.storeId, req.userId);
    const snapshot =
      doc.issuedSnapshot ||
      {
        type: doc.type,
        documentNumber: doc.documentNumber,
        currency: doc.currency,
        gstMode: doc.gstMode,
        supplier: publicBillingSlice(profile, { includeBank: doc.type === DOC_TYPE.INVOICE }),
        buyer: doc.buyerJson,
        lines: doc.lines,
        totals: {
          subtotalCents: doc.subtotalCents,
          gstCents: doc.gstCents,
          totalCents: doc.totalCents,
        },
        notes: doc.notes,
        terms: doc.terms,
        issueDate: doc.issueDate,
        expiryDate: doc.expiryDate,
        dueDate: doc.dueDate,
        purchaseOrderRef: doc.purchaseOrderRef,
        taxInvoiceLabel: Boolean(profile.gstRegistered && doc.type === DOC_TYPE.INVOICE),
      };
    const html = renderAccountingDocumentHtml(snapshot);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    handleErr(res, err);
  }
});

/** Issued PDF — snapshot only. */
ownerRouter.get('/documents/:documentId/pdf', async (req, res) => {
  try {
    const doc = await getDocument(req.params.storeId, req.params.documentId, req.userId);
    const buf = await renderIssuedDocumentPdfBuffer(doc);
    const name = `${doc.documentNumber || doc.id}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    res.send(buf);
  } catch (err) {
    handleErr(res, err);
  }
});

publicRouter.use(flagGate);

publicRouter.get('/accounting-documents/:token', async (req, res) => {
  try {
    const { document, snapshot } = await getDocumentByShareToken(req.params.token);
    res.json({
      ok: true,
      document: {
        id: document.id,
        type: document.type,
        status: document.status,
        documentNumber: document.documentNumber,
      },
      snapshot,
    });
  } catch (err) {
    handleErr(res, err);
  }
});

publicRouter.get('/accounting-documents/:token/preview.html', async (req, res) => {
  try {
    const { snapshot } = await getDocumentByShareToken(req.params.token);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(renderAccountingDocumentHtml(snapshot));
  } catch (err) {
    handleErr(res, err);
  }
});

publicRouter.get('/accounting-documents/:token/pdf', async (req, res) => {
  try {
    const { document, snapshot } = await getDocumentByShareToken(req.params.token);
    const { renderAccountingDocumentPdf } = await import(
      '../lib/accountingDocuments/renderPdf.js'
    );
    const buf = await renderAccountingDocumentPdf(snapshot);
    const name = `${document.documentNumber || 'document'}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    res.send(buf);
  } catch (err) {
    handleErr(res, err);
  }
});

publicRouter.post('/accounting-documents/:token/accept', async (req, res) => {
  try {
    const { document } = await getDocumentByShareToken(req.params.token);
    const updated = await acceptQuote(document.storeId, document.id, {}, { viaShareToken: true });
    res.json({ ok: true, document: { id: updated.id, status: updated.status } });
  } catch (err) {
    handleErr(res, err);
  }
});

publicRouter.post('/accounting-documents/:token/decline', async (req, res) => {
  try {
    const { document } = await getDocumentByShareToken(req.params.token);
    const updated = await declineQuote(document.storeId, document.id, {}, { viaShareToken: true });
    res.json({ ok: true, document: { id: updated.id, status: updated.status } });
  } catch (err) {
    handleErr(res, err);
  }
});

export { ownerRouter as accountingDocumentsOwnerRoutes, publicRouter as accountingDocumentsPublicRoutes };
