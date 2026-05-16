/**
 * Signage Engine Types
 * Zod schemas for input/output validation
 */

import { z } from 'zod';

/**
 * Create Playlist Input
 */
export const CreatePlaylistInput = z.object({
  tenantId: z.string(),
  storeId: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
});

export type CreatePlaylistInput = z.infer<typeof CreatePlaylistInput>;

/**
 * Create Playlist Output
 */
export const CreatePlaylistOutput = z.object({
  ok: z.boolean(),
  data: z.object({
    playlistId: z.string(),
  }),
});

export type CreatePlaylistOutput = z.infer<typeof CreatePlaylistOutput>;

/**
 * Add Assets to Playlist Input
 */
export const AddAssetsToPlaylistInput = z.object({
  tenantId: z.string(),
  storeId: z.string(),
  playlistId: z.string(),
  assets: z.array(
    z.object({
      assetId: z.string().optional(),
      url: z.string().optional(),
      type: z.enum(['image', 'video', 'html']),
      duration: z.number(),
      tags: z.string().nullable().optional(),
      order: z.number(),
      durationOverride: z.number().nullable().optional(),
    })
  ),
});

export type AddAssetsToPlaylistInput = z.infer<typeof AddAssetsToPlaylistInput>;

/**
 * Add Assets to Playlist Output
 */
export const AddAssetsToPlaylistOutput = z.object({
  ok: z.boolean(),
  data: z.object({
    itemCount: z.number(),
  }),
});

export type AddAssetsToPlaylistOutput = z.infer<typeof AddAssetsToPlaylistOutput>;

/**
 * Schedule Playlist Input
 */
export const SchedulePlaylistInput = z.object({
  tenantId: z.string(),
  storeId: z.string(),
  playlistId: z.string(),
  deviceId: z.string().nullable().optional(),
  deviceGroupId: z.string().nullable().optional(),
  startAt: z.string().nullable().optional(),
  endAt: z.string().nullable().optional(),
  daysOfWeek: z.string().nullable().optional(),
  timeRange: z.string().nullable().optional(),
});

export type SchedulePlaylistInput = z.infer<typeof SchedulePlaylistInput>;

/**
 * Schedule Playlist Output
 */
export const SchedulePlaylistOutput = z.object({
  ok: z.boolean(),
  data: z.object({
    scheduleId: z.string(),
  }),
});

export type SchedulePlaylistOutput = z.infer<typeof SchedulePlaylistOutput>;

/**
 * List devices (C-Net / signage screens) for a store
 */
export const ListDevicesInput = z.object({
  tenantId: z.string(),
  storeId: z.string(),
  status: z.enum(['online', 'all']).optional(),
});

export type ListDevicesInput = z.infer<typeof ListDevicesInput>;

export const ListDevicesOutput = z.object({
  ok: z.boolean(),
  data: z.object({
    count: z.number(),
    devices: z.array(
      z.object({
        deviceId: z.string(),
        name: z.string(),
        location: z.string(),
        status: z.string(),
        lastSeenAt: z.string().nullable(),
        currentPlaylistId: z.string().nullable(),
        currentPlaylistName: z.string().nullable(),
      }),
    ),
  }),
});

export type ListDevicesOutput = z.infer<typeof ListDevicesOutput>;

/**
 * Publish to Devices Input
 */
export const PublishToDevicesInput = z
  .object({
    tenantId: z.string(),
    storeId: z.string(),
    playlistId: z.string().nullable().optional(),
    deviceIds: z.array(z.string()).optional(),
    pushToAll: z.boolean().optional(),
  })
  .superRefine((val, ctx) => {
    const explicit = Boolean(val.pushToAll === true || (val.deviceIds && val.deviceIds.length > 0));
    const pid = val.playlistId != null ? String(val.playlistId).trim() : '';
    if (explicit && !pid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'playlistId is required when pushToAll or deviceIds is set',
        path: ['playlistId'],
      });
    }
  });

export type PublishToDevicesInput = z.infer<typeof PublishToDevicesInput>;

const publishDeviceRowSchema = z.object({
  deviceId: z.string(),
  name: z.string(),
  location: z.string(),
  ok: z.boolean(),
  error: z.string().optional(),
});

/**
 * Publish to Devices Output (schedule mode and/or explicit push mode)
 */
export const PublishToDevicesOutput = z.object({
  ok: z.boolean(),
  data: z.object({
    mode: z.enum(['schedule', 'explicit']).optional(),
    devicesUpdated: z.number().optional(),
    pushed: z.number().optional(),
    failed: z.number().optional(),
    playlistId: z.string().optional(),
    playlistName: z.string().optional(),
    devices: z.array(publishDeviceRowSchema).optional(),
  }),
});

export type PublishToDevicesOutput = z.infer<typeof PublishToDevicesOutput>;

/**
 * Generate from Menu Input
 */
export const GenerateFromMenuInput = z.object({
  tenantId: z.string(),
  storeId: z.string(),
  theme: z.string().nullable().optional(),
  filterCategoryIds: z.array(z.string()).optional(),
});

export type GenerateFromMenuInput = z.infer<typeof GenerateFromMenuInput>;

/**
 * Generate from Menu Output
 */
export const GenerateFromMenuOutput = z.object({
  ok: z.boolean(),
  data: z.object({
    assetIds: z.array(z.string()),
    assetUrls: z.array(z.string()),
  }),
});

export type GenerateFromMenuOutput = z.infer<typeof GenerateFromMenuOutput>;

/**
 * Query Device Playlist Input
 */
export const QueryDevicePlaylistInput = z.object({
  tenantId: z.string(),
  storeId: z.string(),
  deviceId: z.string(),
});

export type QueryDevicePlaylistInput = z.infer<typeof QueryDevicePlaylistInput>;

/**
 * Query Device Playlist Output
 */
export const QueryDevicePlaylistOutput = z.object({
  ok: z.boolean(),
  data: z.object({
    playlistId: z.string().nullable(),
    playlistName: z.string().nullable(),
    items: z.array(
      z.object({
        assetId: z.string(),
        url: z.string(),
        type: z.string(),
        duration: z.number(),
        order: z.number(),
      }),
    ),
    version: z.string().nullable().optional(),
    status: z.string().nullable().optional(),
  }),
});

export type QueryDevicePlaylistOutput = z.infer<typeof QueryDevicePlaylistOutput>;

/**
 * Generate from Promo Input
 */
export const GenerateFromPromoInput = z.object({
  tenantId: z.string(),
  storeId: z.string(),
  promoIds: z.array(z.string()).optional(),
  theme: z.string().nullable().optional(),
});

export type GenerateFromPromoInput = z.infer<typeof GenerateFromPromoInput>;

/**
 * Generate from Promo Output
 */
export const GenerateFromPromoOutput = z.object({
  ok: z.boolean(),
  data: z.object({
    assetIds: z.array(z.string()),
    assetUrls: z.array(z.string()),
  }),
});

export type GenerateFromPromoOutput = z.infer<typeof GenerateFromPromoOutput>;

