/**
 * AccountingDocumentsCapability — draft / issue / accept / convert.
 * Authoritative totals from money.js. Issued snapshots are immutable.
 */

import { randomBytes } from 'node:crypto';
import { getPrismaClient } from '../prisma.js';
import { Features } from '../../config/features.js';
import {
  ACCOUNTING_EVENTS,
  DOC_TYPE,
  INVOICE_STATUS,
  QUOTE_STATUS,
} from './constants.js';
import { allocateDocumentNumber } from './numbering.js';
import { calculateDocumentTotals, calculateLineTotals, GST_MODE, toCents } from './money.js';
import {
  formatBsb,
  isValidAbnFormat,
  isValidAcnFormat,
  isValidBankAccountFormat,
  isValidBsbFormat,
  isValidEmail,
} from './validate.js';

function assertEnabled() {
  if (!Features.accountingDocuments?.v1) {
    const err = new Error('accounting_documents_disabled');
    err.status = 404;
    throw err;
  }
}

function prismaOrThrow() {
  const prisma = getPrismaClient();
  if (!prisma?.accountingDocument) {
    const err = new Error('accounting_documents_schema_missing');
    err.status = 503;
    throw err;
  }
  return prisma;
}

async function emitEvent(prisma, { storeId, eventType, aggregateId, actorUserId, payload }) {
  try {
    await prisma.businessEvent.create({
      data: {
        storeId,
        eventType,
        aggregateType: 'AccountingDocument',
        aggregateId,
        actorUserId: actorUserId || null,
        payload: payload || {},
      },
    });
  } catch {
    // BusinessEvent may be unavailable in thin schemas — soft fail
  }
}

function normalizeBuyer(buyer = {}) {
  const email = buyer.email ? String(buyer.email).trim() : null;
  if (email && !isValidEmail(email)) throw Object.assign(new Error('invalid_buyer_email'), { status: 400 });
  if (buyer.abn && !isValidAbnFormat(buyer.abn)) {
    throw Object.assign(new Error('invalid_buyer_abn_format'), { status: 400 });
  }
  if (buyer.acn && !isValidAcnFormat(buyer.acn)) {
    throw Object.assign(new Error('invalid_buyer_acn_format'), { status: 400 });
  }
  return {
    name: String(buyer.name || buyer.businessName || '').trim() || null,
    tradingName: buyer.tradingName ? String(buyer.tradingName).trim() : null,
    abn: buyer.abn ? String(buyer.abn).trim() : null,
    acn: buyer.acn ? String(buyer.acn).trim() : null,
    billingAddress: buyer.billingAddress ? String(buyer.billingAddress).trim() : null,
    email,
    phone: buyer.phone ? String(buyer.phone).trim() : null,
    contactPerson: buyer.contactPerson ? String(buyer.contactPerson).trim() : null,
    commerceCustomerId: buyer.commerceCustomerId || null,
    crmContactId: buyer.crmContactId || null,
  };
}

function buildLines(rawLines, { gstMode, gstRegistered, gstBps }) {
  if (!Array.isArray(rawLines) || rawLines.length === 0) {
    return { lineRows: [], totals: calculateDocumentTotals([]) };
  }
  const lineRows = rawLines.map((raw, index) => {
    const unitPriceCents =
      raw.unitPriceCents != null ? Math.trunc(Number(raw.unitPriceCents)) : toCents(raw.unitPrice ?? raw.price);
    const calc = calculateLineTotals({
      quantity: raw.quantity ?? raw.qty ?? 1,
      unitPriceCents,
      gstMode,
      gstRegistered,
      gstBps,
    });
    return {
      sortOrder: index,
      sku: raw.sku ? String(raw.sku).trim() : null,
      name: String(raw.name || raw.item || 'Item').trim(),
      description: raw.description ? String(raw.description).trim() : null,
      quantity: calc.quantity,
      unitPriceCents: calc.unitPriceCents,
      lineSubtotalCents: calc.lineSubtotalCents,
      lineGstCents: calc.lineGstCents,
      lineTotalCents: calc.lineTotalCents,
      productId: raw.productId || null,
    };
  });
  const totals = calculateDocumentTotals(lineRows.map((l) => ({
    lineSubtotalCents: l.lineSubtotalCents,
    lineGstCents: l.lineGstCents,
    lineTotalCents: l.lineTotalCents,
  })));
  return { lineRows, totals };
}

