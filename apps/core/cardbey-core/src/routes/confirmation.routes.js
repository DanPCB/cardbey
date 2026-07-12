/**
 * Orchestration pipeline confirmation API.
 *
 * POST /api/pipeline/confirm
 * GET  /api/pipeline/:id/status
 */
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  confirmOrchestrationPipeline,
  getOrchestrationPipelineStatus,
} from '../lib/orchestration/createMissionPipeline.js';

const router = Router();

router.post('/pipeline/confirm', requireAuth, async (req, res) => {
  const pipelineId =
    typeof req.body?.pipelineId === 'string'
      ? req.body.pipelineId.trim()
      : typeof req.body?.missionId === 'string'
        ? req.body.missionId.trim()
        : '';
  const userId = req.user?.id ?? null;

  if (!pipelineId) {
    return res.status(400).json({ success: false, error: 'pipelineId required' });
  }
  if (!userId) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  try {
    const pipeline = await confirmOrchestrationPipeline(pipelineId, userId);
    return res.json({
      success: true,
      message: 'Pipeline confirmed and started',
      pipeline,
      missionId: pipeline.id,
      action:
        pipeline.type === 'campaign_orchestration'
          ? 'campaign_orchestration_dispatched'
          : 'multi_agent_dispatched',
    });
  } catch (error) {
    console.error('[Confirmation] Error:', error?.message ?? error);
    return res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

router.get('/pipeline/:id/status', requireAuth, async (req, res) => {
  const id = String(req.params.id ?? '').trim();
  if (!id) {
    return res.status(400).json({ success: false, error: 'pipeline id required' });
  }

  try {
    const pipeline = await getOrchestrationPipelineStatus(id);
    if (!pipeline) {
      return res.status(404).json({ success: false, error: 'Pipeline not found' });
    }
    return res.json({ success: true, pipeline });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
