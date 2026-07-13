/**
 * Extract loyalty card grid topology from OCR + LLM structured output.
 * Uses DocumentTopologyEngine via LoyaltyTopologyInterpreter.
 */

import { getTextEngine } from '../../ai/engines/index.js';
import { inferRuleFromTopology } from './loyaltyRuleInference.js';
import { emitLoyaltyTopologyTelemetry } from './loyaltyTopologyTelemetry.js';
import { buildLoyaltyCardTopologyFromDetected } from './loyaltyTopologyBuild.js';
import { validateLoyaltyCardTopology } from './loyaltyTopologyValidation.js';
import { parseLoyaltyCardTopologyFromOcr } from './loyaltyOcrTopologyParser.js';
import { safeParseTopologyJson } from './loyaltyTopologyJsonParse.js';
import {
  DocumentTopologyEngine,
  emitDocumentTopologyDetected,
} from '../documentTopology/index.js';

function pickString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

const TOPOLOGY_PROMPT = `Analyze this loyalty card OCR text and infer the printed stamp-card GRID topology.

OCR text:
{{OCR}}

Return JSON only with this shape:
{
  "rows": number,
  "columns": number,
  "cells": [
    { "row": 0, "column": 0, "role": "PURCHASE"|"REWARD"|"DECORATIVE"|"EMPTY"|"UNKNOWN", "text": "optional label", "confidence": 0-1 }
  ],
  "repeatedPattern": {
    "direction": "ROW"|"COLUMN",
    "roles": ["PURCHASE","REWARD",...],
    "repetitions": number,
    "confidence": 0-1
  },
  "footerText": "optional footer e.g. Catering Available",
  "purchaseItemHint": "e.g. Coffee",
  "rewardItemHint": "e.g. Free Coffee",
  "overallConfidence": 0-1
}

Rules:
- Count each visible stamp/box position with row and column index (0-based).
- Do NOT set purchasesRequired to total purchase cells across all rows.
- If rows repeat the same pattern (e.g. 7 purchase + 1 reward per row), set repeatedPattern.
- Distinguish purchase stamps from reward/free cells.
- Footer text is separate from purchase/reward labels.
- purchasesRequired is PER ROW/CYCLE (e.g. 7 purchases before 1 free), never total cells on the card.
- If OCR lists repeated rows like "Coffee Coffee ... Free", infer rows×columns from repetition, not column count alone.`;

/**
 * Deterministic OCR path — preferred over LLM when stamp grid structure is clear.
 * @param {string} ocrText
 * @param {{ missionId?: string | null; storeId?: string | null }} ctx
 */
function tryExtractTopologyFromOcr(ocrText, ctx = {}) {
  const parsed = parseLoyaltyCardTopologyFromOcr(ocrText);
  if (!parsed?.detected) return null;

  const cardTopology = buildLoyaltyCardTopologyFromDetected(parsed.detected, {
    source: 'VISION_EXTRACTED',
  });
  if (!cardTopology) return null;

  const validation = validateLoyaltyCardTopology(cardTopology);
  if (!validation.valid && (cardTopology.confidence ?? 0) < 0.7) {
    return null;
  }

  const rule = inferRuleFromTopology(cardTopology, {
    purchaseItem: parsed.purchaseItemHint,
    rewardItem: parsed.rewardItemHint,
  });

  emitLoyaltyTopologyTelemetry('loyalty_topology_ocr_parser_completed', {
    missionId: ctx.missionId ?? null,
    storeId: ctx.storeId ?? null,
    method: parsed.method,
    rows: cardTopology.rows,
    columns: cardTopology.columns,
    purchasesRequired: rule?.purchasesRequired ?? null,
    confidence: cardTopology.confidence,
  });

  return {
    ok: true,
    cardTopology,
    rule,
    detected: parsed.detected,
    extractionMethod: parsed.method,
  };
}

/**
 * @param {{ ocrText?: string | null; storeName?: string | null; missionId?: string | null; storeId?: string | null; skipRescanIfOwnerDefined?: import('./loyaltyTopologyTypes.js').LoyaltyCardTopology | null }} input
 */
