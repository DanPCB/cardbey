/**
 * Vision IntentGraph — query nodes, edges, and suggestion ranking.
 */

import { VISION_INTENT_EDGES, VISION_INTENT_NODES, listIntentsForEntityType } from './intentRegistry.js';
import type { EntityContext, IntentEdge, IntentNode } from './types.js';

export class IntentGraph {
  private readonly edges: IntentEdge[];

  constructor(edges: IntentEdge[] = VISION_INTENT_EDGES) {
    this.edges = edges;
  }

  getNodesForEntity(entity: EntityContext): IntentNode[] {
    let nodes = listIntentsForEntityType(entity.entityType);

    if (entity.sourceType === 'menu') {
      const menuIds = new Set([
        'extract_menu_items',
        'create_catalog_draft',
        'translate_menu',
        'add_to_store_catalog',
        'save_to_suitcase',
        'ask_about_store',
      ]);
      const menuNodes = VISION_INTENT_NODES.filter((n) => menuIds.has(n.id));
      nodes = [...nodes, ...menuNodes];
    }

    if (entity.sourceType === 'flyer') {
      const eventNodes = listIntentsForEntityType('event');
      nodes = [...nodes, ...eventNodes];
    }

    const seen = new Set<string>();
    return nodes.filter((n) => {
      if (seen.has(n.id)) return false;
      seen.add(n.id);
      return true;
    });
  }

  getFollowOnIntents(intentId: string, condition?: string): string[] {
    return this.edges
      .filter((e) => e.fromIntent === intentId && (!condition || e.condition === condition))
      .map((e) => e.toIntent);
  }

  rankSuggestions(
    nodes: IntentNode[],
    entity: EntityContext,
  ): IntentNode[] {
    const priority: Record<string, number> = {
      open_website: 100,
      open_store: 100,
      save_to_suitcase: 90,
      save_store: 90,
      share_store: 85,
      ask_about_store: 80,
      create_prestore_candidate: 75,
      check_if_on_cardbey: 70,
      explain_only: 60,
    };

    if (entity.entityType === 'cardbey_store') {
      priority.order_now = 95;
    }
    if (entity.privacyRisk === 'high') {
      return nodes.filter((n) =>
        ['explain_only', 'do_not_store', 'block_acquisition'].includes(n.id),
      );
    }

    return [...nodes].sort((a, b) => (priority[b.id] ?? 50) - (priority[a.id] ?? 50));
  }
}

export const visionIntentGraph = new IntentGraph();
