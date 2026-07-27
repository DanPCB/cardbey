/**
 * Phase Engine — CC-1
 *
 * Computes the active phase (pre | active | post) for a SmartDocument
 * and provides helpers for phase transitions.
 *
 * Phase lifecycle:
 *   pre     — document created but not yet active (before startsAt, or awaiting first stamp)
 *   active  — document is live and accepting interactions
 *   post    — document has expired or reached its stamp/redemption cap
 *
 * PhaseConfig shape (stored in SmartDocument.phaseConfig JSON):
 * {
 *   startsAt?:        string (ISO date)
 *   endsAt?:          string (ISO date)
 *   maxStamps?:       number
 *   expireAfterDays?: number  (days from createdAt)
 * }
 */

/**
 * @typedef {'pre'|'active'|'post'} Phase
 */

/**
 * @typedef {{
 *   startsAt?: string | null,
 *   endsAt?: string | null,
 *   maxStamps?: number | null,
 *   expireAfterDays?: number | null,
 * }} PhaseConfig
 */

/**
 * Parse phaseConfig from a SmartDocument row.
 * Handles both JSON object (PostgreSQL) and JSON string (SQLite).
 *
 * @param {object | string | null | undefined} raw
 * @returns {PhaseConfig}
 */
export function parsePhaseConfig(raw) {
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw);
      return typeof p === 'object' && p !== null && !Array.isArray(p) ? p : {};
    } catch {
      return {};
    }
  }
  return {};
}

/**
 * Compute the current phase for a SmartDocument.
 *
 * @param {{
 *   phase: string,
 *   phaseConfig?: object | string | null,
 *   createdAt: Date,
 *   expiresAt?: Date | null,
 *   stampCount?: number,
 * }} doc
 * @param {Date} [now]  — override current time (useful for tests)
 * @returns {Phase}
 */
export function computePhase(doc, now = new Date()) {
  const cfg = parsePhaseConfig(doc.phaseConfig);

  // ── POST conditions ──────────────────────────────────────────────────────
  // 1. Hard expiresAt field has passed
  if (doc.expiresAt && now >= new Date(doc.expiresAt)) {
    return 'post';
  }

  // 2. phaseConfig.endsAt has passed
  if (cfg.endsAt && now >= new Date(cfg.endsAt)) {
    return 'post';
  }

  // 3. expireAfterDays from createdAt has elapsed
  if (cfg.expireAfterDays != null && typeof cfg.expireAfterDays === 'number') {
    const expiryMs = new Date(doc.createdAt).getTime() + cfg.expireAfterDays * 86_400_000;
    if (now.getTime() >= expiryMs) {
      return 'post';
    }
  }

  // 4. Stamp cap reached
  if (
    cfg.maxStamps != null &&
    typeof cfg.maxStamps === 'number' &&
    typeof doc.stampCount === 'number' &&
    doc.stampCount >= cfg.maxStamps
  ) {
    return 'post';
  }

  // ── PRE conditions ───────────────────────────────────────────────────────
  // 5. phaseConfig.startsAt is in the future
  if (cfg.startsAt && now < new Date(cfg.startsAt)) {
    return 'pre';
  }

  // ── ACTIVE ───────────────────────────────────────────────────────────────
  return 'active';
}

/**
 * Return true if the document is currently accepting visitor interactions.
 *
 * @param {Parameters<typeof computePhase>[0]} doc
 * @param {Date} [now]
 * @returns {boolean}
 */
export function isDocActive(doc, now = new Date()) {
  return computePhase(doc, now) === 'active';
}

/**
 * Compute the phase and return a suggested DB patch if the stored phase
 * differs from the computed one (used for lazy phase sync on read).
 *
 * @param {Parameters<typeof computePhase>[0]} doc
 * @param {Date} [now]
 * @returns {{ phase: Phase, needsUpdate: boolean }}
 */
export function resolvePhase(doc, now = new Date()) {
  const phase = computePhase(doc, now);
  const needsUpdate = doc.phase !== phase;
  return { phase, needsUpdate };
}

/**
 * Build a phaseConfig object from user-supplied options.
 *
 * @param {{
 *   startsAt?: string | Date | null,
 *   endsAt?: string | Date | null,
 *   maxStamps?: number | null,
 *   expireAfterDays?: number | null,
 * }} opts
 * @returns {PhaseConfig}
 */
export function buildPhaseConfig(opts = {}) {
  /** @type {PhaseConfig} */
  const cfg = {};
  if (opts.startsAt) cfg.startsAt = new Date(opts.startsAt).toISOString();
  if (opts.endsAt) cfg.endsAt = new Date(opts.endsAt).toISOString();
  if (typeof opts.maxStamps === 'number' && opts.maxStamps > 0) cfg.maxStamps = opts.maxStamps;
  if (typeof opts.expireAfterDays === 'number' && opts.expireAfterDays > 0) {
    cfg.expireAfterDays = opts.expireAfterDays;
  }
  return cfg;
}