export async function getOrCreateBillingProfile(storeId, actorUserId) {
  assertEnabled();
  const prisma = prismaOrThrow();
  const store = await prisma.business.findUnique({
    where: { id: storeId },
    select: {
      id: true,
      userId: true,
      name: true,
      email: true,
      phone: true,
      address: true,
      suburb: true,
      state: true,
      postcode: true,
      country: true,
      websiteUrl: true,
      logo: true,
    },
  });
  if (!store) throw Object.assign(new Error('store_not_found'), { status: 404 });
  if (actorUserId && store.userId !== actorUserId) {
    throw Object.assign(new Error('forbidden'), { status: 403 });
  }

  let profile = await prisma.businessBillingProfile.findUnique({ where: { storeId } });
  if (!profile) {
    let commerce = null;
    try {
      commerce = await prisma.commerceBusinessSettings.findUnique({ where: { storeId } });
    } catch {
      commerce = null;
    }
    profile = await prisma.businessBillingProfile.create({
      data: {
        storeId,
        legalBusinessName: store.name,
        billingEmail: store.email,
        billingPhone: store.phone,
        billingAddress: [store.address, store.suburb, store.state, store.postcode]
          .filter(Boolean)
          .join(', '),
        website: store.websiteUrl,
        gstRegistered: false,
        currency: commerce?.currency || 'AUD',
        defaultGstMode: commerce?.taxInclusive ? GST_MODE.GST_INCLUDED : GST_MODE.GST_EXCLUSIVE,
        defaultQuoteExpiryDays: 30,
        defaultPaymentTermsDays: 14,
      },
    });
  }
  return profile;
}

export async function updateBillingProfile(storeId, actorUserId, patch) {
  assertEnabled();
  const prisma = prismaOrThrow();
  await getOrCreateBillingProfile(storeId, actorUserId);

  if (patch.abn && !isValidAbnFormat(patch.abn)) {
    throw Object.assign(new Error('invalid_abn_format'), { status: 400 });
  }
  if (patch.acn && !isValidAcnFormat(patch.acn)) {
    throw Object.assign(new Error('invalid_acn_format'), { status: 400 });
  }
  if (patch.bsb && !isValidBsbFormat(patch.bsb)) {
    throw Object.assign(new Error('invalid_bsb_format'), { status: 400 });
  }
  if (patch.accountNumber && !isValidBankAccountFormat(patch.accountNumber)) {
    throw Object.assign(new Error('invalid_account_number_format'), { status: 400 });
  }

  const data = {};
  const fields = [
    'legalBusinessName',
    'tradingName',
    'abn',
    'acn',
    'billingAddress',
    'billingEmail',
    'billingPhone',
    'website',
    'logoUrl',
    'contactPerson',
    'gstRegistered',
    'currency',
    'defaultGstMode',
    'defaultQuoteExpiryDays',
    'defaultPaymentTermsDays',
    'defaultNotes',
    'defaultTerms',
    'bankAccountName',
    'bankName',
    'paymentReferenceInstructions',
  ];
  for (const f of fields) {
    if (patch[f] !== undefined) data[f] = patch[f];
  }
  if (patch.bsb !== undefined) data.bsb = formatBsb(patch.bsb);
  if (patch.accountNumber !== undefined) data.accountNumber = String(patch.accountNumber).replace(/\s+/g, '');

  return prisma.businessBillingProfile.update({ where: { storeId }, data });
}

/** Strip bank fields for non-owner responses. */
export function publicBillingSlice(profile, { includeBank = false } = {}) {
  if (!profile) return null;
  const base = {
    legalBusinessName: profile.legalBusinessName,
    tradingName: profile.tradingName,
    abn: profile.abn,
    acn: profile.acn,
    billingAddress: profile.billingAddress,
    billingEmail: profile.billingEmail,
    billingPhone: profile.billingPhone,
    website: profile.website,
    logoUrl: profile.logoUrl,
    contactPerson: profile.contactPerson,
    gstRegistered: profile.gstRegistered,
    currency: profile.currency,
  };
  if (!includeBank) return base;
  return {
    ...base,
    bankAccountName: profile.bankAccountName,
    bsb: profile.bsb,
    accountNumber: profile.accountNumber,
    bankName: profile.bankName,
    paymentReferenceInstructions: profile.paymentReferenceInstructions,
  };
}

