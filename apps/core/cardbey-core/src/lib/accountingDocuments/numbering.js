/**
 * Sequential document numbers per store — server-side only.
 */

export function formatDocumentNumber(type, seq) {
  const n = Math.trunc(Number(seq));
  if (!Number.isFinite(n) || n < 1) throw new Error('invalid sequence');
  const padded = String(n).padStart(6, '0');
  if (type === 'QUOTE') return `Q-${padded}`;
  if (type === 'INVOICE') return `INV-${padded}`;
  throw new Error(`unsupported document type: ${type}`);
}

/**
 * Atomically allocate next number for store+type.
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export async function allocateDocumentNumber(prisma, storeId, type) {
  const keyType = type === 'QUOTE' || type === 'INVOICE' ? type : null;
  if (!keyType) throw new Error('unsupported type');

  const row = await prisma.$transaction(async (tx) => {
    const existing = await tx.accountingDocumentSequence.findUnique({
      where: { storeId_documentType: { storeId, documentType: keyType } },
    });
    let next = 1;
    if (existing) {
      next = existing.nextValue;
      await tx.accountingDocumentSequence.update({
        where: { id: existing.id },
        data: { nextValue: next + 1 },
      });
    } else {
      await tx.accountingDocumentSequence.create({
        data: { storeId, documentType: keyType, nextValue: 2 },
      });
    }
    return next;
  });

  return formatDocumentNumber(keyType, row);
}
