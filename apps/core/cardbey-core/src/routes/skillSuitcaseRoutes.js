/**
 * Suitcase skill outputs + mission history — DANH: suitcase-skill-output
 *
 * POST /api/suitcase/skill-output  — persist skill stepResults as SmartDocument report
 * GET  /api/suitcase/summary        — skill report counts by subtype for nav (DANH: suitcase-nav-counts)
 * GET  /api/suitcase/mission-history — completed/failed MissionPipeline rows for user/store
 */

import { Router } from 'express';
import cuid from 'cuid';
import { requireAuth } from '../middleware/auth.js';
import { getPrismaClient } from '../lib/prisma.js';

const router = Router();

function asObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

/** @type {Record<string, string>} */
const SKILL_TITLE_PREFIX = {
  analytics_report: 'Store Analytics',
  store_health: 'Store Health Check',
  loyalty_campaign: 'Loyalty Program Setup',
  content_rewrite: 'Content Rewrite',
  tag_generation: 'SEO Tags',
  hero_optimization: 'Hero Optimization',
  review_management: 'Review Management',
  // DANH: kling-video-wiring
  video_generation: 'Video Generation',
  document_ingestion: 'Document Import',
};

/** @type {Record<string, { docType: string; subtype: string }>} */
const SKILL_DOC_MAP = {
  analytics_report: { docType: 'report', subtype: 'analytics' },
  store_health: { docType: 'report', subtype: 'health' },
  loyalty_campaign: { docType: 'report', subtype: 'loyalty' },
  content_rewrite: { docType: 'report', subtype: 'content' },
  tag_generation: { docType: 'report', subtype: 'content' },
  hero_optimization: { docType: 'report', subtype: 'content' },
  review_management: { docType: 'report', subtype: 'summary' },
  // DANH: kling-video-wiring
  video_generation: { docType: 'report', subtype: 'video' },
  document_ingestion: { docType: 'report', subtype: 'document' },
};

