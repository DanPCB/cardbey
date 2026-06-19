/**
 * Feature flags for Vision → Discovery pipeline.
 * Defaults: enabled on staging/local, disabled on production until reviewed.
 */

import { getFeatureFlag } from '../../env/loadEnv.js';

function isStagingDeploy(): boolean {
  const service = String(process.env.RENDER_SERVICE_NAME ?? '');
  if (/staging/i.test(service)) return true;
  const deployEnv = String(process.env.CARDBEY_DEPLOY_ENV ?? '').toLowerCase();
  if (deployEnv === 'staging' || deployEnv === 'development') return true;
  return process.env.NODE_ENV !== 'production';
}

const STAGING_DEFAULT = isStagingDeploy();

export function isVisionScanStorageEnabled(): boolean {
  return getFeatureFlag('ENABLE_VISION_SCAN_STORAGE', STAGING_DEFAULT);
}

export function isVisionToDiscoveryEnabled(): boolean {
  return getFeatureFlag('ENABLE_VISION_TO_DISCOVERY', STAGING_DEFAULT);
}

export function isVisionAutoSeedEnabled(): boolean {
  return getFeatureFlag('ENABLE_VISION_AUTO_SEED', STAGING_DEFAULT);
}