export async function createDocumentDraft(input) {
  assertEnabled();
  const prisma = prismaOrThrow();
  const {
    storeId,
    actorUserId,
    type = DOC_TYPE.QUOTE,
    buyer,
    lines = [],
    notes,
    terms,
    purchaseOrderRef,
    quoteRequestId,
    gstMode: gstModeIn,
  } = input;

  if (type !== DOC_TYPE.QUOTE && type !== DOC_TYPE.INVOICE) {
    throw Object.assign(new Error('unsupported_document_type'), { status: 400 });
  }

  const profile = await getOrCreateBillingProfile(storeId, actorUserId);
  const gstMode = gstModeIn || profile.defaultGstMode || GST_MODE.GST_EXCLUSIVE;
  const { lineRows, totals } = buildLines(lines, {
    gstMode,
    gstRegistered: profile.gstRegistered,
  });

  const issueDate = new Date();
  let expiryDate = null;
  let dueDate = null;
  if (type === DOC_TYPE.QUOTE) {
    const days = profile.defaultQuoteExpiryDays || 30;
    expiryDate = new Date(issueDate.getTime() + days * 86400000);
  } else {
    const days = profile.defaultPaymentTermsDays || 14;
    dueDate = new Date(issueDate.getTime() + days * 86400000);
  }

  const doc = await prisma.accountingDocument.create({
    data: {
      storeId,
      type,
      status: type === DOC_TYPE.QUOTE ? QUOTE_STATUS.DRAFT : INVOICE_STATUS.DRAFT,
      currency: profile.currency || 'AUD',
      gstMode: profile.gstRegistered ? gstMode : GST_MODE.GST_FREE,
      issueDate,
      expiryDate,
      dueDate,
      purchaseOrderRef: purchaseOrderRef || null,
      notes: notes ?? profile.defaultNotes,
      terms: terms ?? profile.defaultTerms,
      buyerJson: normalizeBuyer(buyer || {}),
      quoteRequestId: quoteRequestId || null,
      subtotalCents: totals.subtotalCents,
      gstCents: totals.gstCents,
      totalCents: totals.totalCents,
      discountCents: totals.discountCents,
      amountPaidCents: 0,
      balanceDueCents: totals.totalCents,
      createdByUserId: actorUserId || null,
      lines: { create: lineRows },
    },
    include: { lines: { orderBy: { sortOrder: 'asc' } } },
  });

  await emitEvent(prisma, {
    storeId,
    eventType: type === DOC_TYPE.QUOTE ? ACCOUNTING_EVENTS.QUOTE_CREATED : ACCOUNTING_EVENTS.INVOICE_CREATED,
    aggregateId: doc.id,
    actorUserId,
    payload: { type, status: doc.status },
  });

  return doc;
}

export async function updateDocumentDraft(storeId, documentId, actorUserId, patch) {
  assertEnabled();
  const prisma = prismaOrThrow();
  const doc = await prisma.accountingDocument.findFirst({
    where: { storeId, id: documentId },
    include: { lines: true },
  });
  if (!doc) throw Object.assign(new Error('document_not_found'), { status: 404 });
  if (doc.status !== QUOTE_STATUS.DRAFT && doc.status !== INVOICE_STATUS.DRAFT) {
    throw Object.assign(new Error('document_not_editable'), { status: 409 });
  }

  const profile = await getOrCreateBillingProfile(storeId, actorUserId);
  const gstMode = patch.gstMode || doc.gstMode;
  const buyer = patch.buyer ? normalizeBuyer(patch.buyer) : doc.buyerJson;
  const rawLines = patch.lines || doc.lines.map((l) => ({
    sku: l.sku,
    name: l.name,
    description: l.description,
    quantity: l.quantity,
    unitPriceCents: l.unitPriceCents,
    productId: l.productId,
  }));
  const { lineRows, totals } = buildLines(rawLines, {
    gstMode,
    gstRegistered: profile.gstRegistered,
  });

  await prisma.accountingDocumentLine.deleteMany({ where: { documentId: doc.id } });
  const updated = await prisma.accountingDocument.update({
    where: { id: doc.id },
    data: {
      buyerJson: buyer,
      gstMode: profile.gstRegistered ? gstMode : GST_MODE.GST_FREE,
      notes: patch.notes !== undefined ? patch.notes : doc.notes,
      terms: patch.terms !== undefined ? patch.terms : doc.terms,
      purchaseOrderRef:
        patch.purchaseOrderRef !== undefined ? patch.purchaseOrderRef : doc.purchaseOrderRef,
      expiryDate: patch.expiryDate !== undefined ? new Date(patch.expiryDate) : doc.expiryDate,
      dueDate: patch.dueDate !== undefined ? new Date(patch.dueDate) : doc.dueDate,
      subtotalCents: totals.subtotalCents,
      gstCents: totals.gstCents,
      totalCents: totals.totalCents,
      discountCents: totals.discountCents,
      balanceDueCents: totals.totalCents,
      lines: { create: lineRows },
    },
    include: { lines: { orderBy: { sortOrder: 'asc' } } },
  });

  await emitEvent(prisma, {
    storeId,
    eventType: ACCOUNTING_EVENTS.QUOTE_UPDATED,
    aggregateId: doc.id,
    actorUserId,
    payload: { type: doc.type },
  });
  return updated;
}

