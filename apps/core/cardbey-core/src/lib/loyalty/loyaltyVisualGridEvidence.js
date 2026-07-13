import { buildLoyaltyCardTopologyFromDetected } from './loyaltyTopologyBuild.js';
import { detectStampGridFromImage } from './loyaltyStampGridDetector.js';

/**
 * @typedef {{
 *   row: number;
 *   column: number;
 *   boundingBox: { x: number; y: number; width: number; height: number };
 *   visualConfidence: number;
 * }} VisualGridCell
 */

/**
 * @typedef {{
 *   rows: number;
 *   columns: number;
 *   cells: VisualGridCell[];
 *   repeatedRowPattern?: boolean;
 *   confidence: number;
 *   source?: string;
 * }} VisualGridEvidence
 */

/**
 * @typedef {{
 *   purchaseItem?: string | null;
 *   rewardItem?: string | null;
 *   footerText?: string | null;
 *   labels: string[];
 *   ocrRowEstimate?: number | null;
 *   confidence: number;
 * }} SemanticTextEvidence
 */

function pickString(...values) {
  for (const value of values) {
    if (value == null) continue;
    const trimmed = String(value).trim();
    if (trimmed) return trimmed;
  }
  return null;
}

/**
 * Build normalized cell bounding boxes from row/column indices (unit grid).
 * @param {number} rows
 * @param {number} columns
 * @param {Array<{ row?: number; column?: number; confidence?: number }>} [cells]
 * @returns {VisualGridCell[]}
 */
export function buildVisualGridCells(rows, columns, cells = []) {
  const safeRows = Math.max(1, Math.round(Number(rows) || 1));
  const safeCols = Math.max(1, Math.round(Number(columns) || 1));
  const cellWidth = 1 / safeCols;
  const cellHeight = 1 / safeRows;

  if (Array.isArray(cells) && cells.length > 0) {
    return cells
      .map((cell) => {
        const row = Math.max(0, Math.round(Number(cell.row) || 0));
        const column = Math.max(0, Math.round(Number(cell.column) || 0));
        if (row >= safeRows || column >= safeCols) return null;
        const conf = Number(cell.confidence);
        return {
          row,
          column,
          boundingBox: {
            x: column * cellWidth,
            y: row * cellHeight,
            width: cellWidth,
            height: cellHeight,
          },
          visualConfidence: Number.isFinite(conf) && conf >= 0 && conf <= 1 ? conf : 0.85,
        };
      })
      .filter(Boolean);
  }

  /** @type {VisualGridCell[]} */
  const out = [];
  for (let row = 0; row < safeRows; row += 1) {
    for (let column = 0; column < safeCols; column += 1) {
      out.push({
        row,
        column,
        boundingBox: {
          x: column * cellWidth,
          y: row * cellHeight,
          width: cellWidth,
          height: cellHeight,
        },
        visualConfidence: 0.85,
      });
    }
  }
  return out;
}

/**
 * @param {import('./loyaltyTopologyTypes.js').LoyaltyCardTopology | null | undefined} cardTopology
 * @returns {VisualGridEvidence | null}
 */
export function buildVisualGridEvidenceFromTopology(cardTopology) {
  if (!cardTopology || typeof cardTopology !== 'object') return null;
  const rows = Math.max(0, Math.round(Number(cardTopology.rows) || 0));
  const columns = Math.max(0, Math.round(Number(cardTopology.columns) || 0));
  if (rows < 1 || columns < 1) return null;

  const cells = buildVisualGridCells(
    rows,
    columns,
    Array.isArray(cardTopology.cells) ? cardTopology.cells : [],
  );
  const repeatedRowPattern = Boolean(
    cardTopology.repeatedPattern?.direction === 'ROW' &&
      Number(cardTopology.repeatedPattern?.repetitions) === rows,
  );
  const conf = Number(cardTopology.confidence);
  return {
    rows,
    columns,
    cells,
    repeatedRowPattern,
    confidence: Number.isFinite(conf) && conf >= 0 && conf <= 1 ? conf : 0.85,
    source: pickString(cardTopology.source) ?? 'VISION_EXTRACTED',
  };
}

/**
 * @param {{
 *   ocrText?: string | null;
 *   purchaseItem?: string | null;
 *   rewardItem?: string | null;
 *   footerText?: string | null;
 * }} input
 * @returns {SemanticTextEvidence}
 */
