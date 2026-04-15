/**
 * Creative Agent (Imaginarium v1) - Index
 * Central export point for Creative Agent module
 */

// Re-export types
export type {
  CreativeContext,
  CreativeProposal,
  CreativeResponse
} from './types.js';

// Re-export agent interface and implementation
export type {
  CreativeAgent
} from './creativeAgent.js';

export {
  DefaultCreativeAgent,
  createCreativeAgent
} from './creativeAgent.js';


