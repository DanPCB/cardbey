/**
 * Direct handler registry — documents which route modules own direct execution paths.
 * Route handlers remain authoritative; this registry supports audit tooling and hybrid fallbacks.
 */

/** @type {Record<string, { module: string, description: string }>} */
export const DIRECT_HANDLER_REGISTRY = {
  USER_ACTION: {
    module: 'routes/auth.js',
    description: 'Profile, auth, OAuth, notifications',
  },
  CONTENT_CRUD: {
    module: 'routes/draftStore.js, routes/stores.js, routes/upload.js, routes/contents.js',
    description: 'Draft store, products, uploads, content studio',
  },
  SOCIAL: {
    module: 'routes/publicContentInteractionRoutes.js, routes/threadsRoutes.js',
    description: 'Likes, comments, follows, chat threads',
  },
  TRANSACTION: {
    module: 'routes/billing.js, routes/promoEngine.js, routes/loyalty.js',
    description: 'Billing, promo engine, loyalty stamps',
  },
  READ_ONLY: {
    module: 'routes/publicUsers.js, routes/storefrontRoutes.js, routes/healthRoutes.js',
    description: 'Public storefront, health, read APIs',
  },
  OBSERVE: {
    module: 'routes/pilRoutes.js, routes/telemetryRoutes.js',
    description: 'PIL attention events, telemetry (observe only)',
  },
};

/**
 * Maps hybrid operation keywords to suggested direct route modules.
 * @type {Record<string, string>}
 */
export const HYBRID_DIRECT_MODULE_HINTS = {
  publish: 'routes/stores.js, routes/miniWebsiteRoutes.js, services/draftStore/publishDraftService.js',
  commit: 'routes/draftStore.js, services/draftStore/publishDraftService.js',
  delete: 'category-specific route module',
  schedule: 'routes/signageEngine.js',
  moderate: 'routes/admin.js',
};

export const directHandlers = {
  /** @param {import('express').Request} req @param {import('express').Response} res */
  userAction(req, res) {
    return res.status(501).json({
      ok: false,
      error: 'direct_handler_not_mounted',
      message: 'User actions are served by /api/auth and /api/users/me route modules',
      registry: DIRECT_HANDLER_REGISTRY.USER_ACTION,
    });
  },

  /** @param {import('express').Request} req @param {import('express').Response} res */
  contentCRUD(req, res) {
    return res.status(501).json({
      ok: false,
      error: 'direct_handler_not_mounted',
      message: 'Content CRUD is served by draft-store, products, and upload route modules',
      registry: DIRECT_HANDLER_REGISTRY.CONTENT_CRUD,
    });
  },

  /** @param {import('express').Request} req @param {import('express').Response} res */
  social(req, res) {
    return res.status(501).json({
      ok: false,
      error: 'direct_handler_not_mounted',
      message: 'Social actions are served by public/content-interactions and threads routes',
      registry: DIRECT_HANDLER_REGISTRY.SOCIAL,
    });
  },

  /** @param {import('express').Request} req @param {import('express').Response} res */
  transaction(req, res) {
    return res.status(501).json({
      ok: false,
      error: 'direct_handler_not_mounted',
      message: 'Transactions are served by billing, promo engine, and loyalty routes',
      registry: DIRECT_HANDLER_REGISTRY.TRANSACTION,
    });
  },

  /** @param {import('express').Request} req @param {import('express').Response} res */
  default(req, res) {
    return res.status(501).json({
      ok: false,
      error: 'direct_handler_not_mounted',
      message: 'Register a route-specific direct handler for this hybrid operation',
    });
  },
};

/**
 * @param {string} path
 */
export function getDirectHandlerHint(path) {
  const lower = String(path || '').toLowerCase();
  for (const [keyword, module] of Object.entries(HYBRID_DIRECT_MODULE_HINTS)) {
    if (lower.includes(keyword)) return module;
  }
  return null;
}
