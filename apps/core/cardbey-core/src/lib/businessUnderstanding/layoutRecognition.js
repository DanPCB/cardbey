/**
 * Phase 2 — Layout recognition (structure only, no business logic).
 */

import { governed } from './confidenceGovernance.js';

/** @typedef {import('./businessUnderstandingTypes.js').LayoutContract} LayoutContract */

/**
 * @param {{
 *   cardTopology?: {
 *     rows?: number;
 *     columns?: number;
 *     cells?: Array<{ row?: number; column?: number; role?: string; label?: string }>;
 *     footerText?: string;
 *     header?: { text?: string };
 *     evidence?: Record<string, unknown>;
 *     confidence?: number;
 *   } | null;
 *   documentTopology?: {
 *     rows?: number;
 *     columns?: number;
 *     cells?: Array<{ row?: number; column?: number; role?: string; label?: string }>;
 *     footer?: { text?: string };
 *     header?: { text?: string };
 *     evidence?: Record<string, unknown>;
 *     confidence?: number;
 *   } | null;
 * }} input
 * @returns {LayoutContract | null}
 */
export function extractLayoutContract(input = {}) {
  const topology = input.cardTopology ?? input.documentTopology ?? null;
  if (!topology || !Array.isArray(topology.cells) || topology.cells.length === 0) {
    return null;
  }

  const cells = topology.cells.map((cell) => ({
    row: Number(cell.row ?? 0),
    column: Number(cell.column ?? 0),
    role: String(cell.role ?? 'UNKNOWN'),
    label: typeof cell.label === 'string' ? cell.label : undefined,
  }));

  const purchaseCellCount = cells.filter((c) => c.role === 'PURCHASE').length;
  const rewardCellCount = cells.filter((c) => c.role === 'REWARD').length;
  const layoutConfidence = Number(topology.confidence) || 0.75;
  const footerText =
    topology.footerText ??
    topology.footer?.text ??
    null;
  const headerText = topology.header?.text ?? null;

  const hasLogo = cells.some((c) => c.role === 'LOGO' || /logo/i.test(c.label ?? ''));
  const hasIcons = cells.some((c) => c.role === 'IMAGE' || c.role === 'PURCHASE' || c.role === 'REWARD');

  return {
    schema: 'cb-layout',
    version: 'v1',
    rows: topology.rows ?? null,
    columns: topology.columns ?? null,
    purchaseCellCount,
    rewardCellCount,
    footerText: footerText
      ? governed(footerText, layoutConfidence, 'OBSERVED')
      : null,
    headerText: headerText
      ? governed(headerText, layoutConfidence, 'OBSERVED')
      : null,
    logoPresent: governed(hasLogo, hasLogo ? 0.8 : 0.4, hasLogo ? 'OBSERVED' : 'INFERRED'),
    backgroundPattern: null,
    iconStyle: hasIcons
      ? governed('stamp_icons', layoutConfidence, 'INFERRED')
      : null,
    typographyBlocks: footerText || headerText
      ? governed(
          [headerText, footerText].filter(Boolean),
          layoutConfidence,
          'OBSERVED',
        )
      : null,
    cells,
    evidence: topology.evidence ?? null,
  };
}

export default { extractLayoutContract };
