/**
 * Hybrid Router — resolves agent vs direct path for governed operations.
 *
 * Used by route handlers (publish, delete, schedule) — not global middleware.
 *
 * Direct path (default): unchanged handler behavior.
 * Agent path: `_preferAgent: true` or `_forcePath: 'kernel'` runs kernel review first.
 * Destructive ops: `requireConfirmation: true` requires `confirmed: true` on direct path.
 */

import { executeRuntimeAction } from '../runtime/performerRuntime/executeRuntimeAction.js';
import { normalizeRoutingBodyFlags } from './compatibilityLayer.js';
import { inferHybridAuditContext, logHybridPublish } from '../hybrid/hybridAudit.js';

/**
 * @typedef {object} HybridRouteOptions
 * @property {boolean} [requireConfirmation] — direct path requires body.confirmed === true
 * @property {string} [operation] — stable operation key for audit/review
 */

export class HybridRouter {
  /**
   * @param {import('express').Request} req
   */
  isDirectlyConfirmed(req) {
    const body = normalizeRoutingBodyFlags(req.body || {});
    return (
      body.confirmed === true
      || body._confirmed === true
      || body.confirmationState === 'confirmed'
    );
  }

  /**
   * Resolve execution path for a hybrid-classified request.
   * @param {import('express').Request} req
   * @returns {Promise<'kernel'|'direct'>}
   */
  async resolveHybridExecutionPath(req) {
    const body = normalizeRoutingBodyFlags(req.body || {});
    const { _preferAgent, _forcePath } = body;

    if (_forcePath === 'kernel' || _forcePath === 'agent') return 'kernel';
    if (_forcePath === 'direct') return 'direct';

    if (_preferAgent === true) return 'kernel';
    if (_preferAgent === false) return 'direct';

    const userPref = await this.getUserAgentPreference(req.user?.id ?? req.userId);
    if (userPref !== undefined) return userPref ? 'kernel' : 'direct';

    return this.isComplexOperation(body) ? 'kernel' : 'direct';
  }

  /**
   * @param {object} result
   * @returns {string[]}
   */
  extractSuggestions(result) {
    const suggestions = [];
    const payload = result?.payload && typeof result.payload === 'object' ? result.payload : result;
    if (Array.isArray(payload?.suggestions)) {
      for (const item of payload.suggestions) {
        if (typeof item === 'string' && item.trim()) suggestions.push(item.trim());
      }
    }
    if (typeof payload?.message === 'string' && payload.message.trim()) {
      suggestions.push(payload.message.trim());
    }
    if (typeof result?.blocker?.message === 'string' && result.blocker.message.trim()) {
      suggestions.push(result.blocker.message.trim());
    }
    return [...new Set(suggestions)];
  }

  /**
   * @param {import('express').Request} req
   * @param {HybridRouteOptions} [options]
   */
  async reviewWithAgent(req, options = {}) {
    const body = normalizeRoutingBodyFlags(req.body || {});
    const {
      _preferAgent,
      _forcePath,
      confirmed,
      _confirmed,
      confirmationState,
      _executeAfterReview,
      ...operationData
    } = body;

    const result = await executeRuntimeAction({
      source: 'intent_hybrid_router',
      userId: req.user?.id ?? req.userId ?? null,
      actionType: 'assist_hybrid_operation',
      payload: {
        intent: 'review_hybrid_operation',
        operation: options.operation || this.inferOperationKey(req),
        method: req.method,
        path: req.originalUrl || req.path,
        params: req.params ?? {},
        data: operationData,
        requireConfirmation: options.requireConfirmation === true,
      },
    });

    if (result?.status === 'blocked' || result?.blocker) {
      return {
        status: 'blocked',
        approved: false,
        blocker: result.blocker ?? { code: 'operation_not_approved', message: 'Operation not approved' },
        suggestions: this.extractSuggestions(result),
        payload: result,
      };
    }

    return {
      status: 'reviewed',
      approved: true,
      suggestions: this.extractSuggestions(result),
      payload: result,
      message: 'Agent review completed.',
    };
  }

  /**
   * @param {import('express').Request} req
   */
  inferOperationKey(req) {
    const path = String(req.originalUrl || req.path || '').toLowerCase();
    if (req.method === 'DELETE') return 'delete';
    if (path.includes('publish')) return 'publish';
    return 'hybrid';
  }

  /**
   * @param {import('express').Request} req
   * @param {HybridRouteOptions} options
   * @param {object} audit
   */
  async logRouteAudit(req, options, audit) {
    const ctx = inferHybridAuditContext(req, options.operation);
    const body = normalizeRoutingBodyFlags(req.body || {});
    await logHybridPublish({
      userId: req.user?.id ?? req.userId ?? null,
      itemId: ctx.itemId,
      itemType: ctx.itemType,
      executionPath: audit.executionPath,
      confirmed: audit.confirmed === true || this.isDirectlyConfirmed(req),
      success: audit.success === true,
      suggestions: audit.suggestions || [],
      missionId: typeof body.missionId === 'string' ? body.missionId : null,
      operation: options.operation || ctx.operation,
      path: ctx.path,
      method: ctx.method,
    });
  }

