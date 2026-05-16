/**
 * Tools Registry
 * Central registry for all orchestrator tools (engines, skills, etc.)
 */

/**
 * In-memory tools registry
 */
const tools = [];

/**
 * Register tools from an engine
 * @param {Array} toolDefinitions - Array of tool definitions to register
 */
export function registerTools(toolDefinitions) {
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
 * @param {string} toolName - Tool name to retrieve
 * @returns {Object|undefined} Tool definition or undefined if not found
 */
export function getToolByName(toolName) {
  return tools.find(t => t.toolName === toolName);
}

/**
 * Find tools by engine ID
 * @param {string} engineId - Engine ID to search for
 * @returns {Array} Array of matching tools
 */
export function findToolsByEngine(engineId) {
  return tools.filter(t => t.engineId === engineId);
}

/**
 * List all registered tools
 * @returns {Array} Array of all tools
 */
export function listTools() {
  return [...tools];
}

/**
 * Remove a tool from the registry
 * @param {string} toolName - Tool name to remove
 * @returns {boolean} True if tool was removed, false if not found
 */
export function removeTool(toolName) {
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
export function clearTools() {
  tools.length = 0;
}

/**
 * Initialize tools registry
 * Registers all available engine tools
 */
export async function initializeToolsRegistry() {
  try {
    // Register Loyalty Engine tools
    const loyaltyModule = await import('../engines/loyalty/loyaltyTools.js');
    const loyaltyTools = loyaltyModule.loyaltyTools || loyaltyModule.default;
    if (loyaltyTools) {
      registerTools(loyaltyTools);
    }
  } catch (error) {
    console.error('[ToolsRegistry] Failed to load loyalty tools:', error.message);
    try {
      const loyaltyModule = await import('../engines/loyalty/index.js');
      const loyaltyTools = loyaltyModule.loyaltyTools || loyaltyModule.default;
      if (loyaltyTools) {
        registerTools(loyaltyTools);
      }
    } catch (err2) {
      console.error('[ToolsRegistry] Failed to load loyalty tools from index:', err2.message);
    }
  }
  
  try {
    // Register Menu Engine tools
    const menuModule = await import('../engines/menu/menuTools.ts');
    const menuTools = menuModule.menuTools || menuModule.default;
    if (menuTools) {
      registerTools(menuTools);
    }
  } catch (error) {
    console.error('[ToolsRegistry] Failed to load menu tools:', error.message);
    try {
      const menuModule = await import('../engines/menu/index.ts');
      const menuTools = menuModule.menuTools || menuModule.default;
      if (menuTools) {
        registerTools(menuTools);
      }
    } catch (err2) {
      console.error('[ToolsRegistry] Failed to load menu tools from index:', err2.message);
    }
  }
  
  try {
    // Register Promo Engine tools (TypeScript)
    const promoModule = await import('../engines/promo/promoTools.ts');
    const promoTools = promoModule.promoTools || promoModule.default;
    if (promoTools) {
      registerTools(promoTools);
    }
  } catch (error) {
    console.error('[ToolsRegistry] Failed to load promo tools (TS):', error.message);
    try {
      // Fallback to JS version if TS fails
      const promoModule = await import('../engines/promo/promoTools.js');
      const promoTools = promoModule.promoTools || promoModule.default;
      if (promoTools) {
        registerTools(promoTools);
      }
    } catch (err2) {
      console.error('[ToolsRegistry] Failed to load promo tools (JS fallback):', err2.message);
      try {
        const promoModule = await import('../engines/promo/index.js');
        const promoTools = promoModule.promoTools || promoModule.default;
        if (promoTools) {
          registerTools(promoTools);
        }
      } catch (err3) {
        console.error('[ToolsRegistry] Failed to load promo tools from index:', err3.message);
      }
    }
  }
  
  try {
    // Register Signage Engine tools
    const signageModule = await import('../engines/signage/signageTools.js');
    const signageTools = signageModule.signageTools || signageModule.default;
    if (signageTools) {
      registerTools(signageTools);
    }
  } catch (error) {
    console.error('[ToolsRegistry] Failed to load signage tools:', error.message);
    try {
      const signageModule = await import('../engines/signage/index.js');
      const signageTools = signageModule.signageTools || signageModule.default;
      if (signageTools) {
        registerTools(signageTools);
      }
    } catch (err2) {
      console.error('[ToolsRegistry] Failed to load signage tools from index:', err2.message);
    }
  }
  
  try {
    // Register Device Engine tools (TypeScript)
    const deviceModule = await import('../engines/device/deviceTools.ts');
    const deviceTools = deviceModule.deviceTools || deviceModule.default;
    if (deviceTools) {
      registerTools(deviceTools);
    }
  } catch (error) {
    console.error('[ToolsRegistry] Failed to load device tools (TS):', error.message);
    try {
      // Fallback to JS version if TS fails
      const deviceModule = await import('../engines/device/deviceTools.js');
      const deviceTools = deviceModule.deviceTools || deviceModule.default;
      if (deviceTools) {
        registerTools(deviceTools);
      }
    } catch (err2) {
      console.error('[ToolsRegistry] Failed to load device tools (JS fallback):', err2.message);
      try {
        const deviceModule = await import('../engines/device/index.js');
        const deviceTools = deviceModule.deviceTools || deviceModule.default;
        if (deviceTools) {
          registerTools(deviceTools);
        }
      } catch (err3) {
        console.error('[ToolsRegistry] Failed to load device tools from index:', err3.message);
      }
    }
  }
  
  console.log(`[ToolsRegistry] Initialized with ${tools.length} tools`);
}

