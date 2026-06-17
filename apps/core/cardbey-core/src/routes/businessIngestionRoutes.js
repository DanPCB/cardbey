/**
 * Business Ingestion API routes (V1 + V1.1 QA + V1.2 Claim Bridge).
 */

import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireSuperAdmin, hasRole } from '../lib/authorization.js';
import {
  buildIngestionDashboardMetrics,
  getSeedRecordById,
  listIngestionRuns,
  runIngestion,
  upsertSeedRecords,
} from '../lib/businessIngestion/index.js';
import { buildEnrichmentMetrics } from '../lib/businessIngestion/BusinessEnrichmentAgent.js';
import { buildControlCenterIngestionSnapshot } from '../lib/businessIngestion/buildControlCenterIngestionSnapshot.js';
import {
  approveSeed,
  enrichQueueItem,
  listClaimableSeeds,
  listQaQueue,
  markSeedDuplicate,
  mergeSeedIntoCanonical,
  rejectSeed,
  sendSeedBackToReview,
} from '../lib/businessIngestion/QaPromotionService.js';
import { listQaAuditEntries } from '../lib/businessIngestion/QaAuditLog.js';
import {
  startSeedClaim,
  verifySeedClaimProof,
  activateSeedAfterOwnerConfirmation,
  rejectSeedClaim,
  listClaimsByStatus,
  buildClaimQueueMetrics,
  enrichClaimsForDashboard,
} from '../lib/businessIngestion/ClaimBridgeService.js';
import { listClaimAuditEntries } from '../lib/businessIngestion/ClaimAuditLog.js';
import {
  CsvAdapter,
  GoogleSheetAdapter,
  OpenDataUrlAdapter,
} from '../lib/businessIngestion/adapters/index.js';

const router = express.Router();

const VALID_PROOF_TYPES = new Set(['email', 'phone', 'website', 'registration']);

function parseQueueFilters(query) {
  const filters = {};
  if (typeof query.status === 'string' && query.status.trim()) {
    filters.status = query.status.trim();
  }
  if (query.minQualityScore != null && query.minQualityScore !== '') {
    filters.minQualityScore = Number(query.minQualityScore);
  }
  if (query.maxQualityScore != null && query.maxQualityScore !== '') {
    filters.maxQualityScore = Number(query.maxQualityScore);
  }
  if (typeof query.sourceType === 'string' && query.sourceType.trim()) {
    filters.sourceType = query.sourceType.trim();
  }
  if (typeof query.duplicateStatus === 'string' && query.duplicateStatus.trim()) {
    filters.duplicateStatus = query.duplicateStatus.trim();
  }
  if (typeof query.category === 'string' && query.category.trim()) {
    filters.category = query.category.trim();
  }
  if (typeof query.city === 'string' && query.city.trim()) {
    filters.city = query.city.trim();
  }
  if (query.autoApprovalSuggested === 'true') filters.autoApprovalSuggested = true;
  if (query.autoApprovalSuggested === 'false') filters.autoApprovalSuggested = false;
  return filters;
}

/** GET /api/business-ingestion/metrics */
router.get('/metrics', requireAuth, requireSuperAdmin, async (req, res, next) => {
  try {
    const metrics = await buildIngestionDashboardMetrics();
    const qaPending = await listQaQueue({ status: 'seeded_pending_qa' });
    const autoSuggested = qaPending.filter((s) => s.autoApprovalSuggested).length;
    const claimQueue = await buildClaimQueueMetrics();
    const enrichment = await buildEnrichmentMetrics().catch(() => null);
    const { buildDiscoveryIntelligenceMetrics } = await import(
      '../lib/businessIngestion/businessEvolutionService.js'
    );
    const discoveryIntelligence = await buildDiscoveryIntelligenceMetrics().catch(() => null);
    const controlCenter = buildControlCenterIngestionSnapshot({
      totalSeeds: metrics.totalSeeds,
      byVerificationStatus: metrics.byVerificationStatus,
      bySourceType: metrics.bySourceType,
      recentRuns: metrics.recentRuns,
      qaPendingCount: qaPending.length,
      claimQueue,
      enrichment,
      discoveryIntelligence,
    });
    return res.status(200).json({
      ok: true,
      metrics: {
        ...metrics,
        qaPendingCount: qaPending.length,
        qaAutoSuggestedCount: autoSuggested,
        claimQueue,
        pendingClaims: claimQueue.pendingClaims,
        verifiedClaims: claimQueue.verifiedClaims,
        rejectedClaims: claimQueue.rejectedClaims,
        duplicateBlocked: claimQueue.duplicateBlocked,
        activatedSeeds: claimQueue.activatedSeeds,
        activationRate: claimQueue.activationRate,
        operatingConversionRate: claimQueue.operatingConversionRate,
        averageVerificationDurationMs: claimQueue.averageVerificationDurationMs,
        averageActivationDurationMs: claimQueue.averageActivationDurationMs,
        stalledActivationCount: claimQueue.stalledActivationCount,
        enrichment,
        discoveryIntelligence,
        controlCenter,
      },
    });
  } catch (error) {
    console.error('[business-ingestion] metrics error:', error);
    next(error);
  }
});

