/**
 * Signage Engine Tools
 * Tool definitions for orchestrator integration
 */

import { createPlaylist } from './createPlaylist.ts';
import { addAssetsToPlaylist } from './addAssetsToPlaylist.ts';
import { schedulePlaylist } from './schedulePlaylist.ts';
import { publishToDevices } from './publishToDevices.ts';
import { generateFromMenu } from './generateFromMenu.ts';
import { generateFromPromo } from './generateFromPromo.ts';
import { queryDevicePlaylist } from './queryDevicePlaylist.ts';
import { listDevices } from './listDevices.ts';

import {
  CreatePlaylistInput,
  CreatePlaylistOutput,
  AddAssetsToPlaylistInput,
  AddAssetsToPlaylistOutput,
  SchedulePlaylistInput,
  SchedulePlaylistOutput,
  PublishToDevicesInput,
  PublishToDevicesOutput,
  GenerateFromMenuInput,
  GenerateFromMenuOutput,
  GenerateFromPromoInput,
  GenerateFromPromoOutput,
  QueryDevicePlaylistInput,
  QueryDevicePlaylistOutput,
  ListDevicesInput,
  ListDevicesOutput,
} from './types.ts';

/**
 * Signage Engine Tools Registry
 * Array of tool definitions for orchestrator integration
 */
export const signageTools = [
  {
    engineId: 'signage',
    toolName: 'signage.list-devices',
    inputSchema: ListDevicesInput,
    outputSchema: ListDevicesOutput,
    handler: listDevices,
  },
  {
    engineId: 'signage',
    toolName: 'signage.create-playlist',
    inputSchema: CreatePlaylistInput,
    outputSchema: CreatePlaylistOutput,
    handler: createPlaylist,
  },
  {
    engineId: 'signage',
    toolName: 'signage.add-assets-to-playlist',
    inputSchema: AddAssetsToPlaylistInput,
    outputSchema: AddAssetsToPlaylistOutput,
    handler: addAssetsToPlaylist,
  },
  {
    engineId: 'signage',
    toolName: 'signage.schedule-playlist',
    inputSchema: SchedulePlaylistInput,
    outputSchema: SchedulePlaylistOutput,
    handler: schedulePlaylist,
  },
  {
    engineId: 'signage',
    toolName: 'signage.publish-to-devices',
    inputSchema: PublishToDevicesInput,
    outputSchema: PublishToDevicesOutput,
    handler: publishToDevices,
  },
  {
    engineId: 'signage',
    toolName: 'signage.generate-assets-from-menu',
    inputSchema: GenerateFromMenuInput,
    outputSchema: GenerateFromMenuOutput,
    handler: generateFromMenu,
  },
  {
    engineId: 'signage',
    toolName: 'signage.query-device-playlist',
    inputSchema: QueryDevicePlaylistInput,
    outputSchema: QueryDevicePlaylistOutput,
    handler: queryDevicePlaylist,
  },
  {
    engineId: 'signage',
    toolName: 'signage.generate-from-promo',
    inputSchema: GenerateFromPromoInput,
    outputSchema: GenerateFromPromoOutput,
    handler: generateFromPromo,
  },
];

/**
 * Default export
 */
export default signageTools;

