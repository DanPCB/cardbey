/**
 * Bridge BUE artifact classification → DocumentInterpreterRegistry.
 */

import { interpretDetectedDocument } from '../documentTopology/DocumentInterpreterRegistry.js';
import { extractDocumentTopology } from '../documentTopology/DocumentTopologyEngine.js';
import '../documentTopology/MenuTopologyInterpreter.js';
import '../documentTopology/PromotionFlyerTopologyInterpreter.js';

/** @typedef {import('./businessUnderstandingTypes.js').BueArtifactType} BueArtifactType */
/** @typedef {import('../documentTopology/documentTopologyTypes.js').DocumentType} DocumentType */

/** @type {Partial<Record<BueArtifactType, DocumentType>>} */
const BUE_TO_DOCUMENT_TYPE = Object.freeze({
  loyalty_card: 'LOYALTY_CARD',
  menu: 'MENU',
  promotion_flyer: 'PROMOTION_FLYER',
  poster: 'PROMOTION_FLYER',
  price_list: 'PRICE_LIST',
  voucher: 'VOUCHER',
  coupon: 'COUPON',
  business_card: 'BUSINESS_CARD',
});

/**
 * @param {BueArtifactType} artifactType
 * @returns {DocumentType}
 */
export function mapBueArtifactToDocumentType(artifactType) {
  return BUE_TO_DOCUMENT_TYPE[artifactType] ?? 'UNKNOWN';
}

/**
 * @param {string | null | undefined} ocrText
 * @param {{ sections?: Array<{ label?: string; items?: string[] }> } | null} [documentExtraction]
 */
export function buildMenuDetectedFromText(ocrText, documentExtraction = null) {
  /** @type {Array<{ row: number; column: number; role: string; text: string }>} */
  const cells = [];
  let row = 0;

  const sections = Array.isArray(documentExtraction?.sections)
    ? documentExtraction.sections
    : null;

  if (sections?.length) {
    for (const section of sections) {
      if (section.label) {
        cells.push({ row, column: 0, role: 'HEADER', text: String(section.label) });
        row += 1;
      }
      for (const item of section.items ?? []) {
        cells.push({ row, column: 0, role: 'TEXT', text: String(item) });
        row += 1;
      }
    }
  } else {
    const lines = String(ocrText ?? '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    for (const line of lines) {
      const isPrice = /\$\s?\d|^\d+(\.\d{2})?\s*$/.test(line);
      cells.push({
        row,
        column: isPrice ? 1 : 0,
        role: 'TEXT',
        text: line,
      });
      row += 1;
    }
  }

  if (!cells.length) return null;

  const maxCol = Math.max(...cells.map((c) => c.column), 0);
  return {
    rows: row,
    columns: maxCol + 1,
    cells,
    overallConfidence: sections?.length ? 0.82 : 0.68,
    footerText: undefined,
    headerText: documentExtraction?.businessName ?? undefined,
  };
}

/**
 * @param {string | null | undefined} ocrText
 * @param {Record<string, unknown> | null} [documentExtraction]
 */
export function buildFlyerDetectedFromText(ocrText, documentExtraction = null) {
  const headline = String(documentExtraction?.campaign?.name ?? documentExtraction?.businessName ?? '').trim();
  const bodyLines = String(ocrText ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  /** @type {Array<{ row: number; column: number; role: string; text: string }>} */
  const cells = [];
  let row = 0;
  if (headline) {
    cells.push({ row, column: 0, role: 'HEADER', text: headline });
    row += 1;
  }
  for (const line of bodyLines.slice(0, 24)) {
    cells.push({ row, column: 0, role: 'TEXT', text: line });
    row += 1;
  }

  const offers = Array.isArray(documentExtraction?.offers) ? documentExtraction.offers : [];
  for (const offer of offers.slice(0, 6)) {
    const title = String(offer?.title ?? offer?.description ?? '').trim();
    if (!title) continue;
    cells.push({ row, column: 0, role: 'TEXT', text: title });
    row += 1;
  }

  if (!cells.length) return null;

  return {
    rows: row,
    columns: 1,
    cells,
    overallConfidence: 0.75,
    headerText: headline || undefined,
    footerText: undefined,
  };
}

/**
 * @param {import('./businessUnderstandingTypes.js').CanonicalUnderstandingBundle} bundle
 * @param {{ ocrText?: string | null; documentExtraction?: Record<string, unknown> | null }} ctx
 */
export function buildDetectedGridForBueArtifact(bundle, ctx = {}) {
  const artifactType = bundle?.artifact?.artifactType ?? 'unknown';
  const layout = bundle?.layout;

  if (layout?.cells?.length) {
    return {
      rows: layout.rows ?? 1,
      columns: layout.columns ?? 1,
      cells: layout.cells.map((cell) => ({
        row: cell.row,
        column: cell.column,
        role: cell.role,
        text: cell.label,
      })),
      footerText: layout.footerText?.value ?? undefined,
      headerText: layout.headerText?.value ?? undefined,
      overallConfidence: 0.88,
    };
  }

  if (artifactType === 'menu' || artifactType === 'price_list') {
    return buildMenuDetectedFromText(ctx.ocrText, ctx.documentExtraction);
  }
  if (artifactType === 'promotion_flyer' || artifactType === 'poster') {
    return buildFlyerDetectedFromText(ctx.ocrText, ctx.documentExtraction);
  }

  return null;
}

/**
 * @param {import('./businessUnderstandingTypes.js').CanonicalUnderstandingBundle} bundle
 * @param {{ ocrText?: string | null; documentExtraction?: Record<string, unknown> | null }} [ctx]
 */
export function interpretBueArtifactDocument(bundle, ctx = {}) {
  const documentType = mapBueArtifactToDocumentType(bundle?.artifact?.artifactType ?? 'unknown');
  const detected = buildDetectedGridForBueArtifact(bundle, ctx);
  if (!detected) {
    return { ok: false, reason: 'no_detected_grid', documentType };
  }

  return extractDocumentTopology(detected, documentType, {
    missionId: bundle?.artifact?.missionId ?? null,
    storeId: bundle?.artifact?.storeId ?? null,
    source: 'BUE_PIPELINE',
  });
}

export default {
  mapBueArtifactToDocumentType,
  interpretBueArtifactDocument,
  buildDetectedGridForBueArtifact,
};