/** GET /api/business-ingestion/claims */
router.get('/claims', requireAuth, requireSuperAdmin, async (req, res, next) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status.trim() : null;
    const claims = await listClaimsByStatus(status || undefined);
    const enriched = await enrichClaimsForDashboard(claims);
    return res.status(200).json({ ok: true, claims: enriched, total: enriched.length });
  } catch (error) {
    console.error('[business-ingestion] list claims error:', error);
    next(error);
  }
});

/** GET /api/business-ingestion/seeds */
router.get('/seeds', requireAuth, requireSuperAdmin, async (req, res, next) => {
  try {
    const view = typeof req.query.view === 'string' ? req.query.view : 'qa';

    if (view === 'claimable') {
      const seeds = await listClaimableSeeds();
      return res.status(200).json({ ok: true, seeds, total: seeds.length, view: 'claimable' });
    }

    const filters = parseQueueFilters(req.query);
    const queue = await listQaQueue(filters);
    return res.status(200).json({ ok: true, seeds: queue, total: queue.length, view: 'qa' });
  } catch (error) {
    console.error('[business-ingestion] list seeds error:', error);
    next(error);
  }
});

/** GET /api/business-ingestion/seeds/:id */
router.get('/seeds/:id', requireAuth, requireSuperAdmin, async (req, res, next) => {
  try {
    const record = await getSeedRecordById(req.params.id);
    if (!record) {
      return res.status(404).json({ ok: false, error: 'not_found' });
    }
    const [audit, claimAudit] = await Promise.all([
      listQaAuditEntries({ seedId: record.id, limit: 50 }),
      listClaimAuditEntries({ seedId: record.id, limit: 50 }),
    ]);
    return res.status(200).json({
      ok: true,
      seed: enrichQueueItem(record),
      audit,
      claimAudit,
      provenance: {
        sourceType: record.normalized.sourceType,
        sourceReference: record.normalized.sourceReference,
        sourceRowId: record.normalized.sourceRowId,
        ingestedAt: record.normalized.ingestedAt,
      },
      matchEvidence: record.matchEvidence,
    });
  } catch (error) {
    console.error('[business-ingestion] get seed error:', error);
    next(error);
  }
});

/** GET /api/business-ingestion/runs */
router.get('/runs', requireAuth, requireSuperAdmin, async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const runs = await listIngestionRuns(limit);
    return res.status(200).json({ ok: true, runs });
  } catch (error) {
    console.error('[business-ingestion] list runs error:', error);
    next(error);
  }
});

/** POST /api/business-ingestion/run */
router.post('/run', requireAuth, requireSuperAdmin, async (req, res, next) => {
  try {
    const body = req.body ?? {};
    const adapterType = String(body.adapter ?? 'open_data_url');
    const persistStores = body.persistStores === true;

    let adapter;
    if (adapterType === 'csv') {
      if (!body.filePath && !body.content) {
        return res.status(400).json({ ok: false, error: 'missing_csv_source' });
      }
      adapter = new CsvAdapter({
        filePath: body.filePath,
        content: body.content,
        sourceReference: body.sourceReference,
        fieldMap: body.fieldMap,
      });
    } else if (adapterType === 'google_sheet') {
      if (!body.spreadsheetId) {
        return res.status(400).json({ ok: false, error: 'missing_spreadsheet_id' });
      }
      adapter = new GoogleSheetAdapter({
        spreadsheetId: body.spreadsheetId,
        gid: body.gid,
        fieldMap: body.fieldMap,
      });
    } else {
      if (!body.url) {
        return res.status(400).json({ ok: false, error: 'missing_url' });
      }
      adapter = new OpenDataUrlAdapter({
        url: body.url,
        format: body.format,
        recordsPath: body.recordsPath,
        fieldMap: body.fieldMap,
      });
    }

    const result = await runIngestion(adapter, { persistStores, persistSeeds: true });
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    console.error('[business-ingestion] run error:', error);
    next(error);
  }
});

/** POST /api/business-ingestion/seeds/:id/approve */
router.post('/seeds/:id/approve', requireAuth, requireSuperAdmin, async (req, res, next) => {
  try {
    const reason = typeof req.body?.reason === 'string' ? req.body.reason : null;
    const result = await approveSeed(req.params.id, req.userId, reason);
    return res.status(result.ok ? 200 : 400).json(result);
  } catch (error) {
    console.error('[business-ingestion] approve error:', error);
    next(error);
  }
});

/** POST /api/business-ingestion/seeds/:id/reject */
router.post('/seeds/:id/reject', requireAuth, requireSuperAdmin, async (req, res, next) => {
  try {
    const reason = typeof req.body?.reason === 'string' ? req.body.reason : null;
    const result = await rejectSeed(req.params.id, req.userId, reason);
    return res.status(result.ok ? 200 : 400).json(result);
  } catch (error) {
    console.error('[business-ingestion] reject error:', error);
    next(error);
  }
});

