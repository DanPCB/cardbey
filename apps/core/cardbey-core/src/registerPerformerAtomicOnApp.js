/**
 * Mount atomic content on the main Cardbey API (`createCardbeyApp()` / `server.js`).
 * Kept as `.js` so `createApp.js` can static-import a path that exists on disk (Node + Render).
 * The atomic route module can be .ts or .js depending on branch/build shape.
 */

/**
 * Registers `POST /api/performer/atomic-content`.
 * If the atomic route module is absent, boot should continue and report degraded mount status.
 * @param {import('express').Application} app
 * @returns {Promise<{ok: boolean, note?: string, error?: string}>}
 */
export async function registerPerformerAtomicContentRoute(app) {
  try {
    let mod;
    try {
      mod = await import('./routes/performerAtomicContentRoutes.ts');
    } catch {
      mod = await import('./routes/performerAtomicContentRoutes.js');
    }
    const createRouter = mod?.createPerformerAtomicContentRouter;
    if (typeof createRouter !== 'function') {
      return { ok: false, error: 'createPerformerAtomicContentRouter_missing' };
    }
    app.use('/api/performer/atomic-content', createRouter());
    return { ok: true, note: 'registerPerformerAtomicContentRoute' };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      '[cardbey-core/createApp] optional /api/performer/atomic-content skipped:',
      err?.message || err,
    );
    return { ok: false, error: err?.message || String(err) };
  }
}
