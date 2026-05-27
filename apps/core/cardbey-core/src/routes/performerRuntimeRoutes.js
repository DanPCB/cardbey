/**
 * Performer Runtime — read API (Phase 1.5).
 */

import { Router } from 'express';
import { optionalAuth } from '../middleware/auth.js';
import {
  getRuntimeByMissionId,
  getRuntimeById,
  getUnifiedRuntimeStream,
  runtimeContextSnapshot,
} from '../lib/runtime/performerRuntime/index.js';
import { dryRunExecutionPlan } from '../lib/runtime/performerRuntime/dryRunExecutionPlan.js';
import { executeAnalyzeStoreCapability } from '../lib/runtime/performerRuntime/executeAnalyzeStoreCapability.js';
import { executeCreateOfferDraftCapability } from '../lib/runtime/performerRuntime/executeCreateOfferDraftCapability.js';
import { executeReviseOfferDraftCapability } from '../lib/runtime/performerRuntime/executeReviseOfferDraftCapability.js';
import {
  listMissionExecutionRecords,
  persistMissionExecutionRecord,
  normalizeExecutionRecord,
} from '../lib/runtime/performerRuntime/executionRecords.js';
import { getSkillContract, SKILL_CONTRACTS } from '../lib/runtime/performerRuntime/skillContracts.js';

const router = Router();

/**
 * POST /api/performer/runtime/dry-run — validate plan against broker registry (no execution).
 */
router.post('/dry-run', optionalAuth, async (req, res) => {
  try {
    const result = await dryRunExecutionPlan(req.body ?? {});
    if (!result.ok) {
      const status = result.error === 'mission_id_required' ? 400 : 400;
      return res.status(status).json(result);
    }
    return res.json(result);
  } catch (err) {
    console.error('[performer/runtime/dry-run]', err);
    return res.status(500).json({ ok: false, error: 'dry_run_failed' });
  }
});

/**
 * POST /api/performer/runtime/capabilities/analyze-store — read-only store analysis.
 */
router.post('/capabilities/analyze-store', optionalAuth, async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const missionId = typeof body.missionId === 'string' ? body.missionId.trim() : '';
  const storeId = typeof body.storeId === 'string' ? body.storeId.trim() : '';
  if (!missionId) {
    return res.status(400).json({ ok: false, error: 'mission_id_required' });
  }
  if (!storeId) {
    return res.status(400).json({ ok: false, error: 'store_id_required', status: 'blocked' });
  }
  try {
    const result = await executeAnalyzeStoreCapability({
      missionId,
      storeId,
      draftId: body.draftId ?? null,
      generationRunId: body.generationRunId ?? null,
      focus: body.focus ?? 'performance',
      userId: req.user?.id ?? null,
      tenantId: req.user?.tenantId ?? null,
    });
    const httpStatus = result.status === 'blocked' ? 409 : result.ok ? 200 : 502;
    return res.status(httpStatus).json({
      ok: result.ok,
      status: result.status,
      output: result.output,
      error: result.error,
      code: result.code,
      missionId,
      storeId,
    });
  } catch (err) {
    console.error('[performer/runtime/analyze-store]', err);
    return res.status(500).json({ ok: false, error: 'analyze_store_failed' });
  }
});

/**
 * POST /api/performer/runtime/capabilities/create-offer-draft — draft offer artifact only (no publish).
 */
router.post('/capabilities/create-offer-draft', optionalAuth, async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const missionId = typeof body.missionId === 'string' ? body.missionId.trim() : '';
  const storeId = typeof body.storeId === 'string' ? body.storeId.trim() : '';
  if (!missionId) {
    return res.status(400).json({ ok: false, error: 'mission_id_required' });
  }
  if (!storeId) {
    return res.status(400).json({ ok: false, error: 'store_id_required', status: 'blocked' });
  }
  try {
    const result = await executeCreateOfferDraftCapability({
      missionId,
      storeId,
      draftId: body.draftId ?? null,
      generationRunId: body.generationRunId ?? null,
      selectedProducts: Array.isArray(body.selectedProducts) ? body.selectedProducts : null,
      userId: req.user?.id ?? null,
      tenantId: req.user?.tenantId ?? null,
    });
    const httpStatus = result.status === 'blocked' ? 409 : result.ok ? 200 : 502;
    return res.status(httpStatus).json({
      ok: result.ok,
      status: result.status,
      output: result.output,
      error: result.error,
      code: result.code,
      missionId,
      storeId,
    });
  } catch (err) {
    console.error('[performer/runtime/create-offer-draft]', err);
    return res.status(500).json({ ok: false, error: 'create_offer_draft_failed' });
  }
});

/**
 * POST /api/performer/runtime/capabilities/revise-offer-draft — new offer draft version (no publish).
 */
