import express from 'express';
import { getFeatureFlagsSnapshot } from '../config/featureFlags.js';

const router = express.Router();

router.get('/features', (_req, res) => {
  res.json({
    ok: true,
    features: getFeatureFlagsSnapshot(),
  });
});

export default router;