function buildIssuedSnapshot(doc, profile) {
  return {
    issuedAt: new Date().toISOString(),
    documentNumber: doc.documentNumber,
    type: doc.type,
    currency: doc.currency,
    gstMode: doc.gstMode,
    supplier: publicBillingSlice(profile, { includeBank: doc.type === DOC_TYPE.INVOICE }),
    buyer: doc.buyerJson,
    lines: (doc.lines || []).map((l) => ({
      sku: l.sku,
      name: l.name,
      description: l.description,
      quantity: l.quantity,
      unitPriceCents: l.unitPriceCents,
      lineSubtotalCents: l.lineSubtotalCents,
      lineGstCents: l.lineGstCents,
      lineTotalCents: l.lineTotalCents,
    })),
    totals: {
      subtotalCents: doc.subtotalCents,
      gstCents: doc.gstCents,
      totalCents: doc.totalCents,
      discountCents: doc.discountCents,
      balanceDueCents: doc.balanceDueCents,
    },
    notes: doc.notes,
    terms: doc.terms,
    issueDate: doc.issueDate,
    expiryDate: doc.expiryDate,
    dueDate: doc.dueDate,
    purchaseOrderRef: doc.purchaseOrderRef,
    taxInvoiceLabel: Boolean(profile.gstRegistered && doc.type === DOC_TYPE.INVOICE),
  };
}

export async function issueDocument(storeId, documentId, actorUserId) {
  assertEnabled();
  const prisma = prismaOrThrow();
  const doc = await prisma.accountingDocument.findFirst({
    where: { storeId, id: documentId },
    include: { lines: { orderBy: { sortOrder: 'asc' } } },
  });
  if (!doc) throw Object.assign(new Error('document_not_found'), { status: 404 });
  if (doc.status !== QUOTE_STATUS.DRAFT && doc.status !== INVOICE_STATUS.DRAFT) {
    throw Object.assign(new Error('document_already_issued'), { status: 409 });
  }
  if (!doc.lines?.length) {
    throw Object.assign(new Error('document_requires_lines'), { status: 400 });
  }
  const buyer = doc.buyerJson || {};
  if (!buyer.name) {
    throw Object.assign(new Error('document_requires_buyer'), { status: 400 });
  }

  const profile = await getOrCreateBillingProfile(storeId, actorUserId);
  const documentNumber = await allocateDocumentNumber(prisma, storeId, doc.type);
  const issueDate = new Date();

  const withNumber = { ...doc, documentNumber, issueDate };
  const issuedSnapshot = buildIssuedSnapshot(withNumber, profile);

  const updated = await prisma.accountingDocument.update({
    where: { id: doc.id },
    data: {
      documentNumber,
      status: doc.type === DOC_TYPE.QUOTE ? QUOTE_STATUS.ISSUED : INVOICE_STATUS.ISSUED,
      issueDate,
      issuedSnapshot,
      issuedAt: issueDate,
    },
    include: { lines: { orderBy: { sortOrder: 'asc' } } },
  });

  await emitEvent(prisma, {
    storeId,
    eventType:
      doc.type === DOC_TYPE.QUOTE ? ACCOUNTING_EVENTS.QUOTE_ISSUED : ACCOUNTING_EVENTS.INVOICE_ISSUED,
    aggregateId: doc.id,
    actorUserId,
    payload: { documentNumber },
  });

  return updated;
}

