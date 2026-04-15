/**
 * Device Engine Types - Canonical Contract
 * Zod schemas for input/output validation matching the Device Agent Contract spec
 */

import { z } from 'zod';

/**
 * Request Pairing Input (Device-initiated, no auth required)
 * 
 * Required: deviceModel, platform, appVersion (non-empty strings)
 * Optional: capabilities, initialState
 */
export const RequestPairingInput = z.object({
  deviceModel: z.string().min(1, 'deviceModel must be a non-empty string'),
  platform: z.string().min(1, 'platform must be a non-empty string'), // Accept any string, not just enum
  appVersion: z.string().min(1, 'appVersion must be a non-empty string'), // Required, not optional
  capabilities: z.object({
    supportsVideo: z.boolean().optional(),
    supportsImage: z.boolean().optional(),
    supportsWeb: z.boolean().optional(),
    orientation: z.enum(['landscape', 'portrait', 'auto']).optional(),
  }).optional(),
  initialState: z.object({
    locale: z.string().optional(),
    timezone: z.string().optional(),
  }).optional(),
});

/**
 * Request Pairing Output
 */
export const RequestPairingOutput = z.object({
  deviceId: z.string(),
  pairingCode: z.string(),
  expiresAt: z.string(), // ISO 8601 datetime
});

/**
 * Complete Pairing Input (Dashboard-initiated)
 *
 * Device Identity Contract:
 * - Must be authenticated (tenant is taken from auth context; body tenantId is ignored).
 * - Must include a deterministic device/session id (pairingCode alone is not sufficient).
 */
export const CompletePairingInput = z.object({
  pairingCode: z.string(),
  storeId: z.string(),
  // Deterministic resolution key (device session id)
  sessionId: z.string().optional(),
  deviceId: z.string().optional(),
  // Backward compatibility: tenantId may still be sent by older callers but will be ignored when auth exists.
  tenantId: z.string().optional(),
  name: z.string().optional(),
  location: z.string().optional(),
}).superRefine((v, ctx) => {
  const sid = (v.sessionId || v.deviceId || '').trim();
  if (!sid) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'sessionId or deviceId is required',
      path: ['sessionId'],
    });
  }
});

/**
 * Complete Pairing Output
 */
export const CompletePairingOutput = z.object({
  deviceId: z.string(),
  status: z.string(), // "online" | "offline" | "degraded"
  type: z.string(), // "screen"
  storeId: z.string(),
});

/**
 * Heartbeat Input (Device-initiated, no auth required)
 */
export const HeartbeatInput = z.object({
  deviceId: z.string(),
  status: z.enum(['online', 'idle', 'playing', 'error', 'degraded']),
  playbackState: z.object({
    playlistId: z.string().optional(),
    playlistVersion: z.number().optional(),
    currentItemId: z.string().optional(),
    currentIndex: z.number().optional(),
    progressSeconds: z.number().optional(),
    isPlaying: z.boolean().optional(),
  }).optional(),
  metrics: z.object({
    batteryLevel: z.number().nullable().optional(),
    storageFreeMb: z.number().optional(),
    wifiStrength: z.number().optional(),
    temperatureC: z.number().optional(),
  }).optional(),
  errorCode: z.string().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  platform: z.string().optional(),
  appVersion: z.string().optional(),
  ip: z.string().optional(),
  executedCommandIds: z.array(z.string()).optional(), // Array of command IDs that were executed
  executedCommands: z.array(z.object({
    id: z.string(),
    status: z.enum(['done', 'failed']),
  })).optional(), // Legacy format, kept for backward compatibility
});

/**
 * Heartbeat Output
 */
export const HeartbeatOutput = z.object({
  ok: z.boolean(),
  paired: z.boolean(),
  status: z.string(),
  commands: z.array(z.object({
    id: z.string(),
    type: z.enum(['reload', 'next', 'prev', 'pause', 'resume', 'repair', 'setBrightness']),
    payload: z.record(z.any()).optional(),
  })).optional(),
  playlistLock: z.object({
    locked: z.boolean(),
    playlistId: z.string().optional(),
  }).optional(),
  playlist: z.object({
    id: z.string(),
    version: z.number(),
    name: z.string(),
    items: z.array(z.object({
      id: z.string(),
      type: z.enum(['image', 'video']),
      url: z.string(),
      durationSeconds: z.number().optional(),
      transition: z.string().optional(),
      meta: z.record(z.any()).optional(),
    })),
  }).optional(),
  nextHeartbeatInSeconds: z.number().default(30),
});

/**
 * Confirm Playlist Ready Input
 */
// playlistVersion: devices often send the binding version string (e.g. "playlistId:timestamp"), not a number.
export const ConfirmPlaylistReadyInput = z.object({
  deviceId: z.string(),
  playlistId: z.string(),
  playlistVersion: z.union([z.number(), z.string()]),
  status: z.enum(['ready', 'failed']),
});

/**
 * Confirm Playlist Ready Output
 */
export const ConfirmPlaylistReadyOutput = z.object({
  ok: z.boolean(),
});

/**
 * Push Playlist Input (Server-side only)
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

/**
 * Trigger Repair Input (Server-side only)
 * Only deviceId is required; tenantId/storeId will be looked up from device
 */
export const TriggerRepairInput = z.object({
  deviceId: z.string().min(1, 'deviceId is required'),
  repairType: z.enum(['reset_pairing', 'reload_playlist', 'clear_cache', 'full_reset']).optional(),
  // Optional: if provided, will be validated against device
  tenantId: z.string().optional(),
  storeId: z.string().optional(),
});

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

/**
 * Pair Alert Input (Device-initiated fail-safe)
 */
export const PairAlertInput = z.object({
  deviceId: z.string().min(1, 'deviceId is required'),
  deviceType: z.string().optional(),
  ip: z.string().optional(),
  reason: z.enum(['connection_lost', 'pair_request']).default('connection_lost'),
});
