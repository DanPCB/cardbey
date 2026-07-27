/**
 * Phase 0.5 — single correlation id from intake (and other surfaces) through jobs/drafts.
 * Header: clients may send X-Cardbey-Trace-Id; server always echoes a value on Intake V2 responses.
 */

import crypto from 'crypto';

export const CARDBEY_TRACE_HEADER = 'x-cardbey-trace-id';

/** Allow client-supplied ids (UUID, cuid-like, or slug) within safe bounds. */
const CLIENT_TRACE_RE = /^[a-zA-Z0-9_.:-]{8,128}$/;

/**
 * @param {import('express').Request | { get?: (h: string) => string | undefined }} req
 * @returns {string}
 */
export function getOrCreateCardbeyTraceId(req) {
  const raw = typeof req?.get === 'function' ? req.get(CARDBEY_TRACE_HEADER) : '';
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  if (trimmed && CLIENT_TRACE_RE.test(trimmed)) {
    return trimmed;
  }
  return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
}