export async function acceptQuote(storeId, documentId, actor, { viaShareToken = false } = {}) {
  assertEnabled();
  const prisma = prismaOrThrow();
  const doc = await prisma.accountingDocument.findFirst({
    where: { storeId, id: documentId, type: DOC_TYPE.QUOTE },
  });
  if (!doc) throw Object.assign(new Error('document_not_found'), { status: 404 });
  if (doc.status !== QUOTE_STATUS.ISSUED && doc.status !== QUOTE_STATUS.VIEWED) {
    throw Object.assign(new Error('quote_not_acceptable'), { status: 409 });
  }

  const updated = await prisma.accountingDocument.update({
    where: { id: doc.id },
    data: {
      status: QUOTE_STATUS.ACCEPTED,
      acceptedAt: new Date(),
      acceptedBy: viaShareToken ? 'customer' : 'owner',
      acceptedByUserId: actor?.userId || null,
    },
    include: { lines: { orderBy: { sortOrder: 'asc' } } },
  });

  await emitEvent(prisma, {
    storeId,
    eventType: ACCOUNTING_EVENTS.QUOTE_ACCEPTED,
    aggregateId: doc.id,
    actorUserId: actor?.userId,
    payload: { viaShareToken, acceptedBy: updated.acceptedBy },
  });
  return updated;
}

export async function declineQuote(storeId, documentId, actor, { viaShareToken = false } = {}) {
  assertEnabled();
  const prisma = prismaOrThrow();
  const doc = await prisma.accountingDocument.findFirst({
    where: { storeId, id: documentId, type: DOC_TYPE.QUOTE },
  });
  if (!doc) throw Object.assign(new Error('document_not_found'), { status: 404 });
  if (doc.status !== QUOTE_STATUS.ISSUED && doc.status !== QUOTE_STATUS.VIEWED) {
    throw Object.assign(new Error('quote_not_declinable'), { status: 409 });
  }
  const updated = await prisma.accountingDocument.update({
    where: { id: doc.id },
    data: { status: QUOTE_STATUS.DECLINED },
    include: { lines: true },
  });
  await emitEvent(prisma, {
    storeId,
    eventType: ACCOUNTING_EVENTS.QUOTE_DECLINED,
    aggregateId: doc.id,
    actorUserId: actor?.userId,
    payload: { viaShareToken },
  });
  return updated;
}

export async function convertQuoteToInvoice(storeId, quoteId, actorUserId) {
  assertEnabled();
  const prisma = prismaOrThrow();
  const quote = await prisma.accountingDocument.findFirst({
    where: { storeId, id: quoteId, type: DOC_TYPE.QUOTE },
    include: { lines: { orderBy: { sortOrder: 'asc' } } },
  });
  if (!quote) throw Object.assign(new Error('document_not_found'), { status: 404 });
  if (quote.status !== QUOTE_STATUS.ACCEPTED) {
    throw Object.assign(new Error('quote_must_be_accepted'), { status: 409 });
  }

  const profile = await getOrCreateBillingProfile(storeId, actorUserId);
  const days = profile.defaultPaymentTermsDays || 14;
  const issueDate = new Date();
  const dueDate = new Date(issueDate.getTime() + days * 86400000);

  const invoice = await prisma.accountingDocument.create({
    data: {
      storeId,
      type: DOC_TYPE.INVOICE,
      status: INVOICE_STATUS.DRAFT,
      currency: quote.currency,
      gstMode: quote.gstMode,
      issueDate,
      dueDate,
      purchaseOrderRef: quote.purchaseOrderRef,
      notes: quote.notes,
      terms: quote.terms,
      buyerJson: quote.buyerJson,
      sourceQuoteId: quote.id,
      quoteRequestId: quote.quoteRequestId,
      subtotalCents: quote.subtotalCents,
      gstCents: quote.gstCents,
      totalCents: quote.totalCents,
      discountCents: quote.discountCents,
      amountPaidCents: 0,
      balanceDueCents: quote.totalCents,
      createdByUserId: actorUserId || null,
      lines: {
        create: quote.lines.map((l, index) => ({
          sortOrder: index,
          sku: l.sku,
          name: l.name,
          description: l.description,
          quantity: l.quantity,
          unitPriceCents: l.unitPriceCents,
          lineSubtotalCents: l.lineSubtotalCents,
          lineGstCents: l.lineGstCents,
          lineTotalCents: l.lineTotalCents,
          productId: l.productId,
        })),
      },
    },
    include: { lines: { orderBy: { sortOrder: 'asc' } } },
  });

  await prisma.accountingDocument.update({
    where: { id: quote.id },
    data: { status: QUOTE_STATUS.CONVERTED, convertedInvoiceId: invoice.id },
  });

  await emitEvent(prisma, {
    storeId,
    eventType: ACCOUNTING_EVENTS.QUOTE_CONVERTED,
    aggregateId: quote.id,
    actorUserId,
    payload: { invoiceId: invoice.id },
  });

  return invoice;
}

