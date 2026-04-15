/**
 * Debug Routes Lite - route inspector (dev only)
 *
 * GET /api/debug/routes returns a JSON list of Express routes currently
 * registered: { method, path } for each route.
 * ⚠️ Mount only when NODE_ENV !== 'production'.
 */

import { Router } from 'express';

/**
 * Recursively collect { method, path } from Express app stack.
 * @param {object} app - Express app (must have _router.stack)
 * @param {string} prefix - Path prefix for nested routers
 * @returns {{ method: string, path: string }[]}
 */
function listMountedRoutes(app, prefix = '') {
  const out = [];
  const stack = app?._router?.stack ?? [];
  const norm = (p) => (p || '').replace(/\/+/g, '/').replace(/\/$/, '') || '/';

  for (const layer of stack) {
    if (layer.route) {
      const path = norm(prefix + layer.route.path);
      const methods = Object.keys(layer.route.methods).filter((m) => layer.route.methods[m]);
      for (const m of methods) {
        out.push({ method: m.toUpperCase(), path });
      }
    } else if (layer.name === 'router' && layer.handle?.stack) {
      const mountPath = (typeof layer.path === 'string' ? layer.path : '') || '';
      const nextPrefix = norm(prefix + mountPath);
      const sub = { _router: { stack: layer.handle.stack } };
      out.push(...listMountedRoutes(sub, nextPrefix));
    }
  }
  return out;
}

/**
 * Factory that returns a Router with GET /routes listing all mounted routes.
 * Must be called after all routes are mounted on `app`.
 * @param {object} app - Express app
 * @returns {import('express').Router}
 */
export function createDebugRoutesLite(app) {
  const router = Router();
  router.get('/routes', (req, res) => {
    try {
      const routes = listMountedRoutes(app);
      return res.json({ ok: true, routes });
    } catch (err) {
      return res.status(500).json({
        ok: false,
        error: 'Failed to list routes',
        message: err?.message,
      });
    }
  });
  return router;
}

export default createDebugRoutesLite;
