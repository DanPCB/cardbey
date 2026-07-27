/**
 * Phase 10.5 — Idempotent backfill of historical content into suitcase vault.
 */
import { createSuitcaseItem } from './suitcaseItemService.js';
import { mirrorMissionOutputToSuitcase } from './suitcaseMissionOutputBridge.js';

const REQUIRED_COLUMNS = [
  'id',
  'ownerId',
  'spaceId',
  'storeId',
  'missionId',
  'sourceType',
  'contentType',
  'title',
  'description',
  'summary',
  'tagsJson',
  'metadataJson',
  'fileUrl',
  'thumbnailUrl',
  'payloadJson',
  'visibility',
  'embeddingStatus',
  'idempotencyKey',
  'createdAt',
  'updatedAt',
];

function jsonParse(raw, fallback = null) {
  if (raw == null || raw === '') return fallback;
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return fallback;
  }
}

function extractVideoFromDesignJson(designJson) {
  try {
    const data = jsonParse(designJson, null);
    if (!data || typeof data !== 'object') return null;

    const queueStep = data.stepResults?.queue_video_generation;
    const queueOut =
      queueStep?.output?.output && typeof queueStep.output.output === 'object'
        ? queueStep.output.output
        : queueStep?.output;
    const videoUrl =
      (typeof queueOut?.videoUrl === 'string' && queueOut.videoUrl.trim()) ||
      (typeof queueStep?.output?.videoUrl === 'string' && queueStep.output.videoUrl.trim()) ||
      null;
    if (!videoUrl) return null;

    return {
      videoUrl,
      thumbnailUrl:
        (typeof queueOut?.thumbnailUrl === 'string' && queueOut.thumbnailUrl) ||
        (typeof queueStep?.output?.thumbnailUrl === 'string' && queueStep.output.thumbnailUrl) ||
        null,
    };
  } catch {
    return null;
  }
}

function mapSmartDocumentToSuitcase(doc) {
  const subtype = String(doc.subtype ?? '').trim().toLowerCase();
  const design = jsonParse(doc.designJson, {});
  const summary = typeof design.summary === 'string' ? design.summary : null;

  if (subtype === 'video') {
    const video = extractVideoFromDesignJson(doc.designJson);
    if (video) {
      return {
        sourceType: 'video',
        contentType: 'video',
        title: doc.title,
        fileUrl: video.videoUrl,
        thumbnailUrl: video.thumbnailUrl,
        payload: design,
        summary,
      };
    }
  }

  if (subtype === 'document') {
    return {
      sourceType: 'document',
      contentType: 'mixed',
      title: doc.title,
      fileUrl: doc.renderedUrl ?? doc.printUrl ?? doc.liveUrl ?? null,
      payload: design,
      summary,
    };
  }

  const reportSubtypes = new Set(['analytics', 'health', 'loyalty', 'content', 'summary']);
  if (doc.docType === 'report' && reportSubtypes.has(subtype)) {
    return {
      sourceType: 'business_report',
      contentType: 'json',
      title: doc.title,
      payload: design,
      summary,
    };
  }

  return {
    sourceType: 'artifact',
    contentType: 'json',
    title: doc.title,
    payload: design,
    summary,
    fileUrl: doc.renderedUrl ?? doc.printUrl ?? null,
  };
}

function deriveMissionStoreId(row) {
  if (String(row.targetType ?? '').toLowerCase() === 'store' && row.targetId) {
    return String(row.targetId);
  }
  const meta = jsonParse(row.metadataJson, {});
  if (typeof meta.storeId === 'string' && meta.storeId.trim()) return meta.storeId.trim();
  return null;
}

function emptyReport() {
  return {
    created: 0,
    skipped: 0,
    failed: 0,
    wouldCreate: 0,
    bySource: {
      smart_documents: { created: 0, skipped: 0, failed: 0, wouldCreate: 0 },
      mission_outputs: { created: 0, skipped: 0, failed: 0, wouldCreate: 0 },
      business_briefings: { created: 0, skipped: 0, failed: 0, wouldCreate: 0 },
    },
  };
}

function bump(report, source, outcome) {
  report.bySource[source][outcome] += 1;
  report[outcome] += 1;
}

function modelAvailable(prisma) {
  return Boolean(prisma?.suitcaseItem?.findMany && prisma?.suitcaseItem?.create);
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{ dryRun?: boolean, ownerId?: string, limit?: number }} options
 */
