/**
 * Compatibility Layer — normalize legacy routing flags during migration.
 * Mutates req.body in place (non-destructive for unknown keys).
 */

/**
 * @param {object} body
 * @returns {object}
 */
export function normalizeRoutingBodyFlags(body) {
  if (!body || typeof body !== 'object') return body ?? {};

  const next = { ...body };

  if (next.direct_action === true) {
    console.warn('[Compatibility] direct_action is deprecated; routing via endpoint classification');
    delete next.direct_action;
  }

  if (next.skipDirectGuard === true) {
    console.warn('[Compatibility] skipDirectGuard removed — kernel mandatory');
    delete next.skipDirectGuard;
  }

  if (next._autoSubmit === true) {
    console.warn('[Compatibility] _autoSubmit converted to requireConfirmation');
    next.requireConfirmation = true;
    next._autoSubmit = false;
  }

  if (next._forcePath === 'agent') {
    next._forcePath = 'kernel';
  }

  return next;
}

/**
 * Express middleware — normalize body flags before routing classification.
 * @param {import('express').Request} req
 * @param {import('express').Response} _res
 * @param {import('express').NextFunction} next
 */
export function compatibilityMiddleware(req, _res, next) {
  if (req.body && typeof req.body === 'object') {
    req.body = normalizeRoutingBodyFlags(req.body);
  }
  next();
}
