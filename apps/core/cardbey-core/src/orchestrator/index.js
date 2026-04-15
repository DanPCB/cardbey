/**
 * Unified Orchestrator Entry Point
 * Single entry: orchestrator.run(entryPoint, inputs)
 * Delegates to business services, NOT specific AI models
 */

import { runLoyaltyFromCard } from './services/loyaltyFromCardService.js';
import { runMenuFromPhoto } from './services/menuFromPhotoService.js';
import { runSam3DesignTask } from './services/sam3DesignTaskService.js';
// TODO: Import other services as they're refactored

// Dynamic import for system watcher (TypeScript file)
let runSystemWatcherPromise = null;
async function getRunSystemWatcher() {
  if (!runSystemWatcherPromise) {
    runSystemWatcherPromise = import('./systemWatcher.js').then(m => m.runSystemWatcher);
  }
  return runSystemWatcherPromise;
}

/**
 * Orchestrator entry points
 * @typedef {'loyalty_from_card' | 'menu_from_photo' | 'shopfront_signage' | 'creative_ideas' | 'content_studio'} OrchestratorEntryPoint
 */

/**
 * Run orchestrator with entry point and input
 * 
 * @param {OrchestratorEntryPoint} entryPoint - Entry point identifier
 * @param {any} input - Input parameters (varies by entry point)
 * @param {any} [ctx] - Execution context (optional)
 * @returns {Promise<any>} Orchestrator result (standardized AI result format)
 */
export async function runOrchestrator(entryPoint, input, ctx) {
  const startTime = Date.now();
  
  console.log('[Orchestrator] runOrchestrator start', {
    entryPoint,
    inputKeys: Object.keys(input || {}),
    timestamp: new Date().toISOString(),
  });

  try {
    let result;

    switch (entryPoint) {
      case 'loyalty_from_card':
        result = await runLoyaltyFromCard(input, ctx);
        break;

      case 'menu_from_photo':
        result = await runMenuFromPhoto(input, ctx);
        break;

      case 'shopfront_signage':
        // TODO: Implement shopfront_signage service
        throw new Error('shopfront_signage not yet implemented in unified orchestrator');

      case 'creative_ideas':
        // TODO: Implement creative_ideas service
        throw new Error('creative_ideas not yet implemented in unified orchestrator');

      case 'content_studio':
        result = await runSam3DesignTask(input, ctx);
        break;

      case 'system_watcher': {
        const runSystemWatcher = await getRunSystemWatcher();
        result = await runSystemWatcher(input);
        break;
      }

      default:
        throw new Error(`Unknown entryPoint: ${entryPoint}`);
    }

    const duration = Date.now() - startTime;
    
    console.log('[Orchestrator] runOrchestrator complete', {
      entryPoint,
      duration: `${duration}ms`,
      success: result?.ok !== false,
    });

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    
    console.error('[Orchestrator] runOrchestrator error', {
      entryPoint,
      duration: `${duration}ms`,
      error: error.message,
      stack: error.stack,
    });

    throw error;
  }
}


