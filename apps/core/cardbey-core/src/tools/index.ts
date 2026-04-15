/**
 * Tool Adapter Layer – entry point. Register v0 tools and export runner/router.
 * Enable with ENABLE_TOOL_ADAPTER=true (default false).
 */

import { registerLaunchpackTool } from './launchpack';
import { registerStoreFixImageMismatchTool } from './storeFixImageMismatch';
import { registerCreativeSlideshowStub } from './creativeSlideshowStub';
import { executeTool } from './runner';
import { resolveToolForTask } from './router';
import { getTool, listToolKeys } from './registry';

registerLaunchpackTool();
registerStoreFixImageMismatchTool();
registerCreativeSlideshowStub();

export { executeTool, resolveToolForTask, getTool, listToolKeys };
export type { ToolContext, ToolResult } from './registry';
export type { ExecuteToolOptions } from './runner';

export function isToolAdapterEnabled(): boolean {
  return process.env.ENABLE_TOOL_ADAPTER === 'true';
}
