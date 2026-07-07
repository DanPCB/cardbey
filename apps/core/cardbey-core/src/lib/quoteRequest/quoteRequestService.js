/**
 * Quote request persistence and owner management.
 */

import cuid from 'cuid';
import { getPrismaClient } from '../prisma.js';
import { emitCustomerInquiryActivity } from '../storeActivity/storeActivityHooks.js';
import { QUOTE_REQUEST_STATUSES } from '../catalog/serviceCatalogTypes.js';

/**
 * @param {object} input
 */
export async function createQuoteRequest(input) {
  const prisma = getPrismaClient();
  const id = cuid();
  const row = await prisma.quoteRequest.create({
    data: {
      id,
      storeId: input.storeId,
      serviceId: input.serviceId ?? null,
      customerId: input.customerId ?? null,
      customerName: input.customerName,
      customerEmail: input.customerEmail,
      customerPhone: input.customerPhone ?? null,
      description: input.description,
      address: input.address ?? null,
      preferredDate: input.preferredDate ?? null,
      uploadedFiles: input.uploadedFiles ?? null,
      approximateSize: input.approximateSize ?? null,
      budget: input.budget != null ? Number(input.budget) : null,
      status: 'new',
      metadata: input.metadata ?? null,
    },
  });

  emitCustomerInquiryActivity({
    storeId: input.storeId,
    entityId: row.id,
  });

  console.log(
    '[QUOTE_REQUEST_CREATED]',
    JSON.stringify({ id: row.id, storeId: row.storeId, serviceId: row.serviceId, status: row.status }),
  );

  return row;
}

/**
 * @param {string} storeId
 * @param {{ status?: string, limit?: number, offset?: number }} [opts]
 */
export async function getQuoteRequestsForStore(storeId, opts = {}) {
  const prisma = getPrismaClient();
  const limit = Math.min(Math.max(1, opts.limit ?? 50), 100);
  const offset = Math.max(0, opts.offset ?? 0);
  const where = {
    storeId,
    ...(opts.status ? { status: opts.status } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.quoteRequest.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
      skip: offset,
      take: limit,
    }),
    prisma.quoteRequest.count({ where }),
  ]);

  return { quoteRequests: rows, total, limit, offset };
}

/**
 * @param {string} storeId
 * @param {string} quoteRequestId
 * @param {object} patch
 */
export async function updateQuoteRequest(storeId, quoteRequestId, patch) {
  const prisma = getPrismaClient();
  const existing = await prisma.quoteRequest.findFirst({
    where: { id: quoteRequestId, storeId },
  });
  if (!existing) return null;

  const data = {};
  if (patch.status != null) {
    const status = String(patch.status).trim();
    if (!QUOTE_REQUEST_STATUSES.includes(status)) {
      const err = new Error(`Invalid status: ${status}`);
      err.status = 400;
      throw err;
    }
    data.status = status;
  }
  if (patch.quoteAmount != null) data.quoteAmount = Number(patch.quoteAmount);
  if (patch.quoteMessage != null) data.quoteMessage = String(patch.quoteMessage).trim();

  return prisma.quoteRequest.update({
    where: { id: quoteRequestId },
    data,
  });
}

/**
 * @param {string} storeId
 */
export async function countNewQuoteRequests(storeId) {
  const prisma = getPrismaClient();
  return prisma.quoteRequest.count({ where: { storeId, status: 'new' } });
}
