/**
 * Device Pairing Flow
 * Orchestrator agent flow for pairing devices
 * 
 * Flow: Device requests pairing → Generate code → User confirms → Device paired
 */

import { callTool } from '../runtime/toolExecutor.js';
import { logger } from '../services/logger.js';
import { getEventEmitter } from '../../engines/device/events.js';

/**
 * Flow input interface
 */
export interface DevicePairingFlowInput {
  tenantId?: string; // Optional for Step 1 (TV app side)
  storeId?: string; // Optional for Step 1 (TV app side)
  model?: string;
  name?: string;
  location?: string;
  pairingCode?: string; // If provided, completes pairing (Step 2 - dashboard side)
}

/**
 * Flow result interface
 */
export interface DevicePairingFlowResult {
  ok: boolean;
  flow?: string;
  deviceId?: string;
  pairingCode?: string;
  status?: string;
  error?: {
    message: string;
  };
}

/**
 * Tool context interface
 */
interface FlowContext {
  services?: {
    events?: ReturnType<typeof getEventEmitter>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/**
 * Device Pairing Flow
 * 
 * Steps:
 * 1. Request pairing (if no pairingCode provided)
 * 2. Complete pairing (if pairingCode provided)
 * 3. Return result
 * 
 * @param input - Flow input parameters
 * @param ctx - Execution context
 * @returns Flow result
 */
export async function device_pairing_flow(
  input: DevicePairingFlowInput,
  ctx?: FlowContext
): Promise<DevicePairingFlowResult> {
  try {
    if (input.pairingCode) {
      // STEP 2: Complete pairing (dashboard side)
      // tenantId/storeId are required for completion
      if (!input.tenantId || !input.storeId) {
        throw new Error('tenantId and storeId are required to complete pairing');
      }
      
      logger.info('[device_pairing_flow] Step 2: Completing pairing (dashboard side)', {
        pairingCode: input.pairingCode,
        tenantId: input.tenantId,
        storeId: input.storeId,
      });
      
      const completeRes = await callTool(
        'device.complete-pairing',
        {
          tenantId: input.tenantId,
          storeId: input.storeId,
          pairingCode: input.pairingCode,
        },
        ctx
      );
      
      if (!completeRes.ok || !completeRes.data) {
        throw new Error(
          completeRes.error || 'Failed to complete pairing'
        );
      }
      
      const completeData = completeRes.data as {
        deviceId: string;
        status: string;
      };
      
      logger.info('[device_pairing_flow] Pairing completed', {
        deviceId: completeData.deviceId,
      });
      
      return {
        ok: true,
        flow: 'device_pairing_flow',
        deviceId: completeData.deviceId,
        status: completeData.status,
      };
    } else {
      // STEP 1: Request pairing (TV app side)
      // tenantId/storeId can be provisional/unknown during initial pairing
      logger.info('[device_pairing_flow] Step 1: Requesting pairing (TV app side)', {
        tenantId: input.tenantId || 'provisional',
        storeId: input.storeId || 'provisional',
      });
      
      const requestRes = await callTool(
        'device.request-pairing',
        {
          tenantId: input.tenantId, // Optional - will be provisional if not provided
          storeId: input.storeId, // Optional - will be provisional if not provided
          model: input.model,
          name: input.name,
          location: input.location,
        },
        ctx
      );
      
      if (!requestRes.ok || !requestRes.data) {
        throw new Error(
          requestRes.error || 'Failed to request pairing'
        );
      }
      
      const requestData = requestRes.data as {
        deviceId: string;
        pairingCode: string;
      };
      
      logger.info('[device_pairing_flow] Pairing code generated', {
        deviceId: requestData.deviceId,
        pairingCode: requestData.pairingCode,
      });
      
      return {
        ok: true,
        flow: 'device_pairing_flow',
        deviceId: requestData.deviceId,
        pairingCode: requestData.pairingCode,
      };
    }
  } catch (err) {
    logger.error('[device_pairing_flow] Flow error', {
      error: err.message,
      stack: err.stack,
      input: {
        tenantId: input.tenantId,
        storeId: input.storeId,
      },
    });
    
    return {
      ok: false,
      error: {
        message: err.message || 'Device pairing flow failed',
      },
    };
  }
}

