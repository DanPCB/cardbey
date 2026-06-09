/**
 * Persist MI Promotion scenes from document ingestion (MiJob table removed — MissionContext + storefrontSettings).
 */

import cuid from 'cuid';
import { getPrismaClient } from '../../lib/prisma.js';
import { buildMiScenesFromExtraction } from '../../lib/documentIngestion/livingDocumentMapper.js';
import { persistIngestionContext } from '../../lib/documentIngestion/persistIngestionContext.js';

/**
 * @param {Date | string} date
 * @param {number} minutes
 */
function isRecent(date, minutes) {
  const t = new Date(date).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t < minutes * 60 * 1000;
}

/**
 * @param {import('@prisma/client').PrismaClient} [prisma]
 * @param {{ storeId: string, extractedData: object, missionId?: string | null, scenes?: object[] }} params
 */
export async function createMiJobFromIngestion(
  prisma = getPrismaClient(),
  { storeId, extractedData, missionId, scenes },
) {
  const sid = String(storeId ?? '').trim();
  if (!sid || !extractedData || typeof extractedData !== 'object') {
    return null;
  }

  const business = await prisma.business.findUnique({
    where: { id: sid },
    select: { storefrontSettings: true },
  });

  let ingestionBlock = null;
  if (business?.storefrontSettings && typeof business.storefrontSettings === 'object') {
    ingestionBlock = business.storefrontSettings.documentIngestion ?? null;
  }

  if (
    ingestionBlock?.miJobId &&
    ingestionBlock?.updatedAt &&
    isRecent(ingestionBlock.updatedAt, 60)
  ) {
    return {
      id: ingestionBlock.miJobId,
      storeId: sid,
      status: 'draft',
      scenes: ingestionBlock.miScenes ?? [],
      existing: true,
    };
  }

  const miScenes = Array.isArray(scenes) && scenes.length ? scenes : buildMiScenesFromExtraction(extractedData);
  const miJobId = cuid();

  await persistIngestionContext(prisma, {
    storeId: sid,
    extractedData,
    livingDocument: ingestionBlock?.livingDocument ?? null,
    missionId: missionId ?? null,
  });

  const businessAfter = await prisma.business.findUnique({
    where: { id: sid },
    select: { storefrontSettings: true },
  });
  let settings =
    businessAfter?.storefrontSettings && typeof businessAfter.storefrontSettings === 'object'
      ? { ...businessAfter.storefrontSettings }
      : {};

  settings = {
    ...settings,
    documentIngestion: {
      ...(settings.documentIngestion && typeof settings.documentIngestion === 'object'
        ? settings.documentIngestion
        : {}),
      extractedData,
      miScenes,
      miJobId,
      missionId: missionId ?? null,
      source: 'document_ingestion',
      status: 'draft',
      updatedAt: new Date().toISOString(),
    },
  };

  await prisma.business.update({
    where: { id: sid },
    data: { storefrontSettings: settings },
  });

  if (missionId) {
    const mid = String(missionId).trim();
    const scenesJson = JSON.stringify({ miJobId, storeId: sid, scenes: miScenes, source: 'document_ingestion' });
    const existing = await prisma.missionContext.findUnique({ where: { missionId: mid } });
    let contextObj = {};
    if (existing?.contextJson) {
      try {
        contextObj = JSON.parse(existing.contextJson);
      } catch {
        contextObj = {};
      }
    }
    contextObj.documentIngestionMi = { miJobId, scenes: miScenes, storeId: sid };
    if (existing) {
      await prisma.missionContext.update({
        where: { missionId: mid },
        data: { contextJson: JSON.stringify(contextObj) },
      });
    } else {
      await prisma.missionContext.create({
        data: { missionId: mid, contextJson: JSON.stringify(contextObj) },
      });
    }
    void scenesJson;
  }

  return {
    id: miJobId,
    storeId: sid,
    missionId: missionId ?? null,
    source: 'document_ingestion',
    status: 'draft',
    scenes: miScenes,
  };
}
