/**
 * Device Repair Flow
 * Orchestrator agent flow for repairing devices
 * 
 * Flow: Trigger repair → Diagnose → Execute repair actions → Confirm repair
 */

import { callTool } from '../runtime/toolExecutor.js';
import { logger } from '../services/logger.js';
import { getEventEmitter } from '../../engines/device/events.js';

/**
 * Flow input interface
 */
export interface DeviceRepairFlowInput {
  tenantId: string;
  storeId: string;
  deviceId: string;
  repairType?: 'reset_pairing' | 'reload_playlist' | 'clear_cache' | 'full_reset';
}

/**
 * Flow result interface
 */
export interface DeviceRepairFlowResult {
  ok: boolean;
  flow?: string;
  repairId?: string;
  actions?: string[];
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
 * Device Repair Flow
 * 
 * Steps:
 * 1. Trigger repair with specified type
 * 2. Optionally re-push latest playlist
 * 3. Return repair result
 * 
 * @param input - Flow input parameters
 * @param ctx - Execution context
 * @returns Flow result
 */
export async function device_repair_flow(
  input: DeviceRepairFlowInput,
  ctx?: FlowContext
): Promise<DeviceRepairFlowResult> {
  try {
    logger.info('[device_repair_flow] Starting repair', {
      deviceId: input.deviceId,
      repairType: input.repairType || 'full_reset',
    });
    
    // Step 1: Trigger repair
    const repairRes = await callTool(
      'device.trigger-repair',
      {
        tenantId: input.tenantId,
        storeId: input.storeId,
        deviceId: input.deviceId,
        repairType: input.repairType || 'full_reset',
      },
      ctx
    );
    
    if (!repairRes.ok || !repairRes.data) {
      throw new Error(
        repairRes.error || 'Failed to trigger repair'
      );
    }
    
    const repairData = repairRes.data as {
      repairId: string;
      actions: string[];
    };
    
    logger.info('[device_repair_flow] Repair triggered', {
      repairId: repairData.repairId,
      actions: repairData.actions,
    });
    
    // Step 2: Optionally re-push latest playlist
    // This helps ensure the device gets the latest content after repair
    try {
      // Query for the latest playlist binding for this device
      const { PrismaClient } = await import('@prisma/client');
      const prisma = new PrismaClient();
      
      const latestBinding = await prisma.devicePlaylistBinding.findFirst({
        where: {
          deviceId: input.deviceId,
          status: 'ready',
        },
        orderBy: {
          lastPushedAt: 'desc',
        },
      });
      
      if (latestBinding) {
        logger.info('[device_repair_flow] Re-pushing latest playlist', {
          playlistId: latestBinding.playlistId,
          version: latestBinding.version,
        });
        
        // Get playlist items to re-push
        const playlist = await prisma.playlist.findUnique({
          where: { id: latestBinding.playlistId },
          include: {
            items: {
              include: {
                asset: true,
              },
              orderBy: { orderIndex: 'asc' },
            },
          },
        });
        
        if (playlist) {
          const playlistData = {
            items: playlist.items.map((item) => ({
              assetId: item.assetId,
              url: item.asset.url,
              type: item.asset.type,
              duration: item.duration || item.asset.duration,
              order: item.order,
            })),
          };
          
          await callTool(
            'device.push-playlist',
            {
              tenantId: input.tenantId,
              storeId: input.storeId,
              deviceId: input.deviceId,
              playlistId: latestBinding.playlistId,
              playlistData,
              version: latestBinding.version,
            },
            ctx
          );
          
          logger.info('[device_repair_flow] Playlist re-pushed successfully');
        }
      }
    } catch (playlistError) {
      // Non-critical: log but don't fail the repair
      logger.warn('[device_repair_flow] Failed to re-push playlist', {
        error: playlistError instanceof Error ? playlistError.message : String(playlistError),
      });
    }
    
    logger.info('[device_repair_flow] Repair flow completed', {
      repairId: repairData.repairId,
      actions: repairData.actions,
    });
    
    return {
      ok: true,
      flow: 'device_repair_flow',
      repairId: repairData.repairId,
      actions: repairData.actions,
    };
  } catch (err) {
    logger.error('[device_repair_flow] Flow error', {
      error: err.message,
      stack: err.stack,
      input: {
        tenantId: input.tenantId,
        storeId: input.storeId,
        deviceId: input.deviceId,
      },
    });
    
    return {
      ok: false,
      error: {
        message: err.message || 'Device repair flow failed',
      },
    };
  }
}



