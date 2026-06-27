/**
 * Phase 1 — Performer mode types (manual vs automation).
 */

import { config } from '../../config/index.js';

/** @typedef {'manual' | 'automation'} PerformerMode */

/** @typedef {'button' | 'text' | 'upload' | 'voice' | 'quick_action' | 'unknown'} PerformerRequestSource */

/** @typedef {'manual_direct' | 'manual_governed' | 'reasoned_plan' | 'reasoned_execute'} ModeExecutionPath */

/**
 * @typedef {Object} ModeResponseMeta
 * @property {PerformerMode} mode
 * @property {ModeExecutionPath} [executionPath]
 * @property {boolean} reasoningUsed
 * @property {boolean} governanceEnforced
 * @property {string | null} [tool]
 * @property {Record<string, unknown>} [metadata]
 */

export const PERFORMER_MODES = /** @type {const} */ (['manual', 'automation']);
/** @type {PerformerMode} */
export const DEFAULT_PERFORMER_MODE = config.performer.defaultMode;
/** @type {PerformerMode} */
export const DEFAULT_MODE = DEFAULT_PERFORMER_MODE;

/**
 * @param {unknown} value
 * @returns {value is PerformerMode}
 */
export function isPerformerMode(value) {
  return value === 'manual' || value === 'automation';
}

/**
 * @param {import('express').Request} req
 * @param {Record<string, unknown>} [body]
 * @returns {PerformerMode}
 */
export function resolvePerformerMode(req, body = {}) {
  const header = String(req?.headers?.['x-performer-mode'] ?? '').trim().toLowerCase();
  if (header === 'manual' || header === 'automation') return header;

  const bodyMode = String(body?.mode ?? body?.performerMode ?? '').trim().toLowerCase();
  if (bodyMode === 'manual' || bodyMode === 'automation') return bodyMode;

  return DEFAULT_PERFORMER_MODE;
}

/**
 * @param {import('express').Request} req
 * @param {Record<string, unknown>} [body]
 * @returns {PerformerRequestSource}
 */
export function resolvePerformerSource(req, body = {}) {
  const raw = String(body?.source ?? body?.performerSource ?? '').trim().toLowerCase();
  if (raw === 'button' || raw === 'quick_action' || raw === 'upload' || raw === 'voice') {
    return raw;
  }
  if (body?.action || body?.explicitAction) return 'button';
  if (Array.isArray(body?.attachments) && body.attachments.length > 0) return 'upload';
  if (body?.imageDataUrl) return 'upload';
  if (String(body?.text ?? body?.goal ?? '').trim()) return 'text';
  return 'unknown';
}

/**
 * @param {PerformerMode} mode
 * @param {Partial<ModeResponseMeta>} [overrides]
 * @returns {ModeResponseMeta}
 */
export function createModeResponseMeta(mode, overrides = {}) {
  return {
    mode,
    executionPath: mode === 'manual' ? 'manual_governed' : 'reasoned_execute',
    reasoningUsed: mode === 'automation',
    governanceEnforced: true,
    tool: null,
    metadata: {},
    ...overrides,
  };
}
