/**

 * Loyalty From Card Flow — vision extraction only (no LoyaltyProgram writes).

 * Converges to setup_loyalty_program via Performer runtime handoff.

 */



import { logger } from '../services/logger.js';



/**

 * Flow input interface

 */

export interface LoyaltyFromCardInput {

  tenantId: string;

  storeId: string;

  imageUrl: string;

  themePreference?: string;

  storeName?: string | null;

}



/**

 * Flow result interface

 */

export interface LoyaltyFromCardResult {

  ok: boolean;

  flow?: string;

  preseededDraft?: Record<string, unknown>;

  payload?: Record<string, unknown>;

  handoff?: Record<string, unknown>;

  confidence?: number;

  error?: { message: string };

}



interface FlowContext {

  [key: string]: unknown;

}



/**

 * @param input - Flow input parameters

 * @param ctx - Execution context

 */

export async function loyalty_from_card(

  input: LoyaltyFromCardInput,

  ctx?: FlowContext,

): Promise<LoyaltyFromCardResult> {

  try {

    logger.info('[loyalty_from_card] extract-only handoff');

    const { runLoyaltyFromCard: runLoyaltyFromCardService } = await import('../services/loyaltyFromCardService.js');

    const serviceResult = await runLoyaltyFromCardService(input, ctx);



    return {

      ok: true,

      flow: 'loyalty_from_card',

      preseededDraft: serviceResult.preseededDraft,

      payload: serviceResult.payload,

      handoff: serviceResult.handoff,

      confidence: serviceResult.confidence,

    };

  } catch (err) {

    logger.error('[loyalty_from_card] Flow error', {

      error: err instanceof Error ? err.message : String(err),

      input: {

        tenantId: input.tenantId,

        storeId: input.storeId,

        imageUrl: input.imageUrl,

      },

    });



    return {

      ok: false,

      error: {

        message: err instanceof Error ? err.message : 'Loyalty flow failed',

      },

    };

  }

}


