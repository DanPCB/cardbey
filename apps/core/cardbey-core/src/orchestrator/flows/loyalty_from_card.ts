/**
 * Loyalty From Card Flow
 * Orchestrator agent flow for building loyalty programs from card images
 * 
 * Flow: User uploads a photo → agent builds a working loyalty program automatically
 */

import { callTool } from '../runtime/toolExecutor.js';
import { Vision } from '../services/vision.js';
import { logger } from '../services/logger.js';
import { getEventEmitter } from '../../engines/loyalty/events.js';

/**
 * Flow input interface
 */
export interface LoyaltyFromCardInput {
  tenantId: string;
  storeId: string;
  imageUrl: string; // image of loyalty card
  themePreference?: string; // optional (light/dark/brand color)
}

/**
 * Flow result interface
 */
export interface LoyaltyFromCardResult {
  ok: boolean;
  flow?: string;
  programId?: string;
  programConfig?: {
    name: string;
    stampsRequired: number;
    reward: string;
  };
  assets?: {
    qrUrl: string;
    cardImageUrl: string;
    pdfUrl: string;
  };
  error?: {
    message: string;
  };
}

/**
 * Tool context interface
 */
interface FlowContext {
  services?: {
    events?: ReturnType<typeof getEventEmitter>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/**
 * Loyalty From Card Flow
 * 
 * Steps:
 * 1. Parse card image using Vision model
 * 2. Configure loyalty program
 * 3. Generate assets (QR, card image, PDF)
 * 4. Return UI payload
 * 5. Emit success event
 * 
 * @param input - Flow input parameters
 * @param ctx - Execution context
 * @returns Flow result
 */
export async function loyalty_from_card(
  input: LoyaltyFromCardInput,
  ctx?: FlowContext
): Promise<LoyaltyFromCardResult> {
  try {
    // Use the new service that uses AI engines
    // TODO: Feature flag to switch between old and new implementation
    const useNewService = process.env.USE_AI_ENGINES !== 'false';
    
    if (useNewService) {
      logger.info('[loyalty_from_card] Using new AI engine service');
      // Dynamic import to handle JS/TS mix
      const { runLoyaltyFromCard: runLoyaltyFromCardService } = await import('../services/loyaltyFromCardService.js');
      const serviceResult = await runLoyaltyFromCardService(input, ctx);
      
      // Convert service result to flow result format
      return {
        ok: true,
        flow: 'loyalty_from_card',
        programId: serviceResult.raw?.programId,
        programConfig: {
          name: 'Stamp Rewards',
          stampsRequired: serviceResult.payload.rules.stampsRequired,
          reward: serviceResult.payload.rules.rewardDescription,
        },
        assets: serviceResult.raw?.assets,
      };
    }
    
    // Legacy implementation (keep for backward compatibility)
    logger.info('[loyalty_from_card] Using legacy vision service');
    
    // STEP 1: Parse card image
    logger.info('[loyalty_from_card] Step 1: Parsing loyalty card', {
      imageUrl: input.imageUrl,
    });
    
    let parsed;
    try {
      parsed = await Vision.parseLoyaltyCard(input.imageUrl);
    } catch (err) {
      logger.error('[loyalty_from_card] Vision parsing error', {
        error: err.message,
        imageUrl: input.imageUrl,
      });
      // Use fallback defaults
      parsed = {
        stampsRequired: 10,
        reward: 'Free drink',
        foundTitle: null,
      };
    }
    
    logger.info('[loyalty_from_card] Card parsed', {
      stampsRequired: parsed.stampsRequired,
      reward: parsed.reward,
      foundTitle: parsed.foundTitle,
    });
    
    // STEP 2: Configure program
    logger.info('[loyalty_from_card] Step 2: Configuring loyalty program', {
      tenantId: input.tenantId,
      storeId: input.storeId,
    });
    
    const programRes = await callTool(
      'loyalty.configure-program',
      {
        tenantId: input.tenantId,
        storeId: input.storeId,
        programId: null,
        name: parsed.foundTitle || 'Stamp Rewards',
        stampsRequired: parsed.stampsRequired,
        reward: parsed.reward,
        expiresAt: null,
      },
      ctx
    );
    
    if (!programRes.ok || !programRes.data) {
      throw new Error(
        programRes.error || 'Failed to configure loyalty program'
      );
    }
    
    const programId = (programRes.data as { programId: string }).programId;
    
    logger.info('[loyalty_from_card] Program configured', { programId });
    
    // STEP 3: Generate assets
    logger.info('[loyalty_from_card] Step 3: Generating assets', {
      programId,
      themePreference: input.themePreference,
    });
    
    const assets = await callTool(
      'loyalty.generate-assets',
      {
        tenantId: input.tenantId,
        storeId: input.storeId,
        programId,
        theme: input.themePreference || 'default',
        format: ['qr', 'card', 'pdf'],
      },
      ctx
    );
    
    if (!assets.ok || !assets.data) {
      throw new Error(assets.error || 'Failed to generate assets');
    }
    
    const assetsData = assets.data as {
      qrUrl: string;
      cardImageUrl: string;
      pdfUrl: string;
    };
    
    logger.info('[loyalty_from_card] Assets generated', {
      qrUrl: assetsData.qrUrl,
      cardImageUrl: assetsData.cardImageUrl,
      pdfUrl: assetsData.pdfUrl,
    });
    
    // STEP 4: Build flow result for UI surfaces
    const result: LoyaltyFromCardResult = {
      ok: true,
      flow: 'loyalty_from_card',
      programId,
      programConfig: {
        name: parsed.foundTitle || 'Stamp Rewards',
        stampsRequired: parsed.stampsRequired,
        reward: parsed.reward,
      },
      assets: {
        qrUrl: assetsData.qrUrl,
        cardImageUrl: assetsData.cardImageUrl,
        pdfUrl: assetsData.pdfUrl,
      },
    };
    
    // STEP 5: Emit success event
    try {
      const events = ctx?.services?.events || getEventEmitter();
      await events.emit('loyalty.flow_completed', {
        tenantId: input.tenantId,
        storeId: input.storeId,
        programId,
      });
      
      logger.info('[loyalty_from_card] Success event emitted', {
        programId,
      });
    } catch (eventError) {
      // Non-critical: log but don't fail the flow
      logger.warn('[loyalty_from_card] Failed to emit event', {
        error: eventError.message,
      });
    }
    
    logger.info('[loyalty_from_card] Flow completed successfully', {
      programId,
    });
    
    return result;
  } catch (err) {
    logger.error('[loyalty_from_card] Flow error', {
      error: err.message,
      stack: err.stack,
      input: {
        tenantId: input.tenantId,
        storeId: input.storeId,
        imageUrl: input.imageUrl,
      },
    });
    
    return {
      ok: false,
      error: {
        message: err.message || 'Loyalty flow failed',
      },
    };
  }
}


