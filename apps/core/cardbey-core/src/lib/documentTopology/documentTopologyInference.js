/**
 * Build DocumentTopology from detected grid + confidence/explainability evidence.
 */

import { validateDocumentTopology } from './documentTopologyValidation.js';

/**
 * @param {string} role
 * @returns {import('./documentTopologyTypes.js').DocumentCellRole}
 */
export function normalizeDocumentCellRole(role) {
  const r = String(role ?? '').toUpperCase();
  const allowed = [
    'PURCHASE', 'REWARD', 'TEXT', 'IMAGE', 'EMPTY', 'DECORATIVE',
    'QR_CODE', 'LOGO', 'HEADER', 'FOOTER', 'UNKNOWN',
  ];
  return /** @type {import('./documentTopologyTypes.js').DocumentCellRole} */ (
    allowed.includes(r) ? r : 'UNKNOWN'
  );
}

/**
 * @param {import('./documentTopologyTypes.js').DetectedDocumentGrid} detected
 * @param {{
 *   documentType?: import('./documentTopologyTypes.js').DocumentType;
 *   source?: import('./documentTopologyTypes.js').TopologySource;
 * }} [opts]
 * @returns {import('./documentTopologyTypes.js').DocumentTopology | null}
 */
export function buildDocumentTopologyFromDetected(detected, opts = {}) {
  if (!detected || !Array.isArray(detected.cells) || detected.cells.length === 0) return null;

  const rows = Math.max(1, Math.round(Number(detected.rows) || 1));
  const columns = Math.max(1, Math.round(Number(detected.columns) || 1));
  const source = opts.source ?? 'VISION_EXTRACTED';
  const documentType = opts.documentType ?? 'LOYALTY_CARD';
  const overallConfidence = Math.min(1, Math.max(0, Number(detected.overallConfidence) || 0.5));

  /** @type {import('./documentTopologyTypes.js').DocumentCell[]} */
  const cells = detected.cells.map((cell) => ({
    row: Math.round(Number(cell.row) || 0),
    column: Math.round(Number(cell.column) || 0),
    role: normalizeDocumentCellRole(cell.role),
    label: typeof cell.text === 'string' ? cell.text.trim() || undefined : undefined,
    confidence: Math.min(1, Math.max(0, Number(cell.confidence) || overallConfidence)),
    boundingBox: cell.boundingBox ?? undefined,
  }));

  /** @type {import('./documentTopologyTypes.js').DocumentRepeatedPattern[]} */
  const repeatedPatterns = [];
  if (detected.repeatedPattern) {
    repeatedPatterns.push({
      direction: detected.repeatedPattern.direction === 'COLUMN' ? 'COLUMN' : 'ROW',
      sequence: (detected.repeatedPattern.roles ?? []).map(normalizeDocumentCellRole),
      repetitions: Math.max(1, Math.round(Number(detected.repeatedPattern.repetitions) || 1)),
      confidence: detected.repeatedPattern.confidence,
    });
  }

  const evidence = buildTopologyEvidence(detected, cells, rows, columns, repeatedPatterns);

  const topology = {
    documentType,
    source,
    rows,
    columns,
    cells,
    ...(repeatedPatterns.length ? { repeatedPatterns } : {}),
    ...(detected.headerText ? { header: { text: detected.headerText } } : {}),
    ...(detected.footerText ? { footer: { text: detected.footerText } } : {}),
    confidence: overallConfidence,
    reviewRequired: overallConfidence < 0.85,
    templateVersion: 'document-topology-v2',
    evidence,
    metadata: {},
  };

  const validation = validateDocumentTopology(topology);
  if (!validation.valid) topology.reviewRequired = true;

  return topology;
}

/**
 * @param {import('./documentTopologyTypes.js').DetectedDocumentGrid} detected
 * @param {import('./documentTopologyTypes.js').DocumentCell[]} cells
 * @param {number} rows
 * @param {number} columns
 * @param {import('./documentTopologyTypes.js').DocumentRepeatedPattern[]} repeatedPatterns
 */
