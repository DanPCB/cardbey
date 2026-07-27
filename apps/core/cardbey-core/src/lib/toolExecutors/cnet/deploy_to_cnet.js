// DANH: skill-round5-cnet
/**
 * deploy_to_cnet — deploy store content to C-Net when configured, or report blocked status.
 */

import { makeCNetClient } from '../../../adapters/cnet.js';
import { EXECUTION_STATES } from '../../telemetry/executionStates.js';

function resolveCNetEndpoint() {
  return (process.env.CNET_ENDPOINT || process.env.CNET_BASE_URL || '').trim();
}

function isCNetConfigured() {
  return Boolean(process.env.CNET_API_KEY?.trim()) && Boolean(resolveCNetEndpoint());
}

/**
 * @param {object} input
 */
export async function execute(input = {}) {
  const configured = input?.configured === true || isCNetConfigured();

  if (!configured) {
    return {
      status: 'blocked',
      blocker: {
        code: 'CNET_NOT_CONFIGURED',
        message:
          'C-Net deployment requires CNET_API_KEY and CNET_ENDPOINT environment variables. Please contact support to set up C-Net.',
        requiredAction: 'Configure CNET_API_KEY and CNET_ENDPOINT',
      },
      output: {
        deployed: false,
        executionState: EXECUTION_STATES.BLOCKED,
        reason: 'C-Net deployment requires CNET_API_KEY and CNET_ENDPOINT in .env',
        documentation: 'https://docs.cardbey.com/cnet-setup',
        message: 'C-Net deployment requires API key setup',
      },
    };
  }

  const storeId =
    (typeof input?.storeId === 'string' ? input.storeId.trim() : '') ||
    (typeof input?.payload?.storeId === 'string' ? input.payload.storeId.trim() : '');

  if (!storeId) {
    return {
      status: 'blocked',
      blocker: {
        code: 'STORE_ID_REQUIRED',
        message: 'Store ID is required for C-Net deployment',
      },
      output: {
        deployed: false,
        executionState: EXECUTION_STATES.BLOCKED,
      },
    };
  }

  const payload = input?.payload ?? input?.preparedPayload ?? { storeId };
  const deviceIds = Array.isArray(input?.deviceIds) ? input.deviceIds : [];
  const schedule = typeof input?.schedule === 'string' ? input.schedule : 'now';
  const playlistId = `cnet-${storeId}-${Date.now()}`;

  try {
    const client = makeCNetClient();
    const result = await client.publishPlaylist({
      playlistId,
      storeId,
      ...payload,
      deviceIds,
      schedule,
    });

    return {
      status: 'ok',
      output: {
        deployed: true,
        executionState: EXECUTION_STATES.EXECUTED,
        deploymentId: result?.id ?? playlistId,
        message: `Content deployed to C-Net successfully${deviceIds.length ? ` to ${deviceIds.length} devices` : ''}`,
        devices: deviceIds,
        schedule,
        playlistId,
      },
    };
  } catch (error) {
    console.error('[deploy_to_cnet] Failed:', error);
    return {
      status: 'failed',
      error: {
        code: 'DEPLOY_FAILED',
        message: `Failed to deploy to C-Net: ${error?.message ?? 'unknown error'}`,
      },
      output: {
        deployed: false,
        executionState: EXECUTION_STATES.FAILED,
      },
    };
  }
}

export default execute;
