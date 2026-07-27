/**
 * Feature Flag Helper for MenuVisualAgent
 * Checks if menu_visual_agent_v1 feature is enabled
 */

/**
 * Check if MenuVisualAgent feature is enabled
 * Reads from environment variable with robust boolean parsing
 * Supports: "true", "1", "yes", "on" => true
 */
export function isMenuVisualAgentEnabled(): boolean {
  const value = process.env.ENABLE_MENU_VISUAL_AGENT;
  if (!value) return false;
  
  const normalized = value.toLowerCase().trim();
  return normalized === 'true' || 
         normalized === '1' || 
         normalized === 'yes' || 
         normalized === 'on';
}

