/**
 * Intent Router — classifies HTTP requests into execution paths.
 *
 * Three paths:
 * 1. kernel  — Full agent OS pipeline (Intent→Context→Memory→Planning→Reasoning→Capability→Execution)
 * 2. direct  — Direct database/API operation (no agent pipeline)
 * 3. hybrid  — Configurable based on user preference or request parameter
 *
 * NOTE: This module classifies and attaches metadata only. Express route handlers
 * remain the execution surface; use hybridRouter.resolveHybridExecutionPath() inside
 * handlers for governed hybrid operations.
 */

import { categorizeEndpoint, normalizePath } from './endpointRegistry.js';
import { executionPathForCategory } from './endpointCategories.js';
import { normalizeRoutingBodyFlags } from './compatibilityLayer.js';

export class IntentRouter {
  /**
   * @param {string} endpoint
   * @param {string} method
   * @param {object} [body={}]
   * @returns {import('./endpointCategories.js').IntentCategory}
   */
  categorize(endpoint, method, body = {}) {
    const normalizedBody = normalizeRoutingBodyFlags(body);
    const result = categorizeEndpoint(endpoint, method, normalizedBody);
    return result.category;
  }

  /**
   * Full routing decision for observability and middleware.
   * @param {import('express').Request} req
   * @returns {{ category: string, executionPath: string, endpoint: string, method: string, reason: string, timestamp: string }}
   */
  classifyRequest(req) {
    const endpoint = normalizePath(req.originalUrl || req.path || '');
    const method = req.method || 'GET';
    const body = normalizeRoutingBodyFlags(req.body);

    const { category, executionPath, reason } = categorizeEndpoint(endpoint, method, body);

    return {
      category,
      executionPath,
      endpoint,
      method,
      reason,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * @deprecated Use classifyRequest — middleware must NOT intercept Express handlers.
   * @param {import('express').Request} req
   */
  route(req) {
    return this.classifyRequest(req);
  }

  /**
   * Heuristic for body-only complexity when category is UNKNOWN.
   * @param {object} body
   */
  isComplexOperation(body) {
    const complexIndicators = ['analyze', 'generate', 'create', 'launch', 'optimize', 'plan', 'strategy'];
    const bodyStr = JSON.stringify(body || {}).toLowerCase();
    return complexIndicators.some((indicator) => bodyStr.includes(indicator));
  }

  /**
   * Resolve category with complexity fallback for unknown endpoints.
   * @param {string} endpoint
   * @param {string} method
   * @param {object} [body={}]
   */
  categorizeWithFallback(endpoint, method, body = {}) {
    const normalizedBody = normalizeRoutingBodyFlags(body);
    const base = categorizeEndpoint(endpoint, method, normalizedBody);
    if (base.category !== 'UNKNOWN') return base;

    if (this.isComplexOperation(normalizedBody)) {
      return {
        category: 'AGENT_WORKFLOW',
        executionPath: executionPathForCategory('AGENT_WORKFLOW'),
        reason: 'complexity_heuristic',
      };
    }

    return base;
  }
}

const intentRouter = new IntentRouter();
export default intentRouter;