/** POST /api/business-ingestion/seeds/:id/mark-duplicate */
router.post('/seeds/:id/mark-duplicate', requireAuth, requireSuperAdmin, async (req, res, next) => {
  try {
    const canonicalSeedId = typeof req.body?.canonicalSeedId === 'string' ? req.body.canonicalSeedId.trim() : '';
    if (!canonicalSeedId) {
      return res.status(400).json({ ok: false, error: 'canonicalSeedId required' });
    }
    const reason = typeof req.body?.reason === 'string' ? req.body.reason : null;
    const result = await markSeedDuplicate(req.params.id, req.userId, canonicalSeedId, reason);
    return res.status(result.ok ? 200 : 400).json(result);
  } catch (error) {
    console.error('[business-ingestion] mark-duplicate error:', error);
    next(error);
  }
});

/** POST /api/business-ingestion/seeds/:id/merge */
router.post('/seeds/:id/merge', requireAuth, requireSuperAdmin, async (req, res, next) => {
  try {
    const canonicalSeedId = typeof req.body?.canonicalSeedId === 'string' ? req.body.canonicalSeedId.trim() : '';
    if (!canonicalSeedId) {
      return res.status(400).json({ ok: false, error: 'canonicalSeedId required' });
    }
    const reason = typeof req.body?.reason === 'string' ? req.body.reason : null;
    const result = await mergeSeedIntoCanonical(req.params.id, canonicalSeedId, req.userId, reason);
    return res.status(result.ok ? 200 : 400).json(result);
  } catch (error) {
    console.error('[business-ingestion] merge error:', error);
    next(error);
  }
});

/** POST /api/business-ingestion/seeds/:id/send-back-to-review */
router.post('/seeds/:id/send-back-to-review', requireAuth, requireSuperAdmin, async (req, res, next) => {
  try {
    const reason = typeof req.body?.reason === 'string' ? req.body.reason : null;
    const result = await sendSeedBackToReview(req.params.id, req.userId, reason);
    return res.status(result.ok ? 200 : 400).json(result);
  } catch (error) {
    console.error('[business-ingestion] send-back error:', error);
    next(error);
  }
});

/** POST /api/business-ingestion/seeds/:id/claim — start ownership claim */
router.post('/seeds/:id/claim', requireAuth, async (req, res, next) => {
  try {
    const body = req.body ?? {};
    const proofType = typeof body.proofType === 'string' ? body.proofType.trim() : '';
    const contact = typeof body.contact === 'string' ? body.contact.trim() : '';
    if (!VALID_PROOF_TYPES.has(proofType)) {
      return res.status(400).json({ ok: false, error: 'invalid_proof_type' });
    }
    if (!contact) {
      return res.status(400).json({ ok: false, error: 'contact_required' });
    }
    const result = await startSeedClaim({
      seedId: req.params.id,
      claimantUserId: req.userId,
      proofType,
      contact,
    });
    return res.status(result.ok ? 200 : 400).json(result);
  } catch (error) {
    console.error('[business-ingestion] claim start error:', error);
    next(error);
  }
});

/** POST /api/business-ingestion/seeds/:id/claim/verify */
router.post('/seeds/:id/claim/verify', requireAuth, async (req, res, next) => {
  try {
    const body = req.body ?? {};
    const result = await verifySeedClaimProof({
      seedId: req.params.id,
      claimantUserId: req.userId,
      otp: body.otp ?? null,
      proofValue: body.proofValue ?? body.contact ?? null,
    });
    return res.status(result.ok ? 200 : 400).json(result);
  } catch (error) {
    console.error('[business-ingestion] claim verify error:', error);
    next(error);
  }
});

/** POST /api/business-ingestion/seeds/:id/activate — owner confirms profile */
router.post('/seeds/:id/activate', requireAuth, async (req, res, next) => {
  try {
    const actorIsPlatformAdmin =
      hasRole(req.user, 'super_admin') ||
      (process.env.NODE_ENV !== 'production' && req.user?.isDevAdmin === true);
    const result = await activateSeedAfterOwnerConfirmation({
      seedId: req.params.id,
      ownerUserId: req.userId,
      confirmed: req.body?.confirmed === true,
      actorIsPlatformAdmin,
    });
    if (result.ok && result.seed) {
      await upsertSeedRecords([result.seed]);
    }
    return res.status(result.ok ? 200 : 400).json(result);
  } catch (error) {
    console.error('[business-ingestion] activate error:', error);
    next(error);
  }
});

/** POST /api/business-ingestion/claims/:claimId/reject — admin reject claim */
router.post('/claims/:claimId/reject', requireAuth, requireSuperAdmin, async (req, res, next) => {
  try {
    const seedId = typeof req.body?.seedId === 'string' ? req.body.seedId.trim() : '';
    if (!seedId) {
      return res.status(400).json({ ok: false, error: 'seedId required' });
    }
    const reason = typeof req.body?.reason === 'string' ? req.body.reason : null;
    const result = await rejectSeedClaim({
      seedId,
      claimRequestId: req.params.claimId,
      reviewerId: req.userId,
      reason,
    });
    return res.status(result.ok ? 200 : 400).json(result);
  } catch (error) {
    console.error('[business-ingestion] claim reject error:', error);
    next(error);
  }
});

export default router;
