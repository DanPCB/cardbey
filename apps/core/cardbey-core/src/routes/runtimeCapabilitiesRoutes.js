/**
 * GET /api/runtime/capabilities — Runtime capability negotiation (public, no auth).
 */

import express from 'express';
import { getRuntimeCapabilities } from '../lib/runtime/runtimeCapabilitiesService.js';
import { getRuntimeKernelStagingSnapshot } from '../lib/runtime/runtimeKernelStaging.js';

const router = express.Router();

router.get('/', (_req, res) => {
  const capabilities = getRuntimeCapabilities();
  return res.status(200).json({
    ...capabilities,
    runtimeKernelRollout: getRuntimeKernelStagingSnapshot(),
  });
});

export default router;
