/**
 * Canonical loyalty business rule + visual card topology contracts.
 * LoyaltyCardTopology extends the reusable DocumentTopology contract.
 */

/** @typedef {import('../documentTopology/documentTopologyTypes.js').DocumentCellRole} DocumentCellRole */
/** @typedef {import('../documentTopology/documentTopologyTypes.js').DocumentTopologyEvidence} DocumentTopologyEvidence */
/** @typedef {import('../documentTopology/documentTopologyTypes.js').DocumentTopology} DocumentTopology */

/** @typedef {'STAMP_CARD'} LoyaltyProgramType */

/**
 * @typedef {'INDEFINITE' | 'FIXED_CARD_CYCLES' | 'OWNER_DEFINED'} LoyaltyRepeatMode
 */

/**
 * @typedef {{
 *   programType: LoyaltyProgramType;
 *   purchaseItem: string;
 *   purchasesRequired: number;
 *   rewardQuantity: number;
 *   rewardItem: string;
 *   repeatMode: LoyaltyRepeatMode;
 *   fixedCardCycles?: number;
 * }} LoyaltyProgramRule
 */

/** @typedef {'PURCHASE' | 'REWARD' | 'DECORATIVE' | 'UNKNOWN' | DocumentCellRole} LoyaltyCellRole */

/**
 * @typedef {{
 *   row: number;
 *   column: number;
 *   role: LoyaltyCellRole;
 *   label?: string;
 *   confidence?: number;
 * }} LoyaltyCardCell
 */

/**
 * @typedef {{
 *   rowIndex: number;
 *   purchaseCellCount: number;
 *   rewardCellCount: number;
 *   rewardCellIndexes: number[];
 * }} LoyaltyCardCycle
 */

/**
 * @typedef {'VISION_EXTRACTED' | 'OWNER_DEFINED' | 'DEFAULT_TEMPLATE'} LoyaltyTopologySource
 */

/**
 * @typedef {Omit<DocumentTopology, 'documentType' | 'cells' | 'repeatedPatterns' | 'source'> & {
 *   documentType?: 'LOYALTY_CARD';
 *   source: LoyaltyTopologySource | import('../documentTopology/documentTopologyTypes.js').TopologySource;
 *   cells: LoyaltyCardCell[];
 *   cycles: LoyaltyCardCycle[];
 *   repeatedPattern?: {
 *     direction: 'ROW' | 'COLUMN';
 *     sequence: LoyaltyCellRole[];
 *     repetitions: number;
 *   };
 *   footerText?: string;
 * }} LoyaltyCardTopology
 */
/**
 * @typedef {{
 *   rows: number;
 *   columns: number;
 *   cells: Array<{
 *     row: number;
 *     column: number;
 *     boundingBox?: { x: number; y: number; width: number; height: number };
 *     text?: string;
 *     normalizedText?: string;
 *     role: LoyaltyCellRole;
 *     confidence: number;
 *   }>;
 *   repeatedPattern?: {
 *     direction: 'ROW' | 'COLUMN';
 *     roles: LoyaltyCellRole[];
 *     repetitions: number;
 *     confidence: number;
 *   };
 *   footerText?: string;
 *   overallConfidence: number;
 * }} DetectedGridTopology
 */

export const LOYALTY_CELL_ROLES = Object.freeze(['PURCHASE', 'REWARD', 'DECORATIVE', 'UNKNOWN']);
export const LOYALTY_TOPOLOGY_SOURCES = Object.freeze(['VISION_EXTRACTED', 'OWNER_DEFINED', 'DEFAULT_TEMPLATE']);

export default {
  LOYALTY_CELL_ROLES,
  LOYALTY_TOPOLOGY_SOURCES,
};
