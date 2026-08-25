/**
 * Public Business Operation Intelligence routes — Phase A + B.
 * Mounted at /api/public/business-operation
 *
 * Anonymous access permitted where security allows (no auth required).
 */

import express from 'express';
import {
  adjustBusinessContext,
  advanceBusinessAnalysis,
  advanceFullAnalysis,
  applyTypeClarification,
  buildBusinessSnapshot,
  BUSINESS_OPERATION_EVENTS,
  BUSINESS_OPERATION_PUBLIC_CLIENT_EVENTS,
  confirmBusinessContext,
  continueWithDescription,
  getBusinessAnalysis,
  getFullAnalysis,
  isBusinessFullAnalysisV1Enabled,
  isBusinessOperationIntelligenceV1Enabled,
  isBusinessOperationPilotV1Enabled,
  recordBusinessOperationEvent,
  selectResolutionCandidate,
  startBusinessAnalysis,
  startFullAnalysis,
  understandBusinessContext,
} from '../lib/businessOperationIntelligence/index.js';

const router = express.Router();

function requireFeature(_req, res, next) {
  if (!isBusinessOperationIntelligenceV1Enabled()) {
    return res.status(404).json({
      ok: false,
      error: 'feature_disabled',
      message: 'Business Operation Intelligence is not enabled.',
    });
  }
  return next();
}

router.use(requireFeature);