function humanizeSkillName(skillName) {
  const raw = String(skillName ?? '').trim();
  if (!raw) return 'Skill Report';
  return raw
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function mapSkillDocType(skillName) {
  const key = String(skillName ?? '').trim().toLowerCase();
  return SKILL_DOC_MAP[key] ?? { docType: 'report', subtype: 'summary' };
}

function formatTitleDate(iso) {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) {
    return new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function unwrapStepOutput(step) {
  if (!step || typeof step !== 'object' || Array.isArray(step)) return null;
  const o = step;
  if (o.output && typeof o.output === 'object' && !Array.isArray(o.output)) {
    const inner = o.output;
    if (inner.output && typeof inner.output === 'object' && !Array.isArray(inner.output)) {
      return inner.output;
    }
    return inner;
  }
  return o;
}

function getStep(stepResults, ...keys) {
  for (const k of keys) {
    if (stepResults?.[k] != null) return stepResults[k];
  }
  return null;
}

/** Persist canonical media fields on skill_report designJson for Suitcase previews. */
function extractSkillArtifactMedia(skillName, stepResults, { executionId, storeId } = {}) {
  const key = String(skillName ?? '').trim().toLowerCase();
  const base = {
    artifactId: executionId ?? null,
    sourceMissionId: executionId ?? null,
    storeId: storeId ?? null,
    mediaUrl: null,
    posterUrl: null,
    thumbnailUrl: null,
    summary: null,
  };

  if (key.includes('video') || stepResults?.video_execute || stepResults?.queue_video_generation) {
    const audioStep =
      unwrapStepOutput(getStep(stepResults, 'video_post_production')) ??
      unwrapStepOutput(getStep(stepResults, 'video_audio'));
    const queueStep =
      unwrapStepOutput(getStep(stepResults, 'video_execute')) ??
      unwrapStepOutput(getStep(stepResults, 'queue_video_generation'));
    const videoUrl =
      (typeof audioStep?.videoUrl === 'string' && audioStep.videoUrl.trim()) ||
      (typeof queueStep?.videoUrl === 'string' && queueStep.videoUrl.trim()) ||
      null;
    const posterUrl =
      (typeof queueStep?.thumbnailUrl === 'string' && queueStep.thumbnailUrl.trim()) ||
      (typeof audioStep?.thumbnailUrl === 'string' && audioStep.thumbnailUrl.trim()) ||
      null;
    return {
      ...base,
      mediaUrl: videoUrl,
      posterUrl,
      thumbnailUrl: posterUrl,
    };
  }

  if (
    key.includes('document') ||
    key.includes('ingest') ||
    stepResults?.generate_execution_summary
  ) {
    const summaryOut = unwrapStepOutput(getStep(stepResults, 'generate_execution_summary'));
    const display = summaryOut?.display;
    const products = Array.isArray(display?.products) ? display.products : [];
    const ingestOut = unwrapStepOutput(getStep(stepResults, 'ingest_document', 'document_ingest'));
    const sourceUrl =
      (typeof ingestOut?.sourceUrl === 'string' && ingestOut.sourceUrl.trim()) ||
      (typeof ingestOut?.fileUrl === 'string' && ingestOut.fileUrl.trim()) ||
      null;
    return {
      ...base,
      mediaUrl: sourceUrl,
      summary:
        typeof summaryOut?.summary === 'string'
          ? summaryOut.summary
          : products.length
            ? `${products.length} products extracted`
            : null,
    };
  }

  return base;
}

function buildSkillOutputTitle(skillName, storeName, timestamp) {
  const prefix = SKILL_TITLE_PREFIX[String(skillName ?? '').trim().toLowerCase()] ?? humanizeSkillName(skillName);
  const datePart = formatTitleDate(timestamp);
  if (storeName) return `${prefix} — ${storeName} — ${datePart}`;
  return `${prefix} — ${datePart}`;
}

function deriveMissionIntentType(row) {
  const meta = asObject(row.metadataJson);
  if (typeof meta.intentType === 'string' && meta.intentType.trim()) return meta.intentType.trim();
  if (typeof meta.intent === 'string' && meta.intent.trim()) return meta.intent.trim();
  return String(row.type ?? 'mission').trim() || 'mission';
}

function deriveMissionStoreId(row) {
  if (String(row.targetType ?? '').toLowerCase() === 'store' && row.targetId) {
    return String(row.targetId);
  }
  const meta = asObject(row.metadataJson);
  if (typeof meta.storeId === 'string' && meta.storeId.trim()) return meta.storeId.trim();
  return null;
}

async function ensureDevUserForFk(prisma, user, userId) {
  if (process.env.NODE_ENV === 'production') return;
  if (userId !== 'dev-user-id' && !user?.isDevAdmin) return;
  await prisma.user
    .upsert({
      where: { id: 'dev-user-id' },
      create: {
        id: 'dev-user-id',
        email: 'dev@cardbey.local',
        passwordHash: '',
        displayName: 'Dev User',
      },
      update: {},
    })
    .catch(() => {});
}

// DANH: suitcase-hero-integration
function resolveSuitcaseAuth(req) {
  const userId = req.user?.id;
  const isDevAdmin = req.user?.isDevAdmin === true;
  return { userId, isDevAdmin };
}

function smartDocumentUserWhere(userId, isDevAdmin, extra = {}) {
  if (isDevAdmin) {
    return { ...extra, status: extra.status ?? { not: 'archived' } };
  }
  return { userId, ...extra, status: extra.status ?? { not: 'archived' } };
}

// DANH: suitcase-skill-output
router.post('/skill-output', requireAuth, async (req, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ ok: false, error: 'auth_required' });

  const body = asObject(req.body);
  const skillName = typeof body.skillName === 'string' ? body.skillName.trim() : '';
  if (!skillName) return res.status(400).json({ ok: false, error: 'skill_name_required' });

  const storeId = typeof body.storeId === 'string' && body.storeId.trim() ? body.storeId.trim() : null;
  const stepResults = body.stepResults != null && typeof body.stepResults === 'object' ? body.stepResults : {};
  const summary = typeof body.summary === 'string' ? body.summary : '';
  const executionId = typeof body.executionId === 'string' && body.executionId.trim() ? body.executionId.trim() : null;
  const timestamp =
    typeof body.timestamp === 'string' && body.timestamp.trim() ? body.timestamp.trim() : new Date().toISOString();

  const prisma = getPrismaClient();
  await ensureDevUserForFk(prisma, req.user, userId);
  let storeName = null;
  let businessId = null;
  if (storeId) {
    try {
      const business = await prisma.business.findFirst({
        where: { id: storeId, userId },
        select: { id: true, name: true },
      });
      if (business) {
        businessId = business.id;
        storeName = business.name ?? null;
      }
    } catch {
      storeName = null;
      businessId = null;
    }
  }

  const { docType, subtype } = mapSkillDocType(skillName);
  const title = buildSkillOutputTitle(skillName, storeName, timestamp);
  const mediaFields = extractSkillArtifactMedia(skillName, stepResults, { executionId, storeId });
  const designPayload = {
    skillName,
    stepResults,
    summary: summary || mediaFields.summary || '',
    executionId,
    generatedAt: timestamp,
    template: 'skill_report',
    ...mediaFields,
  };

  const docId = cuid();
  try {
    await prisma.smartDocument.create({
      data: {
        id: docId,
        userId,
        businessId,
        docType,
        subtype,
        title,
        status: 'active',
        phase: 'post',
        designJson: JSON.stringify(designPayload),
        capabilities: '[]',
        autoApprove: true,
      },
    });
    return res.status(201).json({ ok: true, docId, title });
  } catch (e) {
    console.error('[skillSuitcaseRoutes] POST /skill-output failed:', e?.message ?? e);
    return res.status(500).json({ ok: false, error: 'internal_error', message: e?.message ?? String(e) });
  }
});

