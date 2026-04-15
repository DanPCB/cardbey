/**
 * AI Orchestrator - Inline Processing
 * Processes events and generates suggestions immediately
 */

import { PrismaClient } from '@prisma/client';
import cuid from 'cuid';

const prisma = new PrismaClient();

/**
 * Process an event and generate AI suggestion
 * Phase 2: With latency tracking
 */
export async function handleAISuggestion(event) {
  const { kind, payload = {}, _internalStartTime } = event;
  const zoneAStart = Date.now();

  let suggestion = null;

  // Route based on event kind (Zone A normalization is implicit here)
  const zoneBStart = Date.now();
  switch (kind) {
    case 'inventory.changed':
      suggestion = analyzeInventory(event);
      break;
    case 'store.updated':
      suggestion = analyzePricing(event);
      break;
    case 'campaign.launched':
    case 'user.clicked':
      suggestion = analyzeMarketing(event);
      break;
    default:
      console.log(`[AI] No handler for event kind: ${kind}`);
      return null;
  }

  if (!suggestion) return null;

  // Calculate latencies
  const suggestionCreatedAt = Date.now();
  const latencyZoneAMs = zoneBStart - zoneAStart; // Normalization phase
  const latencyZoneBMs = suggestionCreatedAt - zoneBStart; // Routing + analysis
  const latencyEndToEndMs = _internalStartTime 
    ? suggestionCreatedAt - _internalStartTime 
    : latencyZoneAMs + latencyZoneBMs;

  // Persist suggestion to database with latency tracking
  try {
    const suggestionLog = await prisma.suggestionLog.create({
      data: {
        id: suggestion.id,
        node: suggestion.node,
        title: suggestion.title,
        description: suggestion.description || null,
        confidence: suggestion.confidence,
        impact: suggestion.impact || null,
        actions: JSON.stringify(suggestion.actions),
        sourceEvent: event.id || null,
        createdAt: new Date(suggestion.createdAt),
        status: 'PENDING',
        // Phase 2: Latency tracking
        latencyZoneAMs: Math.round(latencyZoneAMs),
        latencyZoneBMs: Math.round(latencyZoneBMs),
        latencyEndToEndMs: Math.round(latencyEndToEndMs),
      },
    });

    console.log(
      `[AI] Suggestion created: ${suggestionLog.id} (${suggestionLog.node}) ` +
      `[Latency: A=${latencyZoneAMs}ms, B=${latencyZoneBMs}ms, E2E=${latencyEndToEndMs}ms]`
    );
    
    // Phase 2: Broadcast via SSE
    try {
      const { broadcastSuggestion } = await import('./sse/bus.js');
      broadcastSuggestion({
        id: suggestionLog.id,
        node: suggestionLog.node,
        title: suggestionLog.title,
        description: suggestionLog.description,
        confidence: suggestionLog.confidence,
        impact: suggestionLog.impact,
        actions: JSON.parse(suggestionLog.actions),
        sourceEvent: suggestionLog.sourceEvent,
        createdAt: suggestionLog.createdAt.toISOString(),
        status: suggestionLog.status,
      });
    } catch (_) {
      // SSE not available, that's ok
    }
    
    return suggestionLog;
  } catch (err) {
    console.error('[AI] Failed to save suggestion:', err);
    return null;
  }
}

/**
 * Inventory Node - Low stock detection
 */
function analyzeInventory(event) {
  const { sku = 'unknown', stock = 0, threshold = 10 } = event.payload;
  const isLowStock = stock < threshold;
  const reorderQty = Math.max(threshold * 2, 20);

  return {
    id: cuid(),
    node: 'inventory',
    title: isLowStock ? `Low stock alert for ${sku}` : `Stock level check for ${sku}`,
    description: isLowStock
      ? `Current stock (${stock}) is below threshold (${threshold}). Suggest reordering ${reorderQty} units to prevent stockout.`
      : `Stock level nominal (${stock} units). Monitor for trends.`,
    confidence: isLowStock ? 0.85 : 0.45,
    impact: isLowStock ? 'HIGH' : 'LOW',
    actions: isLowStock
      ? [{ type: 'inventory.reorder', params: { sku, quantity: reorderQty, priority: 'high' } }]
      : [{ type: 'inventory.monitor', params: { sku, currentStock: stock } }],
    createdAt: new Date().toISOString(),
  };
}

/**
 * Pricing Node - Price optimization
 */
function analyzePricing(event) {
  const { sku = 'item', price = 0 } = event.payload;
  const deltaPercent = 5;
  const newPrice = price * (1 + deltaPercent / 100);

  return {
    id: cuid(),
    node: 'pricing',
    title: `Trial price adjust for ${sku}`,
    description: `A/B test: Increase price by ${deltaPercent}% for 24h (from $${price.toFixed(2)} to $${newPrice.toFixed(2)}). Monitor conversion rate and revenue impact.`,
    confidence: 0.62,
    impact: 'MEDIUM',
    actions: [
      {
        type: 'price.update',
        params: { sku, deltaPercent: +5, duration: '24h', testGroup: 'B' },
      },
    ],
    createdAt: new Date().toISOString(),
  };
}

/**
 * Marketing Node - Campaign and CTR analysis
 */
function analyzeMarketing(event) {
  const { kind, payload } = event;

  if (kind === 'campaign.launched') {
    const { name = 'Campaign', channel = 'email' } = payload;
    return {
      id: cuid(),
      node: 'marketing',
      title: `Optimize ${name} campaign`,
      description: `Campaign launched on ${channel}. Suggest A/B testing subject lines and monitoring CTR for first 24h.`,
      confidence: 0.7,
      impact: 'MEDIUM',
      actions: [
        {
          type: 'campaign.ab_test',
          params: { campaign: name, variants: ['subject_a', 'subject_b'], metric: 'ctr' },
        },
      ],
      createdAt: new Date().toISOString(),
    };
  } else if (kind === 'user.clicked') {
    const { ctr = 0 } = payload;
    const threshold = 0.02;
    const isLowCTR = ctr < threshold;

    return {
      id: cuid(),
      node: 'marketing',
      title: isLowCTR ? 'Low CTR detected' : 'Engagement looks good',
      description: isLowCTR
        ? `CTR (${(ctr * 100).toFixed(2)}%) is below target (${(threshold * 100).toFixed(0)}%). Consider refreshing banner creative or adjusting targeting.`
        : `CTR (${(ctr * 100).toFixed(2)}%) is healthy. Continue monitoring.`,
      confidence: isLowCTR ? 0.75 : 0.4,
      impact: isLowCTR ? 'MEDIUM' : 'LOW',
      actions: isLowCTR
        ? [{ type: 'banner.refresh', params: { reason: 'low_ctr', currentCTR: ctr } }]
        : [{ type: 'marketing.monitor', params: { ctr } }],
      createdAt: new Date().toISOString(),
    };
  }

  return null;
}

