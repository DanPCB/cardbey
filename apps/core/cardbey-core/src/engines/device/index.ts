/**
 * Device Engine v1
 * Main entry point for device engine exports
 */

// Re-export types
export * from './types.ts';

// Re-export events
export * from './events.js';

// Re-export tool functions
export { requestPairing } from './requestPairing.ts';
export { completePairing } from './completePairing.ts';
export { heartbeat } from './heartbeat.ts';
export { pushPlaylist } from './pushPlaylist.ts';
export { confirmPlaylistReady } from './confirmPlaylistReady.ts';
export { triggerRepair } from './triggerRepair.ts';

// Re-export tool definitions for orchestrator
export { deviceTools } from './deviceTools.ts';

// Re-export EngineContext type
export type { EngineContext } from './requestPairing.ts';

// Default export
export { deviceTools as default } from './deviceTools.ts';
