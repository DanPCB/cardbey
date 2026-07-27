/**
 * DocumentTopologyEngine — reusable perception layer for document layout understanding.
 */

import { validateDocumentTopology } from './documentTopologyValidation.js';
import {
  buildDocumentTopologyFromDetected,
  buildTopologyConfidenceBreakdown,
  buildTopologyExplainability,
  applyOwnerDefinedTopology,
} from './documentTopologyInference.js';
import { buildRenderedTopologyCells } from './documentTopologyRenderer.js';
import {
  emitDocumentTopologyDetected,
  emitDocumentTopologyEdited,
  emitDocumentTopologyApproved,
  emitDocumentTopologyRejected,
} from './documentTopologyTelemetry.js';
import { interpretDetectedDocument } from './DocumentInterpreterRegistry.js';
import './LoyaltyTopologyInterpreter.js';
import './MenuTopologyInterpreter.js';
import './PromotionFlyerTopologyInterpreter.js';

/**
 * @param {import('./documentTopologyTypes.js').DetectedDocumentGrid} detected
 * @param {import('./documentTopologyTypes.js').DocumentType} documentType
 * @param {Record<string, unknown>} [opts]
 */
export function extractDocumentTopology(detected, documentType = 'LOYALTY_CARD', opts = {}) {
  const result = interpretDetectedDocument(detected, documentType, opts);
  if (!result.ok) return result;

  const topology = /** @type {import('./documentTopologyTypes.js').DocumentTopology} */ (result.topology);
  emitDocumentTopologyDetected(topology, opts);

  return {
    ok: true,
    topology,
    rule: result.rule ?? null,
    documentType,
    confidenceBreakdown: buildTopologyConfidenceBreakdown(topology),
    explainability: buildTopologyExplainability(topology),
  };
}

/**
 * @param {import('./documentTopologyTypes.js').DocumentTopology | null | undefined} topology
 */
export function validateTopology(topology) {
  return validateDocumentTopology(topology);
}

/**
 * @param {import('./documentTopologyTypes.js').DocumentTopology} topology
 */
export function getConfidenceBreakdown(topology) {
  return buildTopologyConfidenceBreakdown(topology);
}

/**
 * @param {import('./documentTopologyTypes.js').DocumentTopology} topology
 */
export function getExplainability(topology) {
  return buildTopologyExplainability(topology);
}

/**
 * @param {import('./documentTopologyTypes.js').DocumentTopology} edited
 * @param {import('./documentTopologyTypes.js').DocumentTopology | null | undefined} original
 * @param {Record<string, unknown>} [ctx]
 */
export function applyOwnerTopologyEdit(edited, original = null, ctx = {}) {
  const next = applyOwnerDefinedTopology(edited, original);
  emitDocumentTopologyEdited(next, ctx);
  return next;
}

/**
 * @param {import('./documentTopologyTypes.js').DocumentTopology} topology
 * @param {Record<string, unknown>} [ctx]
 */
export function approveTopology(topology, ctx = {}) {
  const approved = { ...topology, source: 'APPROVED', reviewRequired: false };
  emitDocumentTopologyApproved(approved, ctx);
  return approved;
}

/**
 * @param {import('./documentTopologyTypes.js').DocumentTopology | null | undefined} topology
 * @param {Record<string, unknown>} [ctx]
 */
export function rejectTopology(topology, ctx = {}) {
  emitDocumentTopologyRejected(topology, ctx);
  return { ok: true, rejected: true };
}

/**
 * @param {import('./documentTopologyTypes.js').DocumentTopology} topology
 * @param {Record<string, unknown>} [opts]
 */
export function renderTopologyGrid(topology, opts = {}) {
  return buildRenderedTopologyCells(topology, opts);
}

/**
 * Build generic document topology without business interpreter (menus, vouchers later).
 * @param {import('./documentTopologyTypes.js').DetectedDocumentGrid} detected
 * @param {Record<string, unknown>} [opts]
 */
export function buildGenericTopology(detected, opts = {}) {
  const topology = buildDocumentTopologyFromDetected(detected, opts);
  if (!topology) return null;
  emitDocumentTopologyDetected(topology, opts);
  return topology;
}

export const DocumentTopologyEngine = {
  extractDocumentTopology,
  validateTopology,
  getConfidenceBreakdown,
  getExplainability,
  applyOwnerTopologyEdit,
  approveTopology,
  rejectTopology,
  renderTopologyGrid,
  buildGenericTopology,
};

export default DocumentTopologyEngine;
