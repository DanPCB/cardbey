/**
 * Tool Adapter Layer – entry point. Register v0 tools and export runner/router.
 * Enable with ENABLE_TOOL_ADAPTER=true (default false).
 *
 * DeepSeek tool calling: see ToolRegistry.ts + toolCallingService.ts
 */

import { registerLaunchpackTool } from './launchpack';
import { registerStoreFixImageMismatchTool } from './storeFixImageMismatch';
import { registerCreativeSlideshowStub } from './creativeSlideshowStub';
import { executeTool } from './runner';
import { resolveToolForTask } from './router';
import { getTool, listToolKeys } from './registry';
import { getToolRegistry, ToolRegistry } from './ToolRegistry.js';
import { registerCoreTools } from './coreTools.js';
import { runToolCallingLoop } from './toolCallingService.js';

registerLaunchpackTool();
registerStoreFixImageMismatchTool();
registerCreativeSlideshowStub();

export { executeTool, resolveToolForTask, getTool, listToolKeys };
export { getToolRegistry, ToolRegistry, registerCoreTools, runToolCallingLoop };
export type { ToolContext, ToolResult } from './registry';
export type { Tool, ToolCallTrace, ToolCallingResult } from './toolTypes.js';
export type { ExecuteToolOptions } from './runner';

export function isToolAdapterEnabled(): boolean {
  return process.env.ENABLE_TOOL_ADAPTER === 'true';
}
