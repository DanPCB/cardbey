/**
 * Intent Routing Middleware
 *
 * Classifies each /api request and attaches metadata for observability.
 * Does NOT intercept Express handlers — always calls next().
 */

import intentRouter from '../lib/routing/intentRouter.js';
import { compatibilityMiddleware } from '../lib/routing/compatibilityLayer.js';
import { isKernelMandatoryEnabled } from '../lib/runtime/kernelMandatory.js';

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function intentRoutingMiddleware(req, res, next) {
  if (!req.originalUrl?.startsWith('/api')) {
    return next();
  }

  try {
    const routing = intentRouter.classifyRequest(req);
    req.executionRouting = routing;
    req.routing = routing;

    res.setHeader('X-Cardbey-Execution-Path', routing.executionPath);
    res.setHeader('X-Cardbey-Intent-Category', routing.category);

    if (process.env.NODE_ENV !== 'production' && process.env.LOG_INTENT_ROUTING === 'true') {
      console.log(`[IntentRouter] ${routing.method} ${routing.endpoint} → ${routing.category} (${routing.executionPath}) [${routing.reason}]`);
    }

    if (
      isKernelMandatoryEnabled()
      && routing.executionPath === 'kernel'
      && routing.category === 'AGENT_WORKFLOW'
      && !req.originalUrl.includes('/runtime/')
      && !req.originalUrl.includes('/performer/')
    ) {
      // Advisory header — agent workflow endpoints should use kernel-authorized sources internally
      res.setHeader('X-Cardbey-Kernel-Expected', 'true');
    }
  } catch (err) {
    console.error('[IntentRouting] classification error:', err?.message || err);
  }

  next();
}

/** Combined stack: compatibility normalization then classification */
export function intentRoutingStack(req, res, next) {
  compatibilityMiddleware(req, res, (compatErr) => {
    if (compatErr) return next(compatErr);
    intentRoutingMiddleware(req, res, next);
  });
}