export async function extractLoyaltyCardTopology(input = {}) {
  if (input.skipRescanIfOwnerDefined?.source === 'OWNER_DEFINED') {
    return {
      ok: true,
      cardTopology: input.skipRescanIfOwnerDefined,
      rule: inferRuleFromTopology(input.skipRescanIfOwnerDefined),
      skippedRescan: true,
    };
  }

  const ocrText = pickString(input.ocrText) || '(no text detected)';
  emitLoyaltyTopologyTelemetry('loyalty_topology_extraction_started', {
    missionId: input.missionId ?? null,
    storeId: input.storeId ?? null,
  });

  const ocrExtracted = tryExtractTopologyFromOcr(ocrText, {
    missionId: input.missionId ?? null,
    storeId: input.storeId ?? null,
  });
  if (ocrExtracted?.ok) {
    const { cardTopology, rule, detected, extractionMethod } = ocrExtracted;
    if (rule && cardTopology.evidence) {
      cardTopology.evidence.inferredRuleSummary = `Collect ${rule.purchasesRequired} · Reward ${rule.rewardQuantity}`;
    }
    emitDocumentTopologyDetected(cardTopology, {
      missionId: input.missionId ?? null,
      storeId: input.storeId ?? null,
    });
    emitLoyaltyTopologyTelemetry('loyalty_topology_extraction_completed', {
      missionId: input.missionId ?? null,
      storeId: input.storeId ?? null,
      rows: cardTopology.rows,
      columns: cardTopology.columns,
      purchaseCellCount: cardTopology.cells.filter((c) => c.role === 'PURCHASE').length,
      rewardCellCount: cardTopology.cells.filter((c) => c.role === 'REWARD').length,
      purchasesRequired: rule?.purchasesRequired ?? null,
      confidence: cardTopology.confidence,
      source: cardTopology.source,
      extractionMethod,
    });
    return {
      ok: true,
      cardTopology,
      rule,
      detected,
      extractionMethod,
    };
  }

  const text = getTextEngine();
  const prompt = TOPOLOGY_PROMPT.replace('{{OCR}}', ocrText);

  let detected = null;
  try {
    const result = await text.generateText({
      systemPrompt:
        'You are a loyalty card layout analyzer. Return valid JSON only. Infer grid structure from stamp positions described in OCR.',
      userPrompt: prompt,
      temperature: 0.15,
    });
    detected = safeParseTopologyJson(result.text, {
      ocrText,
      logLabel: 'loyalty_topology_extraction',
    });
    if (!detected) {
      emitLoyaltyTopologyTelemetry('loyalty_topology_extraction_failed', {
        missionId: input.missionId ?? null,
        storeId: input.storeId ?? null,
        reason: 'topology_parse_failed',
      });
      return { ok: false, error: 'topology_parse_failed' };
    }
  } catch (err) {
    emitLoyaltyTopologyTelemetry('loyalty_topology_extraction_failed', {
      missionId: input.missionId ?? null,
      storeId: input.storeId ?? null,
      reason: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: 'topology_parse_failed' };
  }

  const purchaseItem = pickString(detected.purchaseItemHint, 'Coffee');
  const rewardItem = pickString(detected.rewardItemHint, 'Free Coffee');
  detected.inferredRuleSummary = null;

  const extracted = DocumentTopologyEngine.extractDocumentTopology(
    {
      rows: detected.rows,
      columns: detected.columns,
      cells: Array.isArray(detected.cells) ? detected.cells : [],
      repeatedPattern: detected.repeatedPattern,
      footerText: detected.footerText,
      purchaseItemHint: purchaseItem,
      rewardItemHint: rewardItem,
      overallConfidence: detected.overallConfidence,
    },
    'LOYALTY_CARD',
    {
      missionId: input.missionId ?? null,
      storeId: input.storeId ?? null,
      purchaseItemHint: purchaseItem,
      rewardItemHint: rewardItem,
    },
  );

  if (!extracted.ok) {
    emitLoyaltyTopologyTelemetry('loyalty_topology_extraction_failed', {
      missionId: input.missionId ?? null,
      reason: extracted.error ?? 'empty_topology',
    });
    return { ok: false, error: extracted.error ?? 'empty_topology' };
  }

  const cardTopology = /** @type {import('./loyaltyTopologyTypes.js').LoyaltyCardTopology} */ (
    extracted.topology
  );
  const rule =
    extracted.rule ??
    inferRuleFromTopology(cardTopology, {
      purchaseItem,
      rewardItem,
    });

  if (rule && cardTopology.evidence) {
    cardTopology.evidence.inferredRuleSummary = `Collect ${rule.purchasesRequired} · Reward ${rule.rewardQuantity}`;
  }

  emitDocumentTopologyDetected(cardTopology, {
    missionId: input.missionId ?? null,
    storeId: input.storeId ?? null,
  });

  emitLoyaltyTopologyTelemetry('loyalty_topology_extraction_completed', {
    missionId: input.missionId ?? null,
    storeId: input.storeId ?? null,
    rows: cardTopology.rows,
    columns: cardTopology.columns,
    purchaseCellCount: cardTopology.cells.filter((c) => c.role === 'PURCHASE').length,
    rewardCellCount: cardTopology.cells.filter((c) => c.role === 'REWARD').length,
    purchasesRequired: rule?.purchasesRequired ?? null,
    confidence: cardTopology.confidence,
    source: cardTopology.source,
  });

  if (cardTopology.reviewRequired) {
    emitLoyaltyTopologyTelemetry('loyalty_topology_review_required', {
      missionId: input.missionId ?? null,
      confidence: cardTopology.confidence,
    });
  }

  return {
    ok: true,
    cardTopology,
    rule,
    detected,
    confidenceBreakdown: extracted.confidenceBreakdown,
    explainability: extracted.explainability,
  };
}

export default { extractLoyaltyCardTopology };
