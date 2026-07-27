import { V1OrchestrationAgent } from './baseAgent.js';

/** V1 stub — optional catalog specialist (not wired in coordinator waves yet). */
export class CatalogAgent extends V1OrchestrationAgent {
  static agentType = 'catalog';

  static agentName = 'catalog';

  buildResult(task) {
    const base = super.buildResult(task);
    return {
      ...base,
      summary: 'Catalog stub — menu/catalog placeholder',
      catalog: { stub: true, products: [] },
    };
  }
}