function buildTopologyEvidence(detected, cells, rows, columns, repeatedPatterns) {
  const purchaseCount = cells.filter((c) => c.role === 'PURCHASE').length;
  const rewardCount = cells.filter((c) => c.role === 'REWARD').length;
  /** @type {string[]} */
  const patternDescription = [];
  if (repeatedPatterns[0]?.sequence?.length) {
    const seq = repeatedPatterns[0].sequence;
    const purchaseInRow = seq.filter((r) => r === 'PURCHASE').length;
    const rewardInRow = seq.filter((r) => r === 'REWARD').length;
    if (purchaseInRow) patternDescription.push(`${detected.purchaseItemHint ?? 'Purchase'} ×${purchaseInRow}`);
    if (rewardInRow) patternDescription.push(`${detected.rewardItemHint ?? 'Reward'} ×${rewardInRow}`);
    if (repeatedPatterns[0].repetitions > 1) {
      patternDescription.push(`Repeated ${repeatedPatterns[0].repetitions} times`);
    }
  }

  /** @type {string[]} */
  const uncertainties = [];
  if (cells.some((c) => c.role === 'UNKNOWN')) uncertainties.push('Some cells could not be classified');
  if (purchaseCount === 0) uncertainties.push('No purchase cells identified');
  if (rewardCount === 0) uncertainties.push('No reward cells identified');
  if (rows * columns !== cells.length) uncertainties.push('Cell count does not fill full grid');

  return {
    boundedCellCount: cells.length,
    rowCount: rows,
    columnCount: columns,
    purchaseCellCount: purchaseCount,
    rewardCellCount: rewardCount,
    repeatedPatternDetected: repeatedPatterns.length > 0,
    footerDetected: Boolean(detected.footerText),
    headerDetected: Boolean(detected.headerText),
    patternDescription,
    uncertainties,
    inferredRuleSummary: detected.inferredRuleSummary ?? null,
  };
}

/**
 * @param {import('./documentTopologyTypes.js').DocumentTopology} topology
 * @returns {import('./documentTopologyTypes.js').TopologyConfidenceBreakdown}
 */
export function buildTopologyConfidenceBreakdown(topology) {
  const evidence = topology.evidence ?? {};
  const purchaseCount = topology.cells.filter((c) => c.role === 'PURCHASE').length;
  const rewardCount = topology.cells.filter((c) => c.role === 'REWARD').length;
  const hasPattern = (topology.repeatedPatterns?.length ?? 0) > 0;

  /** @type {import('./documentTopologyTypes.js').TopologyConfidenceBreakdown} */
  return {
    overall: topology.confidence,
    detected: [
      { key: 'grid', label: 'Grid detected', ok: topology.rows > 0 && topology.columns > 0 },
      { key: 'rows', label: `${topology.rows} rows`, ok: topology.rows > 0 },
      { key: 'columns', label: `${topology.columns} columns`, ok: topology.columns > 0 },
      { key: 'reward_cells', label: 'Reward cells identified', ok: rewardCount > 0 },
      { key: 'pattern', label: 'Repeated pattern detected', ok: hasPattern },
      { key: 'footer', label: 'Footer detected', ok: Boolean(topology.footer?.text ?? evidence.footerDetected) },
    ],
    uncertainties: Array.isArray(evidence.uncertainties) ? evidence.uncertainties : [],
  };
}

/**
 * @param {import('./documentTopologyTypes.js').DocumentTopology} topology
 */
export function buildTopologyExplainability(topology) {
  const evidence = topology.evidence ?? {};
  const lines = [];
  if (evidence.boundedCellCount) {
    lines.push(`Detected ${evidence.boundedCellCount} bounded cells.`);
  }
  if (evidence.rowCount) {
    lines.push(`Grouped into ${evidence.rowCount} horizontal rows.`);
  }
  if (Array.isArray(evidence.patternDescription) && evidence.patternDescription.length) {
    lines.push('Detected repeated pattern:');
    for (const part of evidence.patternDescription) lines.push(part);
  }
  if (evidence.inferredRuleSummary) {
    lines.push('Business rule inferred:');
    lines.push(evidence.inferredRuleSummary);
  }
  lines.push(`Confidence: ${Math.round(topology.confidence * 100)}%`);
  return lines;
}

/**
 * Mark topology as owner-defined while preserving original extraction.
 * @param {import('./documentTopologyTypes.js').DocumentTopology} edited
 * @param {import('./documentTopologyTypes.js').DocumentTopology | null | undefined} original
 */
export function applyOwnerDefinedTopology(edited, original = null) {
  return {
    ...edited,
    source: 'OWNER_DEFINED',
    originalExtraction: original?.originalExtraction ?? original ?? edited.originalExtraction ?? null,
    reviewRequired: false,
    confidence: Math.max(edited.confidence ?? 0.9, 0.9),
  };
}

export default {
  buildDocumentTopologyFromDetected,
  buildTopologyConfidenceBreakdown,
  buildTopologyExplainability,
  applyOwnerDefinedTopology,
  normalizeDocumentCellRole,
};
