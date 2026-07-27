/**
 * Unified execution API — checkpoint respond/resume for all mission pipeline types.
 *
 * POST /api/execution/:executionId/checkpoint
 *   Body: { stepId: string, response: unknown, data?: object }
 */

import { Router } from 'express';
import { optionalAuth } from '../middleware/auth.js';
import {
  applyDeprecatedCheckpointHeaders,
  handleExecutionCheckpoint,
  parseExecutionCheckpointBody,
  toExecutionCheckpointHttpResponse,
} from '../lib/execution/handleExecutionCheckpoint.js';

const router = Router();

/**
 * POST /api/execution/:executionId/checkpoint
 * Canonical owner checkpoint respond for store, launch_campaign, and all MissionPipeline checkpoints.
 */
router.post('/:executionId/checkpoint', optionalAuth, async (req, res, next) => {
  try {
    const executionId =
      typeof req.params.executionId === 'string' ? req.params.executionId.trim() : '';
    const { stepId, response, data } = parseExecutionCheckpointBody(req.body ?? {});

    const checkpointResult = await handleExecutionCheckpoint({
      user: req.user ?? {},
      executionId,
      stepId,
      response,
      data,
      source: 'execution_checkpoint_api',
    });

    const http = toExecutionCheckpointHttpResponse(checkpointResult, executionId);
    return res.status(http.statusCode).json(http.body);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/execution/:executionId/respond
 * @deprecated Alias — use /checkpoint. Kept for transitional clients.
 */
router.post('/:executionId/respond', optionalAuth, async (req, res, next) => {
  applyDeprecatedCheckpointHeaders(res, 'missionsRespond');
  try {
    const executionId =
      typeof req.params.executionId === 'string' ? req.params.executionId.trim() : '';
    const { stepId, response, data } = parseExecutionCheckpointBody(req.body ?? {});

    const checkpointResult = await handleExecutionCheckpoint({
      user: req.user ?? {},
      executionId,
      stepId,
      response,
      data,
      source: 'execution_respond_alias_deprecated',
    });

    const http = toExecutionCheckpointHttpResponse(checkpointResult, executionId);
    return res.status(http.statusCode).json(http.body);
  } catch (err) {
    next(err);
  }
});

export default router;