  /**
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {(req: import('express').Request, res: import('express').Response) => Promise<void>|void} directHandler
   * @param {HybridRouteOptions} [options]
   */
  async route(req, res, directHandler, options = {}) {
    const body = normalizeRoutingBodyFlags(req.body || {});
    const useAgent = (await this.resolveHybridExecutionPath(req)) === 'kernel';
    const confirmed = this.isDirectlyConfirmed(req);
    const path = req.originalUrl || req.path;
    const shouldAudit =
      String(req.method || '').toUpperCase() === 'DELETE'
      || options.operation?.includes('publish')
      || String(path).includes('publish');

    console.log(
      `[HybridRouter] ${req.method} ${path} → ${useAgent ? 'AGENT' : 'DIRECT'}${
        options.requireConfirmation ? ' (confirm)' : ''
      }`,
    );

    if (useAgent) {
      const result = await this.handleAgentPath(req, res, directHandler, options, body, confirmed);
      if (shouldAudit) {
        const success = res.headersSent && res.statusCode < 400;
        await this.logRouteAudit(req, options, {
          executionPath: 'ai_review',
          confirmed,
          success,
          suggestions: Array.isArray(res.body?.suggestions) ? res.body.suggestions : [],
        });
      }
      return result;
    }

    if (options.requireConfirmation && !confirmed) {
      if (shouldAudit) {
        await this.logRouteAudit(req, options, {
          executionPath: 'direct',
          confirmed: false,
          success: false,
          suggestions: [],
        });
      }
      return res.status(428).json({
        ok: false,
        confirmationRequired: true,
        error: 'confirmation_required',
        message:
          'This operation requires explicit confirmation. Set confirmed: true in the request body, or use _preferAgent: true for AI review.',
        operation: path,
        method: req.method,
      });
    }

    if (typeof directHandler !== 'function') {
      return res.status(501).json({
        ok: false,
        error: 'hybrid_direct_handler_missing',
      });
    }

    const statusBefore = res.statusCode;
    await directHandler(req, res);
    if (shouldAudit) {
      const success = res.headersSent ? res.statusCode < 400 : statusBefore < 400;
      await this.logRouteAudit(req, options, {
        executionPath: 'direct',
        confirmed,
        success,
        suggestions: [],
      });
    }
  }

  /**
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {Function} directHandler
   * @param {HybridRouteOptions} options
   * @param {object} body
   * @param {boolean} confirmed
   */
  async handleAgentPath(req, res, directHandler, options, body, confirmed) {
    const review = await this.reviewWithAgent(req, options);

    if (review.status === 'blocked') {
      return res.status(400).json({
        ok: false,
        agentAssisted: true,
        requiresUserInput: true,
        error: review.blocker?.code || 'operation_not_approved',
        suggestions: review.suggestions,
        review: review.payload ?? null,
      });
    }

    const reviewOnly = body._preferAgent === true && !confirmed && body._executeAfterReview !== true;
    if (reviewOnly) {
      return res.json({
        ok: true,
        agentAssisted: true,
        agentReviewed: true,
        confirmationRequired: options.requireConfirmation === true,
        suggestions: review.suggestions,
        review: review.payload ?? null,
        message:
          'Review complete. Send confirmed: true (and optionally _executeAfterReview: true) to execute.',
      });
    }

    if (options.requireConfirmation && !confirmed) {
      return res.status(428).json({
        ok: false,
        agentAssisted: true,
        agentReviewed: true,
        confirmationRequired: true,
        suggestions: review.suggestions,
        review: review.payload ?? null,
        error: 'confirmation_required',
        message: 'Agent review passed. Set confirmed: true to execute this destructive operation.',
      });
    }

    if (typeof directHandler !== 'function') {
      return res.status(501).json({
        ok: false,
        error: 'hybrid_direct_handler_missing',
      });
    }

    const originalJson = res.json.bind(res);
    let wrapped = false;
    res.json = (payload) => {
      wrapped = true;
      if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
        return originalJson({
          ...payload,
          agentAssisted: true,
          agentReviewed: true,
        });
      }
      return originalJson({ ok: true, data: payload, agentAssisted: true, agentReviewed: true });
    };

    await directHandler(req, res);

    if (!wrapped && !res.headersSent) {
      return res.json({ ok: true, agentAssisted: true, agentReviewed: true });
    }

    return undefined;
  }

  /**
   * @param {string|null|undefined} userId
   * @returns {Promise<boolean|undefined>}
   */
  async getUserAgentPreference(userId) {
    if (!userId) return undefined;

    try {
      const { getPrismaClient } = await import('../prisma.js');
      const prisma = getPrismaClient();
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { onboarding: true },
      });
      const prefs = user?.onboarding;
      if (prefs && typeof prefs === 'object' && 'preferAgentForHybrid' in prefs) {
        return Boolean(prefs.preferAgentForHybrid);
      }
    } catch {
      /* non-fatal */
    }

    return undefined;
  }

  /**
   * @param {object} data
   */
  isComplexOperation(data) {
    const complexIndicators = ['analyze', 'suggest', 'optimize', 'review', 'generate'];
    const dataStr = JSON.stringify(data || {}).toLowerCase();
    return complexIndicators.some((indicator) => dataStr.includes(indicator));
  }
}

const hybridRouter = new HybridRouter();
export default hybridRouter;
