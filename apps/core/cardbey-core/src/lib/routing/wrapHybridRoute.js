/**
 * Express route wrapper for hybrid routing (publish / delete).
 */

import hybridRouter from './hybridRouter.js';

/**
 * Wrap an Express handler with hybrid routing.
 *
 * @param {(req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => any} handler
 * @param {import('./hybridRouter.js').HybridRouteOptions} [options]
 */
export function wrapHybridRoute(handler, options = {}) {
  return (req, res, next) => {
    hybridRouter
      .route(req, res, (r, s) => Promise.resolve(handler(r, s, next)), options)
      .catch(next);
  };
}

export default wrapHybridRoute;
