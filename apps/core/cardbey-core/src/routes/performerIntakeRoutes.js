/**
 * Intake V1 — deprecated shim.
 *
 * POST /api/performer/intake forwards to Intake V2 with deprecation headers.
 * Legacy implementation archived at ./_deprecated/performerIntakeRoutes.v1.legacy.js
 */

import express from 'express';
import { requireUserOrGuest } from '../middleware/guestAuth.js';
import {
  applyIntakeV1DeprecationHeaders,
  logIntakeV1Deprecation,
} from '../lib/intake/intakeV1Deprecation.js';
import performerIntakeV2Routes from './performerIntakeV2Routes.js';

const router = express.Router();

/** Sub-app so v2 router stack handles the request without remounting at /v2. */
const forwardToIntakeV2 = express();
forwardToIntakeV2.use(performerIntakeV2Routes);

router.post('/', requireUserOrGuest, (req, res, next) => {
  applyIntakeV1DeprecationHeaders(res);
  logIntakeV1Deprecation(req);
  forwardToIntakeV2(req, res, next);
});

export default router;
