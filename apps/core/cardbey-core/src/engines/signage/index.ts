/**
 * Signage Engine v1
 * Main entry point for signage engine exports
 */

// Re-export types
export * from './types.ts';

// Re-export events
export * from './events.ts';

// Re-export tool functions
export { createPlaylist } from './createPlaylist.ts';
export { addAssetsToPlaylist } from './addAssetsToPlaylist.ts';
export { schedulePlaylist } from './schedulePlaylist.ts';
export { publishToDevices } from './publishToDevices.ts';
export { generateFromMenu } from './generateFromMenu.ts';
export { generateFromPromo } from './generateFromPromo.ts';
export { queryDevicePlaylist } from './queryDevicePlaylist.ts';
export { listDevices } from './listDevices.ts';

// Re-export tool definitions for orchestrator
export { signageTools } from './signageTools.ts';

// Re-export EngineContext type
export type { EngineContext } from './createPlaylist.ts';

// Default export
export { signageTools as default } from './signageTools.ts';