export function buildSemanticTextEvidence(input = {}) {
  const ocrText = String(input.ocrText ?? '').trim();
  const labels = [];
  const purchaseItem = pickString(input.purchaseItem);
  const rewardItem = pickString(input.rewardItem);
  const footerText = pickString(input.footerText);

  if (purchaseItem) labels.push(purchaseItem);
  if (rewardItem) labels.push(rewardItem);
  if (footerText) labels.push(footerText);

  if (ocrText) {
    const tokens = ocrText
      .split(/[\n\r,;|]+/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && line.length < 80);
    for (const token of tokens) {
      if (!labels.some((l) => l.toLowerCase() === token.toLowerCase())) {
        labels.push(token);
      }
    }
  }

  let ocrRowEstimate = null;
  if (ocrText) {
    const lines = ocrText.split(/\n+/).filter((l) => l.trim().length > 2);
    if (lines.length >= 2) ocrRowEstimate = lines.length;
  }

  const hasLabels = labels.length > 0;
  return {
    purchaseItem,
    rewardItem,
    footerText,
    labels,
    ocrRowEstimate,
    confidence: hasLabels ? 0.88 : ocrText ? 0.55 : 0.3,
  };
}

/**
 * Attach visual + semantic evidence bundles to a preseeded draft without mutating grid dimensions from OCR.
 * @param {Record<string, unknown>} draft
 * @param {{ ocrText?: string | null }} [ctx]
 */
export function attachLoyaltyEvidenceSignals(draft = {}, ctx = {}) {
  const out = { ...(draft && typeof draft === 'object' ? draft : {}) };
  const cardTopology = out.cardTopology;
  const visualGridEvidence = buildVisualGridEvidenceFromTopology(cardTopology);
  if (visualGridEvidence) {
    out.visualGridEvidence = visualGridEvidence;
    out.rows = visualGridEvidence.rows;
    out.columns = visualGridEvidence.columns;
  }

  const semanticTextEvidence = buildSemanticTextEvidence({
    ocrText: ctx.ocrText ?? null,
    purchaseItem: out.purchaseItem ?? out.rule?.purchaseItem ?? null,
    rewardItem: out.reward ?? out.rewardRule ?? out.rule?.rewardItem ?? null,
    footerText: out.cardFooterText ?? cardTopology?.footerText ?? null,
  });
  out.semanticTextEvidence = semanticTextEvidence;

  return out;
}

/**
 * @param {UnifiedEvidenceGraph | Record<string, unknown>} graph
 * @param {Record<string, unknown>} [ctx]
 */
function resolveImageAttachment(graph, ctx = {}) {
  const meta = ctx.metadata ?? {};
  const attachments = Array.isArray(graph.attachments) ? graph.attachments : [];

  for (const attachment of attachments) {
    if (!attachment || typeof attachment !== 'object') continue;
    const url = pickString(
      attachment.url,
      attachment.imageUrl,
      attachment.imageDataUrl,
      attachment.href,
    );
    const type = String(attachment.type ?? attachment.mimeType ?? '').toLowerCase();
    const looksLikeImage =
      type.includes('image') ||
      (url && (url.startsWith('data:image') || /\.(jpe?g|png|webp|gif)(\?|$)/i.test(url)));
    if (url && looksLikeImage) {
      return {
        url,
        id: pickString(attachment.id, attachment.attachmentId, attachment.evidenceId),
      };
    }
  }

  const metaUrl = pickString(
    graph.imageRef,
    meta.intakeEvidence?.imageRef,
    meta.imageRef,
    meta.attachmentAnalysis?.imageUrl,
    meta.attachmentAnalysis?.imageDataUrl,
    meta.preseededDraft?.imageAssetId,
    meta.preseededDraft?.imageUrl,
    graph.imageRef,
    graph.imageUrl,
  );
  if (metaUrl) {
    return { url: metaUrl, id: pickString(meta.attachmentAnalysis?.attachmentId) };
  }

  return null;
}

/**
 * @param {Awaited<ReturnType<typeof detectStampGridFromImage>>} detection
 */
export function buildCardTopologyFromDetection(detection) {
  if (!detection.success || !detection.rows || !detection.columns) return null;

  const cells = (detection.rawGrid?.cells ?? []).map((cell) => ({
    row: cell.row,
    column: cell.column,
    role: cell.isReward ? 'REWARD' : cell.filled ? 'PURCHASE' : 'EMPTY',
    confidence: cell.darkness ?? 0.85,
  }));

  return buildLoyaltyCardTopologyFromDetected(
    {
      rows: detection.rows,
      columns: detection.columns,
      cells,
      footerText: detection.footerText ?? undefined,
      overallConfidence: detection.confidence,
    },
    { source: 'VISION_EXTRACTED' },
  );
}