/** POST /api/public/business-operation/understand */
router.post('/understand', async (req, res, next) => {
  try {
    const text = String(req.body?.text ?? req.body?.description ?? '').trim();
    if (!text || text.length < 3) {
      return res.status(400).json({
        ok: false,
        error: 'invalid_input',
        message: 'Describe your business in a few words.',
      });
    }

    const modeHint =
      req.body?.modeHint === 'EXISTING' || req.body?.modeHint === 'INTENDED'
        ? req.body.modeHint
        : null;
    const websiteHint =
      typeof req.body?.websiteHint === 'string' ? req.body.websiteHint.trim() : null;

    void recordBusinessOperationEvent(req, BUSINESS_OPERATION_EVENTS.ANALYSIS_STARTED, {
      phase: 'A',
    });

    const result = await understandBusinessContext({
      text,
      modeHint,
      websiteHint,
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error('[business-operation] understand error:', error);
    next(error);
  }
});

/** POST /api/public/business-operation/adjust */
router.post('/adjust', (req, res, next) => {
  try {
    const draft = req.body?.context;
    const adjustments = req.body?.adjustments || {};
    const result = adjustBusinessContext(draft, adjustments);
    if (!result.ok) {
      return res.status(400).json({ ok: false, error: 'invalid_context', message: result.error });
    }
    return res.status(200).json({
      ok: true,
      nextStep: 'confirm',
      message:
        result.context.mode === 'INTENDED'
          ? "Here's how I understand your business idea"
          : 'We think this is your business',
      context: result.context,
      ui: {
        headline:
          result.context.mode === 'INTENDED'
            ? "Here's how I understand your business idea"
            : 'We think this is your business',
        tone: result.context.mode === 'INTENDED' ? 'intended' : 'existing',
      },
    });
  } catch (error) {
    console.error('[business-operation] adjust error:', error);
    next(error);
  }
});

/** POST /api/public/business-operation/select-candidate */
router.post('/select-candidate', (req, res, next) => {
  try {
    const draft = req.body?.context;
    const entityId = String(req.body?.entityId ?? '').trim();
    if (!entityId) {
      return res.status(400).json({ ok: false, error: 'invalid_input', message: 'entityId required' });
    }
    const result = selectResolutionCandidate(draft, entityId);
    if (!result.ok) {
      return res.status(400).json({ ok: false, error: 'invalid_selection', message: result.error });
    }
    return res.status(200).json({
      ok: true,
      nextStep: 'confirm',
      message: 'We think this is your business',
      context: result.context,
      ui: {
        headline: 'We think this is your business',
        tone: 'existing',
      },
    });
  } catch (error) {
    console.error('[business-operation] select-candidate error:', error);
    next(error);
  }
});

/** POST /api/public/business-operation/continue-with-description */
router.post('/continue-with-description', (req, res, next) => {
  try {
    const result = continueWithDescription(req.body?.context);
    if (!result.ok) {
      return res.status(400).json({ ok: false, error: 'invalid_context', message: result.error });
    }
    return res.status(200).json({
      ok: true,
      nextStep: 'confirm',
      message: 'We think this is your business',
      context: result.context,
      ui: {
        headline: 'We think this is your business',
        tone: 'existing',
        fallbacks: ['enter_website', 'adjust_details'],
      },
    });
  } catch (error) {
    console.error('[business-operation] continue-with-description error:', error);
    next(error);
  }
});

/** POST /api/public/business-operation/clarify-type */
router.post('/clarify-type', async (req, res, next) => {
  try {
    const answer = String(req.body?.answer ?? req.body?.text ?? '').trim();
    if (!answer || answer.length < 3) {
      return res.status(400).json({
        ok: false,
        error: 'invalid_input',
        message: 'Please describe what the business does or provides.',
      });
    }
    const result = await applyTypeClarification(req.body?.context, answer);
    if (!result.ok) {
      return res.status(400).json({ ok: false, error: 'clarify_failed', message: result.error });
    }
    return res.status(200).json(result);
  } catch (error) {
    console.error('[business-operation] clarify-type error:', error);
    next(error);
  }
});

/** POST /api/public/business-operation/confirm */
router.post('/confirm', async (req, res, next) => {
  try {
    const result = confirmBusinessContext(req.body?.context);
    if (!result.ok) {
      return res.status(400).json({ ok: false, error: 'confirm_failed', message: result.error });
    }
    void recordBusinessOperationEvent(req, BUSINESS_OPERATION_EVENTS.CONTEXT_CONFIRMED, {
      phase: 'A',
      contextId: result.context?.contextId,
      mode: result.context?.mode,
    });
    return res.status(200).json(result);
  } catch (error) {
    console.error('[business-operation] confirm error:', error);
    next(error);
  }
});

/**
 * POST /api/public/business-operation/snapshot
 * Input: confirmed BusinessContext payload (provider-neutral).
 * Output: snapshot + evidence summaries + failure/partial states (no raw providers/prompts).
 */
router.post('/snapshot', async (req, res, next) => {
  try {
    const context = req.body?.context;
    if (!context || typeof context !== 'object') {
      return res.status(400).json({
        ok: false,
        error: 'invalid_input',
        message: 'Confirmed BusinessContext is required.',
      });
    }

    const result = await buildBusinessSnapshot({ context });
    if (!result.ok) {
      return res.status(400).json(result);
    }

    void recordBusinessOperationEvent(req, BUSINESS_OPERATION_EVENTS.SNAPSHOT_COMPLETED, {
      phase: 'B',
      contextId: result.contextId,
      mode: result.snapshot?.mode,
      snapshotId: result.snapshot?.snapshotId,
      totalMs: result.snapshot?.timing?.totalMs,
    });
    void recordBusinessOperationEvent(req, BUSINESS_OPERATION_EVENTS.SNAPSHOT_VIEWED, {
      phase: 'B',
      contextId: result.contextId,
      snapshotId: result.snapshot?.snapshotId,
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error('[business-operation] snapshot error:', error);
    next(error);
  }
});

/**
 * POST /api/public/business-operation/analyze
 * Start progressive analysis session (Phase C radar).
 */
router.post('/analyze', (req, res, next) => {
  try {
    const context = req.body?.context;
    if (!context || typeof context !== 'object') {
      return res.status(400).json({
        ok: false,
        error: 'invalid_input',
        message: 'Confirmed BusinessContext is required.',
      });
    }
    const result = startBusinessAnalysis({ context });
    if (!result.ok) {
      return res.status(400).json(result);
    }
    return res.status(200).json(result);
  } catch (error) {
    console.error('[business-operation] analyze start error:', error);
    next(error);
  }
});

/**
 * GET /api/public/business-operation/analyze/:analysisId
 * Read current progressive analysis state.
 */
router.get('/analyze/:analysisId', (req, res, next) => {
  try {
    const result = getBusinessAnalysis(String(req.params.analysisId || ''));
    if (!result.ok) {
      return res.status(404).json(result);
    }
    return res.status(200).json(result);
  } catch (error) {
    console.error('[business-operation] analyze get error:', error);
    next(error);
  }
});

/**
 * POST /api/public/business-operation/analyze/:analysisId/step
 * Advance one real analysis stage (polling progressive reveal).
 */
router.post('/analyze/:analysisId/step', async (req, res, next) => {
  try {
    const analysisId = String(req.params.analysisId || '');
    const result = await advanceBusinessAnalysis(analysisId);
    if (!result.ok) {
      const status = result.error === 'not_found' ? 404 : 400;
      return res.status(status).json(result);
    }

    if (result.status === 'completed' && result.snapshot) {
      void recordBusinessOperationEvent(req, BUSINESS_OPERATION_EVENTS.SNAPSHOT_COMPLETED, {
        phase: 'C',
        contextId: result.contextId,
        mode: result.mode,
        snapshotId: result.snapshot?.snapshotId,
        analysisId: result.analysisId,
      });
      void recordBusinessOperationEvent(req, BUSINESS_OPERATION_EVENTS.SNAPSHOT_VIEWED, {
        phase: 'C',
        contextId: result.contextId,
        snapshotId: result.snapshot?.snapshotId,
        analysisId: result.analysisId,
      });
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error('[business-operation] analyze step error:', error);
    next(error);
  }
});

/**
 * POST /api/public/business-operation/full-analysis
 * Start Phase D progressive full analysis (feature-flagged, default OFF).
 */
router.post('/full-analysis', (req, res, next) => {
  try {
    if (!isBusinessFullAnalysisV1Enabled()) {
      return res.status(404).json({
        ok: false,
        error: 'feature_disabled',
        message: 'Full business analysis is not enabled.',
      });
    }
    const context = req.body?.context;
    if (!context || typeof context !== 'object') {
      return res.status(400).json({
        ok: false,
        error: 'invalid_input',
        message: 'Confirmed BusinessContext is required.',
      });
    }
    void recordBusinessOperationEvent(req, BUSINESS_OPERATION_EVENTS.FULL_ANALYSIS_STARTED, {
      phase: 'D',
      contextId: context.contextId,
      mode: context.mode,
    });
    const result = startFullAnalysis({
      context,
      snapshot: req.body?.snapshot || null,
    });
    if (!result.ok) {
      return res.status(400).json(result);
    }
    return res.status(200).json(result);
  } catch (error) {
    console.error('[business-operation] full-analysis start error:', error);
    next(error);
  }
});

/** GET /api/public/business-operation/full-analysis/:analysisId */
router.get('/full-analysis/:analysisId', (req, res, next) => {
  try {
    if (!isBusinessFullAnalysisV1Enabled()) {
      return res.status(404).json({ ok: false, error: 'feature_disabled' });
    }
    const result = getFullAnalysis(String(req.params.analysisId || ''));
    if (!result.ok) return res.status(404).json(result);
    return res.status(200).json(result);
  } catch (error) {
    console.error('[business-operation] full-analysis get error:', error);
    next(error);
  }
});

/** POST /api/public/business-operation/full-analysis/:analysisId/step */
router.post('/full-analysis/:analysisId/step', async (req, res, next) => {
  try {
    if (!isBusinessFullAnalysisV1Enabled()) {
      return res.status(404).json({ ok: false, error: 'feature_disabled' });
    }
    const result = await advanceFullAnalysis(String(req.params.analysisId || ''));
    if (!result.ok) {
      const status = result.error === 'not_found' ? 404 : 400;
      return res.status(status).json(result);
    }
    if (result.status === 'completed' && (result.report || result.preview)) {
      void recordBusinessOperationEvent(req, BUSINESS_OPERATION_EVENTS.FULL_ANALYSIS_COMPLETED, {
        phase: 'D',
        analysisId: result.analysisId,
        contextId: result.contextId,
        mode: result.mode,
        reportId: result.report?.reportId || result.preview?.reportId,
        pilotProductization: Boolean(result.ui?.pilotProductization),
      });
      if (!result.ui?.pilotProductization) {
        void recordBusinessOperationEvent(req, BUSINESS_OPERATION_EVENTS.GROWTH_PLAN_VIEWED, {
          phase: 'D',
          analysisId: result.analysisId,
          reportId: result.report?.reportId,
        });
      }
    }
    return res.status(200).json(result);
  } catch (error) {
    console.error('[business-operation] full-analysis step error:', error);
    next(error);
  }
});

/**
 * POST /api/public/business-operation/event
 * Client funnel events (landing, preview viewed, unlock click, feedback).
 */
router.post('/event', async (req, res, next) => {
  try {
    const eventType = String(req.body?.eventType || '').trim();
    if (!BUSINESS_OPERATION_PUBLIC_CLIENT_EVENTS.includes(eventType)) {
      return res.status(400).json({
        ok: false,
        error: 'invalid_event',
        message: 'Unsupported event type.',
      });
    }
    const metadata = {
      phase: 'pilot',
      contextId: req.body?.contextId || null,
      snapshotId: req.body?.snapshotId || null,
      reportId: req.body?.reportId || null,
      mode: req.body?.mode || null,
      feedback: req.body?.feedback || null,
      stage: req.body?.stage || null,
      anonymousId: req.body?.marketingAttribution?.anonymousId || req.body?.anonymousId,
      correlationId: req.body?.marketingAttribution?.correlationId || req.body?.correlationId,
    };
    void recordBusinessOperationEvent(req, eventType, metadata);
    return res.status(200).json({ ok: true, eventType });
  } catch (error) {
    console.error('[business-operation] event error:', error);
    next(error);
  }
});

/**
 * POST /api/public/business-operation/pilot-interest
 * Unlock → Join Pilot / Notify Me. No payment. Minimal contact.
 */
router.post('/pilot-interest', async (req, res, next) => {
  try {
    if (!isBusinessOperationPilotV1Enabled()) {
      return res.status(404).json({
        ok: false,
        error: 'feature_disabled',
        message: 'Business Operation pilot is not enabled.',
      });
    }
    const contact = String(req.body?.contact || req.body?.email || '').trim().slice(0, 200);
    const note = String(req.body?.note || req.body?.feedback || '').trim().slice(0, 500);
    if (!contact && !req.body?.authenticated) {
      return res.status(400).json({
        ok: false,
        error: 'invalid_input',
        message: 'Add an email or phone so we can notify you.',
      });
    }

    void recordBusinessOperationEvent(req, BUSINESS_OPERATION_EVENTS.FULL_ANALYSIS_PILOT_INTEREST, {
      phase: 'pilot',
      contextId: req.body?.contextId || null,
      snapshotId: req.body?.snapshotId || null,
      reportId: req.body?.reportId || null,
      mode: req.body?.mode || null,
      hasContact: Boolean(contact),
      contactHint: contact ? contact.replace(/(.).+(@.|$)/, '$1…$2') : null,
      noteLength: note.length,
      anonymousId: req.body?.marketingAttribution?.anonymousId || req.body?.anonymousId,
      correlationId: req.body?.marketingAttribution?.correlationId || req.body?.correlationId,
      userId: req.body?.userId || null,
    });

    return res.status(200).json({
      ok: true,
      nextStep: 'pilot_joined',
      message:
        "Thanks — you're on the pilot list. We'll notify you when Full Business Analysis opens.",
    });
  } catch (error) {
    console.error('[business-operation] pilot-interest error:', error);
    next(error);
  }
});

export default router;
