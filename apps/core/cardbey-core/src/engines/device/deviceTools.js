/**
 * Device Engine Tools
 * Tool definitions for orchestrator integration
 */

import {
  requestPairing,
  completePairing,
  heartbeat,
  pushPlaylist,
  confirmPlaylistReady,
  triggerRepair,
} from './index.js';

import {
  RequestPairingInput,
  RequestPairingOutput,
  CompletePairingInput,
  CompletePairingOutput,
  HeartbeatInput,
  HeartbeatOutput,
  PushPlaylistInput,
  PushPlaylistOutput,
  ConfirmPlaylistReadyInput,
  ConfirmPlaylistReadyOutput,
  TriggerRepairInput,
  TriggerRepairOutput,
} from './types.js';

/**
 * Device Engine Tools Registry
 * Array of tool definitions for orchestrator integration
 */
export const deviceTools = [
  {
    engineId: 'device',
    toolName: 'device.request-pairing',
    inputSchema: RequestPairingInput,
    outputSchema: RequestPairingOutput,
    handler: requestPairing,
  },
  {
    engineId: 'device',
    toolName: 'device.complete-pairing',
    inputSchema: CompletePairingInput,
    outputSchema: CompletePairingOutput,
    handler: completePairing,
  },
  {
    engineId: 'device',
    toolName: 'device.heartbeat',
    inputSchema: HeartbeatInput,
    outputSchema: HeartbeatOutput,
    handler: heartbeat,
  },
  {
    engineId: 'device',
    toolName: 'device.push-playlist',
    inputSchema: PushPlaylistInput,
    outputSchema: PushPlaylistOutput,
    handler: pushPlaylist,
  },
  {
    engineId: 'device',
    toolName: 'device.confirm-playlist-ready',
    inputSchema: ConfirmPlaylistReadyInput,
    outputSchema: ConfirmPlaylistReadyOutput,
    handler: confirmPlaylistReady,
  },
  {
    engineId: 'device',
    toolName: 'device.trigger-repair',
    inputSchema: TriggerRepairInput,
    outputSchema: TriggerRepairOutput,
    handler: triggerRepair,
  },
];

/**
 * Default export
 */
export default deviceTools;



