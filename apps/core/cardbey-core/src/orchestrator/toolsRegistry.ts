/**
 * Tools Registry
 * Central registry for all orchestrator tools (engines, skills, etc.)
 */

import type { ToolDefinition } from '../engines/loyalty/loyaltyTools.js';

/**
 * In-memory tools registry
 */
const tools: ToolDefinition[] = [];

/**
 * Register tools from an engine
 * @param toolDefinitions - Array of tool definitions to register
 */
export function registerTools(toolDefinitions: ToolDefinition[]): void {
  for (const tool of toolDefinitions) {
    // Check if tool with same name already exists
    const existing = tools.find(t => t.toolName === tool.toolName);
    if (existing) {
      console.warn(`[ToolsRegistry] Tool "${tool.toolName}" already exists, skipping`);
      continue;
    }
    
    tools.push(tool);
    console.log(`[ToolsRegistry] Registered tool: ${tool.toolName}`);
  }
}

/**
 * Get a tool by name
 * @param toolName - Tool name to retrieve
 * @returns Tool definition or undefined if not found
 */
export function getToolByName(toolName: string): ToolDefinition | undefined {
  return tools.find(t => t.toolName === toolName);
}

/**
 * Find tools by engine ID
 * @param engineId - Engine ID to search for
 * @returns Array of matching tools
 */
export function findToolsByEngine(engineId: string): ToolDefinition[] {
  return tools.filter(t => t.engineId === engineId);
}

/**
 * List all registered tools
 * @returns Array of all tools
 */
export function listTools(): ToolDefinition[] {
  return [...tools];
}

/**
 * Remove a tool from the registry
 * @param toolName - Tool name to remove
 * @returns True if tool was removed, false if not found
 */
export function removeTool(toolName: string): boolean {
  const index = tools.findIndex(t => t.toolName === toolName);
  if (index === -1) {
    return false;
  }
  
  tools.splice(index, 1);
  return true;
}

/**
 * Clear all tools from registry
 */
export function clearTools(): void {
  tools.length = 0;
}

/**
 * Initialize tools registry
 * Registers all available engine tools
 */
export async function initializeToolsRegistry(): Promise<void> {
  // Register Loyalty Engine tools
  const { loyaltyTools } = await import('../engines/loyalty/loyaltyTools.js');
  registerTools(loyaltyTools);
  
  // Register Menu Engine tools
  const { menuTools } = await import('../engines/menu/menuTools.ts');
  registerTools(menuTools);
  
  // Register Promo Engine tools
  const { promoTools } = await import('../engines/promo/promoTools.js');
  registerTools(promoTools);
  
  // Register Signage Engine tools
  const { signageTools } = await import('../engines/signage/signageTools.js');
  registerTools(signageTools);
  
  // Register Device Engine tools
  const { deviceTools } = await import('../engines/device/deviceTools.js');
  registerTools(deviceTools);
  
  console.log(`[ToolsRegistry] Initialized with ${tools.length} tools`);
}


