/**
 * Reusable document topology contracts — loyalty and future interpreters share this layer.
 */

/** @typedef {'LOYALTY_CARD' | 'MENU' | 'SERVICE_LIST' | 'BUSINESS_CARD' | 'PRICE_LIST' | 'COUPON' | 'VOUCHER' | 'MEMBERSHIP_CARD' | 'PROMOTION_FLYER' | 'UNKNOWN'} DocumentType */

/** @typedef {'VISION_EXTRACTED' | 'OWNER_DEFINED' | 'DEFAULT_TEMPLATE' | 'APPROVED' | 'PUBLISHED'} TopologySource */

/**
 * @typedef {'PURCHASE' | 'REWARD' | 'TEXT' | 'IMAGE' | 'EMPTY' | 'DECORATIVE' | 'QR_CODE' | 'LOGO' | 'HEADER' | 'FOOTER' | 'UNKNOWN'} DocumentCellRole
 */

/**
 * @typedef {{
 *   row: number;
 *   column: number;
 *   role: DocumentCellRole;
 *   label?: string;
 *   confidence?: number;
 *   boundingBox?: { x: number; y: number; width: number; height: number };
 * }} DocumentCell
 */

/**
 * @typedef {{
 *   direction: 'ROW' | 'COLUMN';
 *   sequence: DocumentCellRole[];
 *   repetitions: number;
 *   confidence?: number;
 * }} DocumentRepeatedPattern
 */

/**
 * @typedef {{
 *   documentType: DocumentType;
 *   source: TopologySource;
 *   rows: number;
 *   columns: number;
 *   cells: DocumentCell[];
 *   repeatedPatterns?: DocumentRepeatedPattern[];
 *   header?: { text?: string };
 *   footer?: { text?: string };
 *   sections?: Array<{ id: string; label?: string; rowStart?: number; rowEnd?: number }>;
 *   confidence: number;
 *   reviewRequired: boolean;
 *   metadata?: Record<string, unknown>;
 *   templateVersion?: string;
 *   originalExtraction?: DocumentTopology | null;
 *   evidence?: DocumentTopologyEvidence | null;
 * }} DocumentTopology
 */

/**
 * @typedef {{
 *   boundedCellCount?: number;
 *   rowCount?: number;
 *   columnCount?: number;
 *   purchaseCellCount?: number;
 *   rewardCellCount?: number;
 *   repeatedPatternDetected?: boolean;
 *   footerDetected?: boolean;
 *   headerDetected?: boolean;
 *   patternDescription?: string[];
 *   uncertainties?: string[];
 *   inferredRuleSummary?: string | null;
 * }} DocumentTopologyEvidence
 */

/**
 * @typedef {{
 *   overall: number;
 *   detected: Array<{ key: string; label: string; ok: boolean }>;
 *   uncertainties: string[];
 * }} TopologyConfidenceBreakdown
 */

/**
 * @typedef {{
 *   revisionId: string;
 *   documentId: string;
 *   documentType: DocumentType;
 *   createdAt: string;
 *   createdBy: string | null;
 *   source: TopologySource;
 *   topology: DocumentTopology;
 *   changes?: Record<string, unknown>;
 *   confidence: number;
 *   approved: boolean;
 * }} DocumentTopologyRevision
 */

/**
 * @typedef {{
 *   rows: number;
 *   columns: number;
 *   cells: Array<{
 *     row: number;
 *     column: number;
 *     role?: DocumentCellRole;
 *     text?: string;
 *     confidence?: number;
 *     boundingBox?: { x: number; y: number; width: number; height: number };
 *   }>;
 *   repeatedPattern?: {
 *     direction: 'ROW' | 'COLUMN';
 *     roles: DocumentCellRole[];
 *     repetitions: number;
 *     confidence?: number;
 *   };
 *   footerText?: string;
 *   headerText?: string;
 *   overallConfidence: number;
 *   evidence?: DocumentTopologyEvidence;
 * }} DetectedDocumentGrid
 */

export const DOCUMENT_CELL_ROLES = Object.freeze([
  'PURCHASE', 'REWARD', 'TEXT', 'IMAGE', 'EMPTY', 'DECORATIVE',
  'QR_CODE', 'LOGO', 'HEADER', 'FOOTER', 'UNKNOWN',
]);

export const DOCUMENT_TYPES = Object.freeze([
  'LOYALTY_CARD', 'MENU', 'SERVICE_LIST', 'BUSINESS_CARD', 'PRICE_LIST',
  'COUPON', 'VOUCHER', 'MEMBERSHIP_CARD', 'PROMOTION_FLYER', 'UNKNOWN',
]);

export const TOPOLOGY_SOURCES = Object.freeze([
  'VISION_EXTRACTED', 'OWNER_DEFINED', 'DEFAULT_TEMPLATE', 'APPROVED', 'PUBLISHED',
]);

export default {
  DOCUMENT_CELL_ROLES,
  DOCUMENT_TYPES,
  TOPOLOGY_SOURCES,
};
