/**
 * Device Engine Types
 * Zod schemas for input/output validation
 */

import { z } from 'zod';

/**
 * Request Pairing Input
 * tenantId and storeId can be provisional/unknown during initial pairing
 */
export const RequestPairingInput = z.object({
  tenantId: z.string().optional(), // Optional for provisional pairing
  storeId: z.string().optional(), // Optional for provisional pairing
  model: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
});

export type RequestPairingInput = z.infer<typeof RequestPairingInput>;

/**
 * Request Pairing Output
 */
export const RequestPairingOutput = z.object({
  ok: z.boolean(),
  data: z.object({
    deviceId: z.string(),
    pairingCode: z.string(),
  }),
});

export type RequestPairingOutput = z.infer<typeof RequestPairingOutput>;

/**
 * Complete Pairing Input
 */
export const CompletePairingInput = z.object({
  tenantId: z.string(),
  storeId: z.string(),
  pairingCode: z.string(),
  deviceId: z.string().optional(),
  name: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
});

export type CompletePairingInput = z.infer<typeof CompletePairingInput>;

/**
 * Complete Pairing Output
 */
export const CompletePairingOutput = z.object({
  ok: z.boolean(),
  data: z.object({
    deviceId: z.string(),
    status: z.string(),
  }),
});

export type CompletePairingOutput = z.infer<typeof CompletePairingOutput>;

/**
 * Heartbeat Input
 */
export const HeartbeatInput = z.object({
  tenantId: z.string(),
  storeId: z.string(),
  deviceId: z.string(),
  status: z.enum(['online', 'offline', 'degraded']).optional(),
  appVersion: z.string().nullable().optional(),
  playlistVersion: z.string().nullable().optional(),
  storageFreeMb: z.number().int().nullable().optional(),
  wifiStrength: z.number().int().min(0).max(100).nullable().optional(),
  errorCodes: z.array(z.string()).optional(), // Array of error codes
  capabilities: z.record(z.boolean()).optional(),
  executedCommandIds: z.array(z.string()).optional(), // Command acknowledgements
});

export type HeartbeatInput = z.infer<typeof HeartbeatInput>;

/**
 * Heartbeat Output
 */
export const HeartbeatOutput = z.object({
  ok: z.boolean(),
  data: z.object({
    status: z.string(),
  }),
});

export type HeartbeatOutput = z.infer<typeof HeartbeatOutput>;

/**
 * Push Playlist Input
 */
export const PushPlaylistInput = z.object({
  tenantId: z.string(),
  storeId: z.string(),
  deviceId: z.string(),
  playlistId: z.string(),
  playlistData: z.object({
    items: z.array(
      z.object({
        assetId: z.string(),
        url: z.string(),
        type: z.string(),
        duration: z.number(),
        order: z.number(),
      })
    ),
  }),
  version: z.string(),
});

export type PushPlaylistInput = z.infer<typeof PushPlaylistInput>;

/**
 * Push Playlist Output
 */
export const PushPlaylistOutput = z.object({
  ok: z.boolean(),
  data: z.object({
    bindingId: z.string(),
    status: z.string(),
  }),
});

export type PushPlaylistOutput = z.infer<typeof PushPlaylistOutput>;

/**
 * Confirm Playlist Ready Input
 */
export const ConfirmPlaylistReadyInput = z.object({
  tenantId: z.string(),
  storeId: z.string(),
  deviceId: z.string(),
  playlistId: z.string(),
  version: z.string(),
});

export type ConfirmPlaylistReadyInput = z.infer<typeof ConfirmPlaylistReadyInput>;

/**
 * Confirm Playlist Ready Output
 */
export const ConfirmPlaylistReadyOutput = z.object({
  ok: z.boolean(),
  data: z.object({
    status: z.string(),
  }),
});

export type ConfirmPlaylistReadyOutput = z.infer<typeof ConfirmPlaylistReadyOutput>;

/**
 * Trigger Repair Input
 */
export const TriggerRepairInput = z.object({
  tenantId: z.string(),
  storeId: z.string(),
  deviceId: z.string(),
  repairType: z.enum(['reset_pairing', 'reload_playlist', 'clear_cache', 'full_reset']).optional(),
});

export type TriggerRepairInput = z.infer<typeof TriggerRepairInput>;

/**
 * Trigger Repair Output
 */
export const TriggerRepairOutput = z.object({
  ok: z.boolean(),
  data: z.object({
    repairId: z.string(),
    actions: z.array(z.string()),
  }),
});

export type TriggerRepairOutput = z.infer<typeof TriggerRepairOutput>;