export async function createShareToken(storeId, documentId, actorUserId, { ttlDays = 90 } = {}) {
  assertEnabled();
  const prisma = prismaOrThrow();
  const doc = await prisma.accountingDocument.findFirst({ where: { storeId, id: documentId } });
  if (!doc) throw Object.assign(new Error('document_not_found'), { status: 404 });
  if (doc.status === QUOTE_STATUS.DRAFT || doc.status === INVOICE_STATUS.DRAFT) {
    throw Object.assign(new Error('share_requires_issued'), { status: 409 });
  }
  await getOrCreateBillingProfile(storeId, actorUserId);
  const token = randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + ttlDays * 86400000);
  return prisma.accountingDocumentShare.create({
    data: {
      documentId: doc.id,
      storeId,
      token,
      expiresAt,
      createdByUserId: actorUserId || null,
    },
  });
}

export async function getDocumentByShareToken(token) {
  assertEnabled();
  const prisma = prismaOrThrow();
  const share = await prisma.accountingDocumentShare.findUnique({
    where: { token: String(token || '').trim() },
    include: {
      document: { include: { lines: { orderBy: { sortOrder: 'asc' } } } },
    },
  });
  if (!share || share.revokedAt) {
    throw Object.assign(new Error('share_not_found'), { status: 404 });
  }
  if (share.expiresAt && share.expiresAt.getTime() < Date.now()) {
    throw Object.assign(new Error('share_expired'), { status: 410 });
  }
  const profile = await prisma.businessBillingProfile.findUnique({
    where: { storeId: share.storeId },
  });
  const doc = share.document;
  const snapshot = doc.issuedSnapshot || buildIssuedSnapshot(doc, profile);
  if (doc.status === QUOTE_STATUS.ISSUED || doc.status === INVOICE_STATUS.ISSUED) {
    await prisma.accountingDocument.update({
      where: { id: doc.id },
      data: {
        status: doc.type === DOC_TYPE.QUOTE ? QUOTE_STATUS.VIEWED : INVOICE_STATUS.VIEWED,
      },
    });
    await emitEvent(prisma, {
      storeId: share.storeId,
      eventType:
        doc.type === DOC_TYPE.QUOTE
          ? ACCOUNTING_EVENTS.QUOTE_VIEWED
          : ACCOUNTING_EVENTS.INVOICE_VIEWED,
      aggregateId: doc.id,
      payload: { via: 'share' },
    });
  }
  return {
    document: doc,
    snapshot,
    share: { expiresAt: share.expiresAt },
  };
}

export async function listDocuments(storeId, actorUserId, { type, status } = {}) {
  assertEnabled();
  const prisma = prismaOrThrow();
  await getOrCreateBillingProfile(storeId, actorUserId);
  const where = { storeId };
  if (type) where.type = type;
  if (status) where.status = status;
  return prisma.accountingDocument.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    include: { lines: { orderBy: { sortOrder: 'asc' } } },
  });
}

export async function getDocument(storeId, documentId, actorUserId) {
  assertEnabled();
  const prisma = prismaOrThrow();
  await getOrCreateBillingProfile(storeId, actorUserId);
  const doc = await prisma.accountingDocument.findFirst({
    where: { storeId, id: documentId },
    include: { lines: { orderBy: { sortOrder: 'asc' } } },
  });
  if (!doc) throw Object.assign(new Error('document_not_found'), { status: 404 });
  return doc;
}

export async function markInvoicePaid(storeId, documentId, actorUserId) {
  assertEnabled();
  const prisma = prismaOrThrow();
  const doc = await prisma.accountingDocument.findFirst({
    where: { storeId, id: documentId, type: DOC_TYPE.INVOICE },
  });
  if (!doc) throw Object.assign(new Error('document_not_found'), { status: 404 });
  if (doc.status === INVOICE_STATUS.DRAFT) {
    throw Object.assign(new Error('invoice_not_issued'), { status: 409 });
  }
  const updated = await prisma.accountingDocument.update({
    where: { id: doc.id },
    data: {
      status: INVOICE_STATUS.PAID,
      amountPaidCents: doc.totalCents,
      balanceDueCents: 0,
      paidAt: new Date(),
    },
    include: { lines: true },
  });
  await emitEvent(prisma, {
    storeId,
    eventType: ACCOUNTING_EVENTS.INVOICE_MARKED_PAID,
    aggregateId: doc.id,
    actorUserId,
    payload: {},
  });
  return updated;
}