/** @type {Record<string, string>} */
const SUBTYPE_LABELS = {
  analytics: 'Analytics Reports',
  health: 'Health Checks',
  loyalty: 'Loyalty Programs',
  content: 'Content Rewrites',
  summary: 'Reports',
  // DANH: kling-video-wiring
  video: 'Videos',
  document: 'Documents',
  card: 'Cards',
  ticket: 'Tickets',
};

/** @type {string[]} */
const SUBTYPE_NAV_ORDER = ['analytics', 'health', 'loyalty', 'content', 'video', 'document', 'summary'];

function subtypeToIcon(subtype) {
  const s = String(subtype ?? '').trim().toLowerCase();
  if (s === 'analytics') return 'chart';
  if (s === 'health') return 'heart';
  if (s === 'loyalty') return 'gift';
  if (s === 'content') return 'pencil';
  if (s === 'summary') return 'file';
  // DANH: kling-video-wiring
  if (s === 'video') return 'video';
  if (s === 'document') return 'file';
  return 'folder';
}

// DANH: suitcase-nav-counts
router.get('/summary', requireAuth, async (req, res) => {
  // DANH: suitcase-hero-integration
  const { userId, isDevAdmin } = resolveSuitcaseAuth(req);
  if (!userId) return res.status(401).json({ ok: false, error: 'auth_required' });

  const prisma = getPrismaClient();

  try {
    const counts = await prisma.smartDocument.groupBy({
      by: ['subtype'],
      where: smartDocumentUserWhere(userId, isDevAdmin, {
        docType: 'report',
        status: { not: 'archived' },
      }),
      _count: { id: true },
    });

    const totals = await prisma.smartDocument.groupBy({
      by: ['docType'],
      where: smartDocumentUserWhere(userId, isDevAdmin, {
        status: { not: 'archived' },
      }),
      _count: { id: true },
    });

    const items = counts
      .filter((c) => c._count.id > 0)
      .map((c) => {
        const subtype = c.subtype ?? null;
        const key = String(subtype ?? '').trim().toLowerCase();
        return {
          subtype,
          label: SUBTYPE_LABELS[key] ?? (subtype ? String(subtype) : 'Other'),
          count: c._count.id,
          href: `/suitcase/cards?filter=${encodeURIComponent(key || 'summary')}`,
          icon: subtypeToIcon(subtype),
        };
      })
      .sort((a, b) => {
        const ai = SUBTYPE_NAV_ORDER.indexOf(String(a.subtype ?? '').toLowerCase());
        const bi = SUBTYPE_NAV_ORDER.indexOf(String(b.subtype ?? '').toLowerCase());
        return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
      });

    const totalDocs = totals.reduce((sum, t) => sum + t._count.id, 0);

    return res.json({ ok: true, items, totalDocs });
  } catch (e) {
    console.error('[skillSuitcaseRoutes] GET /summary failed:', e?.message ?? e);
    return res.status(500).json({ ok: false, error: 'internal_error', message: e?.message ?? String(e) });
  }
});

