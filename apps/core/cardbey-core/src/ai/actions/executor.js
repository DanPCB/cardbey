/**
 * AI Action Executor
 * Executes node-specific actions when suggestions are applied
 */

import { PrismaClient } from '@prisma/client';
import cuid from 'cuid';

const prisma = new PrismaClient();

/**
 * Execute actions for a suggestion based on node type
 */
export async function executeActions(suggestion, appliedBy = 'system') {
  const actions = JSON.parse(suggestion.actions);
  const results = [];

  for (const action of actions) {
    let result = null;

    switch (suggestion.node) {
      case 'pricing':
        result = await executePricingAction(action, suggestion.id);
        break;
      case 'inventory':
        result = await executeInventoryAction(action, suggestion.id);
        break;
      case 'marketing':
        result = await executeMarketingAction(action, suggestion.id);
        break;
      default:
        console.warn(`[Actions] Unknown node: ${suggestion.node}`);
    }

    if (result) {
      results.push({ action: action.type, result });
    }
  }

  return results;
}

/**
 * Execute pricing action - create PriceChange record
 */
async function executePricingAction(action, suggestionId) {
  if (action.type === 'price.update') {
    const { sku, deltaPercent, duration = '24h', testGroup = 'B' } = action.params;

    const priceChange = await prisma.priceChange.create({
      data: {
        id: cuid(),
        suggestionId,
        sku,
        deltaPercent,
        duration,
        testGroup,
        status: 'PENDING',
      },
    });

    console.log(`[Actions] PriceChange created: ${priceChange.id} for ${sku}`);
    
    // TODO: Emit event price.changed
    // await emitEvent('price.changed', { priceChangeId: priceChange.id, sku, deltaPercent });

    return { type: 'price_change', id: priceChange.id };
  }

  return null;
}

/**
 * Execute inventory action - create ReorderRequest
 */
async function executeInventoryAction(action, suggestionId) {
  if (action.type === 'inventory.reorder') {
    const { sku, quantity, priority = 'high', reason = 'low_stock' } = action.params;

    const reorder = await prisma.reorderRequest.create({
      data: {
        id: cuid(),
        suggestionId,
        sku,
        quantity,
        priority,
        reason,
        status: 'PENDING',
      },
    });

    console.log(`[Actions] ReorderRequest created: ${reorder.id} for ${sku} (${quantity} units)`);
    
    // TODO: Emit event inventory.reorder.created
    // await emitEvent('inventory.reorder.created', { reorderId: reorder.id, sku, quantity });

    return { type: 'reorder_request', id: reorder.id };
  }

  return null;
}

/**
 * Execute marketing action - create CreativeRefreshTask
 */
async function executeMarketingAction(action, suggestionId) {
  if (action.type === 'banner.refresh') {
    const { reason = 'low_ctr', currentCTR, banner } = action.params;

    const task = await prisma.creativeRefreshTask.create({
      data: {
        id: cuid(),
        suggestionId,
        banner: banner || null,
        reason,
        currentCTR: currentCTR || null,
        status: 'PENDING',
      },
    });

    console.log(`[Actions] CreativeRefreshTask created: ${task.id}`);
    
    // TODO: Emit event marketing.refresh.created
    // await emitEvent('marketing.refresh.created', { taskId: task.id, reason });

    return { type: 'creative_refresh', id: task.id };
  } else if (action.type === 'campaign.ab_test') {
    // For now, just log - could create CampaignABTest table later
    console.log(`[Actions] Campaign A/B test requested:`, action.params);
    
    return { type: 'campaign_ab_test', params: action.params };
  }

  return null;
}

// TODO: Event emitter function
// async function emitEvent(kind, payload) {
//   await prisma.eventLog.create({
//     data: {
//       id: cuid(),
//       kind,
//       zone: 'C_FEEDBACK',
//       payload: JSON.stringify(payload),
//       occurredAt: new Date(),
//     },
//   });
// }