export async function runSuitcaseBackfill(prisma, options = {}) {
  const dryRun = options.dryRun !== false;
  const ownerFilter = typeof options.ownerId === 'string' ? options.ownerId.trim() : null;
  const limit = Math.min(Math.max(Number(options.limit) || 500, 1), 5000);
  const report = emptyReport();
  report.mode = dryRun ? 'dry_run' : 'apply';

  if (!modelAvailable(prisma)) {
    report.error = 'suitcase_item_model_unavailable';
    return report;
  }

  // SmartDocument → suitcase
  if (prisma.smartDocument?.findMany) {
    const docs = await prisma.smartDocument.findMany({
      where: {
        status: { not: 'archived' },
        ...(ownerFilter ? { userId: ownerFilter } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        userId: true,
        businessId: true,
        docType: true,
        subtype: true,
        title: true,
        designJson: true,
        renderedUrl: true,
        printUrl: true,
        liveUrl: true,
        createdAt: true,
      },
    });

    for (const doc of docs) {
      const mapped = mapSmartDocumentToSuitcase(doc);
      const idempotencyKey = `smartdoc:${doc.id}`;
      try {
        if (dryRun) {
          const existing = await prisma.suitcaseItem.findUnique({ where: { idempotencyKey } });
          bump(report, 'smart_documents', existing ? 'skipped' : 'wouldCreate');
          continue;
        }
        const result = await createSuitcaseItem(
          {
            ownerId: doc.userId,
            storeId: doc.businessId,
            ...mapped,
            tags: ['backfill', mapped.sourceType],
            metadata: {
              smartDocumentId: doc.id,
              docType: doc.docType,
              subtype: doc.subtype,
              generatedBy: 'backfill',
              version: 'phase_10_5',
            },
            idempotencyKey,
          },
          prisma,
        );
        if (result.skipped) bump(report, 'smart_documents', 'skipped');
        else if (result.created === false) bump(report, 'smart_documents', 'skipped');
        else bump(report, 'smart_documents', 'created');
      } catch (err) {
        bump(report, 'smart_documents', 'failed');
        report.lastError = err?.message ?? String(err);
      }
    }
  }

  // MissionPipeline outputs → suitcase
  if (prisma.missionPipeline?.findMany) {
    const missions = await prisma.missionPipeline.findMany({
      where: {
        status: 'completed',
        outputsJson: { not: null },
        ...(ownerFilter ? { createdBy: ownerFilter } : {}),
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
      select: {
        id: true,
        createdBy: true,
        targetType: true,
        targetId: true,
        metadataJson: true,
        outputsJson: true,
        status: true,
        title: true,
      },
    });

    for (const mission of missions) {
      const ownerId = String(mission.createdBy ?? '').trim();
      if (!ownerId) {
        bump(report, 'mission_outputs', 'skipped');
        continue;
      }
      const missionOutputs = jsonParse(mission.outputsJson, null);
      if (!missionOutputs || typeof missionOutputs !== 'object') {
        bump(report, 'mission_outputs', 'skipped');
        continue;
      }
      try {
        if (dryRun) {
          const idempotencyPrefix = `mission:${ownerId}:${mission.id}:`;
          const existing = await prisma.suitcaseItem.findFirst({
            where: { idempotencyKey: { startsWith: idempotencyPrefix } },
          });
          bump(report, 'mission_outputs', existing ? 'skipped' : 'wouldCreate');
          continue;
        }
        const result = await mirrorMissionOutputToSuitcase(
          {
            ownerId,
            storeId: deriveMissionStoreId(mission),
            missionId: mission.id,
            missionOutputs,
            missionStatus: mission.status,
            actionType: mission.title,
          },
          prisma,
        );
        if (result.skipped || result.created === false) bump(report, 'mission_outputs', 'skipped');
        else bump(report, 'mission_outputs', 'created');
      } catch (err) {
        bump(report, 'mission_outputs', 'failed');
        report.lastError = err?.message ?? String(err);
      }
    }
  }

  // Existing business_briefing suitcase items — count only (already in vault)
  const briefingCount = await prisma.suitcaseItem.count({
    where: {
      sourceType: 'business_briefing',
      ...(ownerFilter ? { ownerId: ownerFilter } : {}),
    },
  });
  report.bySource.business_briefings.skipped = briefingCount;

  return report;
}

export async function probeSuitcaseSchema(prisma) {
  const result = {
    tableExists: false,
    columnsOk: false,
    missingColumns: [],
    provider: null,
  };

  if (!prisma?.$queryRaw) return result;

  const url = String(process.env.DATABASE_URL ?? '');
  const isPostgres = url.startsWith('postgres');
  result.provider = isPostgres ? 'postgresql' : 'sqlite';

  try {
    if (isPostgres) {
      const rows = await prisma.$queryRaw`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'suitcase_items'
      `;
      const cols = rows.map((r) => r.column_name);
      result.tableExists = cols.length > 0;
      result.missingColumns = REQUIRED_COLUMNS.filter((c) => !cols.includes(c));
    } else {
      const rows = await prisma.$queryRaw`PRAGMA table_info(suitcase_items)`;
      const cols = rows.map((r) => r.name);
      result.tableExists = cols.length > 0;
      result.missingColumns = REQUIRED_COLUMNS.filter((c) => !cols.includes(c));
    }
    result.columnsOk = result.tableExists && result.missingColumns.length === 0;
  } catch {
    result.tableExists = false;
  }

  return result;
}

export { REQUIRED_COLUMNS };