// DANH: suitcase-skill-output
router.get('/mission-history', requireAuth, async (req, res) => {
  // DANH: suitcase-hero-integration
  const { userId, isDevAdmin } = resolveSuitcaseAuth(req);
  if (!userId) return res.status(401).json({ ok: false, error: 'auth_required' });

  const q = asObject(req.query);
  const storeId = typeof q.storeId === 'string' && q.storeId.trim() ? q.storeId.trim() : null;
  const limitRaw = parseInt(String(q.limit ?? '20'), 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 20;

  const prisma = getPrismaClient();

  /** @type {import('../lib/prismaClient.js').Prisma.MissionPipelineWhereInput} */
  const where = isDevAdmin
    ? {
        status: { in: ['completed', 'failed'] },
      }
    : {
        status: { in: ['completed', 'failed'] },
        OR: [{ createdBy: userId }],
      };

  if (storeId) {
    where.AND = [{ targetType: 'store', targetId: storeId }];
    if (!isDevAdmin) {
      where.OR = [{ createdBy: userId, targetType: 'store', targetId: storeId }];
    }
  }

  try {
    const rows = await prisma.missionPipeline.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: limit,
      select: {
        id: true,
        type: true,
        title: true,
        status: true,
        targetType: true,
        targetId: true,
        metadataJson: true,
        outputsJson: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const missions = rows.map((row) => ({
      id: row.id,
      intentType: deriveMissionIntentType(row),
      status: row.status,
      storeId: deriveMissionStoreId(row),
      title: typeof row.title === 'string' && row.title.trim() ? row.title.trim() : null,
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt ?? ''),
      updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt ?? ''),
    }));

    return res.json({ ok: true, missions });
  } catch (e) {
    console.error('[skillSuitcaseRoutes] GET /mission-history failed:', e?.message ?? e);
    return res.status(500).json({ ok: false, error: 'internal_error', message: e?.message ?? String(e) });
  }
});

// DANH: suitcase-hero-integration
function extractVideoFromDesignJson(designJson) {
  try {
    const data = typeof designJson === 'string' ? JSON.parse(designJson) : designJson;
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

    const briefOut =
      data.stepResults?.analyze_video_brief?.output?.output ??
      data.stepResults?.analyze_video_brief?.output;

    return {
      videoUrl,
      thumbnailUrl:
        (typeof queueOut?.thumbnailUrl === 'string' && queueOut.thumbnailUrl) ||
        (typeof queueStep?.output?.thumbnailUrl === 'string' && queueStep.output.thumbnailUrl) ||
        null,
      duration: queueOut?.duration ?? queueStep?.output?.duration ?? '5',
      prompt: queueOut?.prompt ?? queueStep?.output?.prompt ?? '',
      storeName: briefOut?.storeName ?? '',
    };
  } catch {
    return null;
  }
}

router.get('/videos', requireAuth, async (req, res) => {
  // DANH: suitcase-hero-integration
  const { userId, isDevAdmin } = resolveSuitcaseAuth(req);
  if (!userId) return res.status(401).json({ ok: false, error: 'auth_required' });

  const prisma = getPrismaClient();

  // Dev admin can see all videos (for testing)
  // Production: always filter by userId
  const whereClause = isDevAdmin
    ? {
        docType: 'report',
        subtype: 'video',
        status: { not: 'archived' },
      }
    : {
        userId,
        docType: 'report',
        subtype: 'video',
        status: { not: 'archived' },
      };

  try {
    const docs = await prisma.smartDocument.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        title: true,
        designJson: true,
        createdAt: true,
        businessId: true,
      },
    });

    const videos = docs.flatMap((doc) => {
      const extracted = extractVideoFromDesignJson(doc.designJson);
      if (!extracted) return [];

      return [
        {
          id: doc.id,
          title: doc.title,
          videoUrl: extracted.videoUrl,
          thumbnailUrl: extracted.thumbnailUrl,
          duration: extracted.duration,
          prompt: extracted.prompt,
          storeName: extracted.storeName,
          createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : String(doc.createdAt ?? ''),
          businessId: doc.businessId ?? null,
          source: 'suitcase',
        },
      ];
    });

    return res.json({ ok: true, videos });
  } catch (e) {
    console.error('[skillSuitcaseRoutes] GET /videos failed:', e?.message ?? e);
    return res.status(500).json({ ok: false, error: 'internal_error', message: e?.message ?? String(e) });
  }
});

export default router;