/**
 * Extract visual grid geometry from an evidence graph (geometry-first).
 * Runs stamp-grid CV when an image attachment is available.
 *
 * @param {UnifiedEvidenceGraph | Record<string, unknown>} graph
 * @param {Record<string, unknown>} [ctx]
 */
export async function extractFromGraph(graph, ctx = {}) {
  const meta = ctx.metadata ?? {};

  const imageAttachment = resolveImageAttachment(graph, ctx);
  if (imageAttachment?.url) {
    try {
      const ocrHint = pickString(
        graph.semanticText?.ocrText,
        meta.attachmentAnalysis?.ocrText,
        meta.preseededDraft?.ocrText,
        meta.intakeEvidence?.snapshot?.ocrText,
      );
      const detection = await detectStampGridFromImage(imageAttachment.url, { ocrText: ocrHint });
      const cardTopology = buildCardTopologyFromDetection(detection);
      const visualGrid = cardTopology
        ? buildVisualGridEvidenceFromTopology(cardTopology)
        : {
            rows: detection.rows,
            columns: detection.columns,
            cells: buildVisualGridCells(detection.rows, detection.columns),
            confidence: detection.confidence,
            source: detection.source,
          };

      return {
        success: detection.success,
        source: detection.source,
        confidence: detection.confidence,
        rows: detection.rows,
        columns: detection.columns,
        layout: detection.layout,
        estimatedThreshold: detection.estimatedThreshold,
        footerText: detection.footerText,
        rewardCells: detection.rewardCells,
        visualGrid,
        cardTopology,
        debug: detection.debug,
        imageId: imageAttachment.id ?? null,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('[loyaltyVisualGridEvidence] CV extract failed:', message);
      return {
        success: false,
        source: 'visual_grid_detector',
        confidence: 0,
        rows: null,
        columns: null,
        layout: null,
        visualGrid: null,
        cardTopology: null,
        cvError: message,
        imageId: imageAttachment.id ?? null,
      };
    }
  }

  const draftTopo =
    meta.preseededDraft?.cardTopology ??
    meta.attachmentAnalysis?.preseededDraft?.cardTopology ??
    graph.topology ??
    null;

  if (draftTopo && typeof draftTopo === 'object') {
    const visualGrid = buildVisualGridEvidenceFromTopology(draftTopo);
    return {
      source: 'metadata_card_topology',
      confidence: Number(draftTopo.confidence) || 0.82,
      rows: draftTopo.rows ?? null,
      columns: draftTopo.columns ?? null,
      layout: draftTopo.rows && draftTopo.columns ? `${draftTopo.rows}x${draftTopo.columns}` : null,
      footerText: draftTopo.footerText ?? null,
      visualGrid,
      cardTopology: draftTopo,
    };
  }

  const visualGrid = graph.visualGrid ?? null;
  if (visualGrid?.rows && visualGrid?.columns) {
    return {
      source: 'graph_visual_grid',
      confidence: Number(visualGrid.confidence) || 0.85,
      rows: visualGrid.rows,
      columns: visualGrid.columns,
      layout: `${visualGrid.rows}x${visualGrid.columns}`,
      estimatedThreshold: null,
      footerText: null,
      visualGrid,
      cardTopology: null,
    };
  }

  const visualPerception = (graph.perceptions ?? []).find((p) => p.type === 'visual_grid');
  if (visualPerception?.data?.rows) {
    const rows = Number(visualPerception.data.rows);
    const columns = Number(visualPerception.data.columns);
    return {
      source: 'perception_visual_grid',
      confidence: Number(visualPerception.confidence) || 0.8,
      rows,
      columns,
      layout: `${rows}x${columns}`,
      visualGrid: { rows, columns, cells: [], confidence: Number(visualPerception.confidence) || 0.8 },
      cardTopology: null,
    };
  }

  return {
    success: false,
    source: 'none',
    confidence: 0,
    rows: null,
    columns: null,
    layout: null,
    visualGrid: null,
    cardTopology: null,
  };
}

export default {
  buildVisualGridCells,
  buildVisualGridEvidenceFromTopology,
  buildSemanticTextEvidence,
  attachLoyaltyEvidenceSignals,
  extractFromGraph,
};
