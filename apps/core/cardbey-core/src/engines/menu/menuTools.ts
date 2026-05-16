/**
 * Menu Engine Tools
 * Tool definitions for orchestrator integration
 */

// Import directly from concrete function files to avoid circular dependency with index.ts
import { extractMenu } from './extractMenu.js';
import { configureMenu } from './configureMenu.js';
import { generateMenuAssets } from './generateMenuAssets.js';
import { publishMenu } from './publishMenu.js';
import { queryMenuState } from './queryMenuState.js';

import {
  ExtractInput,
  ExtractOutput,
  ConfigureMenuInput,
  ConfigureMenuOutput,
  GenerateMenuAssetsInput,
  GenerateMenuAssetsOutput,
  PublishMenuInput,
  PublishMenuOutput,
  QueryMenuStateInput,
  QueryMenuStateOutput,
} from './types.js';

/**
 * Tool definition interface
 */
export interface ToolDefinition {
  engineId: string;
  toolName: string;
  inputSchema: any; // Zod schema
  outputSchema: any; // Zod schema
  handler: (input: any, ctx?: any) => Promise<any>;
}

/**
 * Menu Engine Tools Registry
 * Array of tool definitions for orchestrator integration
 */
export const menuTools: ToolDefinition[] = [
  {
    engineId: 'menu',
    toolName: 'menu.extract',
    inputSchema: ExtractInput,
    outputSchema: ExtractOutput,
    handler: extractMenu,
  },
  {
    engineId: 'menu',
    toolName: 'menu.configure',
    inputSchema: ConfigureMenuInput,
    outputSchema: ConfigureMenuOutput,
    handler: configureMenu,
  },
  {
    engineId: 'menu',
    toolName: 'menu.generate-assets',
    inputSchema: GenerateMenuAssetsInput,
    outputSchema: GenerateMenuAssetsOutput,
    handler: generateMenuAssets,
  },
  {
    engineId: 'menu',
    toolName: 'menu.publish',
    inputSchema: PublishMenuInput,
    outputSchema: PublishMenuOutput,
    handler: publishMenu,
  },
  {
    engineId: 'menu',
    toolName: 'menu.query-state',
    inputSchema: QueryMenuStateInput,
    outputSchema: QueryMenuStateOutput,
    handler: queryMenuState,
  },
];

/**
 * Default export
 */
export default menuTools;

