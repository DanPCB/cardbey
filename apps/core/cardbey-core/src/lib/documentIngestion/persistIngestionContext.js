/**
 * Persist document ingestion context on Business.storefrontSettings for storefront + MI prefill.
 */

import { buildMiScenesFromExtraction } from './livingDocumentMapper.js';

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{ storeId: string, extractedData: object, livingDocument?: object | null, missionId?: string | null }} params
 */
export async function persistIngestionContext(prisma, { storeId, extractedData, livingDocument, missionId }) {
  const sid = String(storeId ?? '').trim();
  if (!sid || !extractedData || typeof extractedData !== 'object') return;

  const business = await prisma.business.findUnique({
    where: { id: sid },
    select: { storefrontSettings: true },
  });
  if (!business) return;

  let existing = {};
  if (business.storefrontSettings && typeof business.storefrontSettings === 'object' && !Array.isArray(business.storefrontSettings)) {
    existing = business.storefrontSettings;
  } else if (typeof business.storefrontSettings === 'string') {
    try {
      existing = JSON.parse(business.storefrontSettings);
    } catch {
      existing = {};
    }
  }

  const payload = {
    ...existing,
    documentIngestion: {
      extractedData,
      miScenes: buildMiScenesFromExtraction(extractedData),
      livingDocument: livingDocument ?? null,
      missionId: missionId ?? null,
      updatedAt: new Date().toISOString(),
      source: 'document_ingestion',
    },
  };

  await prisma.business.update({
    where: { id: sid },
    data: { storefrontSettings: payload },
  });
}