router.post('/capabilities/revise-offer-draft', optionalAuth, async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const missionId = typeof body.missionId === 'string' ? body.missionId.trim() : '';
  const storeId = typeof body.storeId === 'string' ? body.storeId.trim() : '';
  const revisionNotes = typeof body.revisionNotes === 'string' ? body.revisionNotes.trim() : '';
  const previousOfferDraft = body.previousOfferDraft;
  if (!missionId) {
    return res.status(400).json({ ok: false, error: 'mission_id_required' });
  }
  if (!storeId) {
    return res.status(400).json({ ok: false, error: 'store_id_required', status: 'blocked' });
  }
  if (!revisionNotes) {
    return res.status(400).json({ ok: false, error: 'revision_notes_required', status: 'blocked' });
  }
  if (!previousOfferDraft || typeof previousOfferDraft !== 'object') {
    return res.status(400).json({ ok: false, error: 'previous_offer_draft_required', status: 'blocked' });
  }
  try {
    const result = await executeReviseOfferDraftCapability({
      missionId,
      storeId,
      previousOfferDraft,
      revisionNotes,
      createdFromExecutionId: body.createdFromExecutionId ?? null,
      draftId: body.draftId ?? null,
      generationRunId: body.generationRunId ?? null,
      userId: req.user?.id ?? null,
      tenantId: req.user?.tenantId ?? null,
    });
    const httpStatus =
      result.status === 'blocked' ? 409 : result.ok ? 200 : 502;
    return res.status(httpStatus).json({
      ok: result.ok,
      status: result.status,
      output: result.output,
      error: result.error,
      code: result.code,
      missionId,
      storeId,
    });
  } catch (err) {
    console.error('[performer/runtime/revise-offer-draft]', err);
    return res.status(500).json({ ok: false, error: 'revise_offer_draft_failed' });
  }
});

/**
 * GET /api/performer/runtime/skills/contracts — skill contract catalog (read-only).
 */
router.get('/skills/contracts', optionalAuth, (_req, res) => {
  return res.json({ ok: true, version: 1, contracts: SKILL_CONTRACTS });
});

/**
 * GET /api/performer/runtime/skills/:skillId/contract
 */
router.get('/skills/:skillId/contract', optionalAuth, (req, res) => {
  const skillId = typeof req.params.skillId === 'string' ? req.params.skillId.trim() : '';
  const contract = getSkillContract(skillId);
  if (!contract) {
    return res.status(404).json({ ok: false, error: 'skill_contract_not_found' });
  }
  return res.json({ ok: true, contract });
});

/**
 * GET /api/performer/runtime/:missionId/executions — persisted execution records.
 */
router.get('/:missionId/executions', optionalAuth, async (req, res) => {
  const missionId = typeof req.params.missionId === 'string' ? req.params.missionId.trim() : '';
  if (!missionId) {
    return res.status(400).json({ ok: false, error: 'mission_id_required' });
  }
  try {
    const records = await listMissionExecutionRecords(missionId);
    return res.json({ ok: true, missionId, records });
  } catch (err) {
    console.error('[performer/runtime/executions GET]', err);
    return res.status(500).json({ ok: false, error: 'executions_list_failed' });
  }
});

/**
 * POST /api/performer/runtime/:missionId/executions — upsert one execution record.
 */
router.post('/:missionId/executions', optionalAuth, async (req, res) => {
  const missionId = typeof req.params.missionId === 'string' ? req.params.missionId.trim() : '';
  if (!missionId) {
    return res.status(400).json({ ok: false, error: 'mission_id_required' });
  }
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const record = normalizeExecutionRecord({ ...body.record, missionId: body.record?.missionId ?? missionId });
  if (!record) {
    return res.status(400).json({ ok: false, error: 'invalid_execution_record' });
  }
  try {
    const bundle = await persistMissionExecutionRecord(missionId, record);
    return res.json({ ok: true, missionId, bundle });
  } catch (err) {
    console.error('[performer/runtime/executions POST]', err);
    return res.status(500).json({ ok: false, error: 'executions_persist_failed' });
  }
});

/**
 * GET /api/performer/runtime/:missionId/stream — unified operational timeline.
 */
router.get('/:missionId/stream', optionalAuth, async (req, res) => {
  const missionId = typeof req.params.missionId === 'string' ? req.params.missionId.trim() : '';
  if (!missionId) {
    return res.status(400).json({ ok: false, error: 'mission_id_required' });
  }
  const afterSeq = req.query.afterSeq != null ? parseInt(String(req.query.afterSeq), 10) : undefined;
  const limit = req.query.limit != null ? parseInt(String(req.query.limit), 10) : undefined;
  const { events, error } = await getUnifiedRuntimeStream(missionId, {
    ...(Number.isFinite(afterSeq) ? { afterSeq } : {}),
    ...(Number.isFinite(limit) ? { limit } : {}),
  });
  if (error) {
    return res.status(400).json({ ok: false, error });
  }
  return res.json({ ok: true, missionId, events });
});

/**
 * GET /api/performer/runtime/:missionId/state — authoritative runtime snapshot.
 */
router.get('/:missionId/state', optionalAuth, async (req, res) => {
  const missionId = typeof req.params.missionId === 'string' ? req.params.missionId.trim() : '';
  if (!missionId) {
    return res.status(400).json({ ok: false, error: 'mission_id_required' });
  }
  const ctx = getRuntimeByMissionId(missionId);
  if (!ctx) {
    return res.json({ ok: true, missionId, runtime: null });
  }
  return res.json({
    ok: true,
    missionId,
    runtime: runtimeContextSnapshot(ctx),
    graph: ctx.actionGraph,
  });
});

/**
 * GET /api/performer/runtime/by-id/:runtimeId — runtime by runtimeId.
 */
router.get('/by-id/:runtimeId', optionalAuth, async (req, res) => {
  const runtimeId = typeof req.params.runtimeId === 'string' ? req.params.runtimeId.trim() : '';
  if (!runtimeId) {
    return res.status(400).json({ ok: false, error: 'runtime_id_required' });
  }
  const ctx = getRuntimeById(runtimeId);
  if (!ctx) {
    return res.json({ ok: true, runtimeId, runtime: null });
  }
  return res.json({
    ok: true,
    runtimeId,
    runtime: runtimeContextSnapshot(ctx),
    graph: ctx.actionGraph,
  });
});

export default router;
