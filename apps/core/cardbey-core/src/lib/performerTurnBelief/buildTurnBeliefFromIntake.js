/**
 * P1 — Build TurnBelief from intake goal + attachment/OCR signals.
 * Pure helpers; wiring happens at create-store choke point.
 *
 * @module performerTurnBelief/buildTurnBeliefFromIntake
 */

import {
  createEmptyTurnBelief,
  patchTurnBelief,
  buildIdentityGoalMismatchConflict,
  TURN_BELIEF_FACT_KIND,
} from './turnBelief.js';
import { PERFORMER_STATUS } from './performerStatus.js';
import {
  projectPerformerStatus,
  performerStatusResponseFields,
} from './projectPerformerStatus.js';
import { classifyEvidenceKind, EVIDENCE_KIND } from '../../services/draftStore/generationGroundingPolicy.js';

const STOP_TOKENS = new Set([
  'create',
  'store',
  'the',
  'a',
  'an',
  'and',
  'for',
  'my',
  'our',
  'new',
  'business',
  'shop',
  'hut', // weak alone; pair with brand still OK via includes
]);

/**
 * Ask → Create store / upload chip phrases are goals, not business names.
 * @param {unknown} raw
 */
export function isGenericCreateStoreFromUploadGoal(raw) {
  const s = String(raw || '').trim();
  if (!s) return false;
  return (
    /^create\s+(?:a\s+)?store\s+from\s+upload/i.test(s) ||
    /^create\s+(?:a\s+)?store\s+from\s+uploaded/i.test(s) ||
    /^i\s+(?:want|need)\s+to\s+create\s+(?:a\s+)?store\s+from\s+upload/i.test(s)
  );
}

/** Placeholder / non-identity user messages on attachment turns. */
export function isNonIdentityUploadGoal(raw) {
  const s = String(raw || '').trim();
  if (!s) return true;
  if (isGenericCreateStoreFromUploadGoal(s)) return true;
  if (/^\(image attached\)$/i.test(s)) return true;
  if (/^image attached$/i.test(s)) return true;
  if (/^how can i help/i.test(s)) return true;
  return false;
}

/**
 * @param {unknown} raw
 * @returns {string}
 */
export function extractGoalBusinessName(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (isNonIdentityUploadGoal(s)) return '';
  const m =
    s.match(/create\s+store\s*[:\-–—]\s*(.+)$/i) ||
    s.match(/create\s+(?:a\s+)?store\s+(?:for\s+)?(.+)$/i);
  if (m?.[1]) {
    const rest = String(m[1]).trim().replace(/[.!?]+$/, '');
    // "Create store from uploaded card" must not become goal identity "from uploaded card"
    if (/^from\s+upload/i.test(rest)) return '';
    return rest;
  }
  return s.length <= 80 ? s : '';
}

/**
 * @param {string} name
 * @returns {string[]}
 */
export function identityTokens(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s&]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !STOP_TOKENS.has(t));
}

/**
 * True when goal and evidence look like different businesses.
 * @param {string} goalName
 * @param {string} evidenceName
 */
export function identitiesHardConflict(goalName, evidenceName) {
  const g = identityTokens(goalName);
  const e = identityTokens(evidenceName);
  if (g.length === 0 || e.length === 0) return false;
  const overlaps = g.some((gt) =>
    e.some((et) => gt === et || (gt.length >= 3 && et.includes(gt)) || (et.length >= 3 && gt.includes(et))),
  );
  return !overlaps;
}

/**
 * Pull a candidate business name from OCR / attachment analysis.
 * @param {{ ocrText?: string|null, attachmentAnalysis?: object|null, businessUnderstanding?: object|null }} input
 */
/**
 * First usable brand line from OCR text (ignores hours/contact/location lines).
 * @param {string} ocr
 * @returns {string}
 */
export function extractOcrBrandLine(ocr) {
  const text = String(ocr || '').trim();
  if (!text) return '';
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length >= 2 && l.length <= 60);

  for (const line of lines) {
    const kind = classifyEvidenceKind(line);
    if (kind === EVIDENCE_KIND.OPENING_HOURS || kind === EVIDENCE_KIND.CONTACT || kind === EVIDENCE_KIND.LOCATION) {
      continue;
    }
    if (/^(tel|phone|email|www\.|http|menu|services)/i.test(line)) continue;
    const words = line.split(/\s+/);
    if (words.length <= 6 && !/[.?!]$/.test(line)) {
      return line;
    }
  }
  return lines[0] || '';
}

export function extractEvidenceBusinessName(input = {}) {
  const analysis = input.attachmentAnalysis && typeof input.attachmentAnalysis === 'object'
    ? input.attachmentAnalysis
    : null;
  const bue =
    input.businessUnderstanding ||
    analysis?.businessUnderstanding ||
    analysis?.merchantUnderstandingSummary ||
    null;

  const fromBue = String(
    bue?.identity?.name ||
      bue?.businessName ||
      bue?.canonicalName ||
      bue?.merchantName ||
      bue?.name ||
      '',
  ).trim();

  const ocr = String(input.ocrText || analysis?.ocrText || '').trim();
  const fromOcr = extractOcrBrandLine(ocr);

  // Live grounding: OCR brand wins over conflicting BUE invent/cache (Mộc sticky after PTH card).
  if (fromOcr && fromBue && identitiesHardConflict(fromBue, fromOcr)) {
    return fromOcr;
  }
  if (fromOcr) return fromOcr;
  if (fromBue) return fromBue;
  return '';
}

/**
 * Collect non-offering facts (hours etc.) from OCR for belief.
 * @param {string|null|undefined} ocrText
 */
export function extractNonOfferingFactsFromOcr(ocrText) {
  const ocr = String(ocrText || '').trim();
  if (!ocr) return [];
  /** @type {import('./turnBelief.js').TurnBeliefNonOfferingFact[]} */
  const facts = [];
  for (const line of ocr.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
    const kind = classifyEvidenceKind(line);
    if (kind === EVIDENCE_KIND.OPENING_HOURS) {
      facts.push({
        kind: TURN_BELIEF_FACT_KIND.OPENING_HOURS,
        text: line,
        evidenceRefIds: ['ocr'],
      });
    } else if (kind === EVIDENCE_KIND.CONTACT) {
      facts.push({ kind: TURN_BELIEF_FACT_KIND.CONTACT, text: line, evidenceRefIds: ['ocr'] });
    } else if (kind === EVIDENCE_KIND.LOCATION) {
      facts.push({ kind: TURN_BELIEF_FACT_KIND.LOCATION, text: line, evidenceRefIds: ['ocr'] });
    }
  }
  return facts;
}

/**
 * @param {{
 *   goal?: string|null,
 *   businessName?: string|null,
 *   missionId?: string|null,
 *   ocrText?: string|null,
 *   attachmentAnalysis?: object|null,
 *   evidenceName?: string|null,
 * }} input
 */
export function buildTurnBeliefFromIntake(input = {}) {
  const goalRaw = String(input.goal || '').trim();
  // Prefer explicit goal text over handoff businessName (handoff may be stale active-store residue).
  const goalName =
    extractGoalBusinessName(goalRaw) ||
    String(input.businessName || '').trim() ||
    '';

  const evidenceName =
    String(input.evidenceName || '').trim() ||
    extractEvidenceBusinessName({
      ocrText: input.ocrText,
      attachmentAnalysis: input.attachmentAnalysis,
    });

  const evidenceRefs = [];
  if (input.ocrText || input.attachmentAnalysis) {
    evidenceRefs.push({
      id: 'ocr',
      sourceType: input.attachmentAnalysis?.artifactType || 'IMAGE',
      confidence: typeof input.attachmentAnalysis?.confidence === 'number'
        ? input.attachmentAnalysis.confidence
        : 0.5,
    });
  }

  let belief = createEmptyTurnBelief({
    missionId: input.missionId ?? null,
    goal: goalRaw || goalName,
    status: PERFORMER_STATUS.NEEDS_EVIDENCE,
    evidenceRefs,
    nonOfferingFacts: extractNonOfferingFactsFromOcr(input.ocrText || input.attachmentAnalysis?.ocrText),
    identity: {
      name: evidenceName || goalName || null,
      category: null,
      location: null,
      confidence: evidenceName ? 0.65 : goalName ? 0.4 : 0,
      evidenceRefIds: evidenceName ? ['ocr'] : [],
    },
    confidence: evidenceName ? 0.55 : 0.25,
  });

  const conflicts = [];
  if (goalName && evidenceName && identitiesHardConflict(goalName, evidenceName)) {
    conflicts.push(
      buildIdentityGoalMismatchConflict({
        goalName,
        evidenceName,
        evidenceRefIds: evidenceName ? ['ocr'] : [],
      }),
    );
  }

  if (conflicts.length) {
    belief = patchTurnBelief(belief, {
      conflicts,
      status: PERFORMER_STATUS.BLOCKED,
      gaps: ['identity_goal_mismatch'],
      missingQuestions: [
        `Your goal is "${goalName}" but the upload looks like "${evidenceName}". Which business should I use?`,
      ],
      userVisibleSummary: `I see a conflict: goal "${goalName}" vs upload "${evidenceName}". I will not invent a store until this is resolved.`,
      confidence: Math.min(belief.confidence, 0.35),
    });
    return belief;
  }

  if (goalName && !evidenceName) {
    belief = patchTurnBelief(belief, {
      status: PERFORMER_STATUS.READY_TO_PROPOSE,
      identity: {
        ...belief.identity,
        name: goalName,
        confidence: 0.5,
      },
      userVisibleSummary: `Ready to propose a store for "${goalName}" (limited attachment identity).`,
      confidence: 0.45,
      confirmationState: 'not_required',
    });
    return belief;
  }

  if (goalName && evidenceName) {
    belief = patchTurnBelief(belief, {
      status: PERFORMER_STATUS.READY_TO_PROPOSE,
      identity: {
        ...belief.identity,
        name: evidenceName || goalName,
        confidence: 0.7,
        evidenceRefIds: ['ocr'],
      },
      userVisibleSummary: `I read "${evidenceName}" from your upload for goal "${goalName}".`,
      confidence: 0.7,
    });
    return belief;
  }

  // Observe-first: upload identity alone is enough to ask intent (no runway yet).
  if (evidenceName && !goalName) {
    belief = patchTurnBelief(belief, {
      status: PERFORMER_STATUS.READY_TO_PROPOSE,
      identity: {
        ...belief.identity,
        name: evidenceName,
        confidence: 0.7,
        evidenceRefIds: ['ocr'],
      },
      userVisibleSummary: `I read "${evidenceName}" from your upload.`,
      confidence: 0.65,
      confirmationState: 'not_required',
    });
    return belief;
  }

  belief = patchTurnBelief(belief, {
    status: PERFORMER_STATUS.NEEDS_EVIDENCE,
    gaps: ['missing_business_identity'],
    missingQuestions: ['What is the business name?'],
    userVisibleSummary: 'I need a business name (and preferably a card or menu) before I can continue safely.',
  });
  return belief;
}

/**
 * Intake payload when create-store is blocked by TurnBelief.
 * @param {import('./turnBelief.js').TurnBelief} belief
 */
export function buildTurnBeliefBlockedIntakePayload(belief) {
  const conflict = belief.conflicts?.[0];
  const message =
    belief.userVisibleSummary ||
    conflict?.message ||
    'I need to resolve a conflict before starting store setup.';
  const statusProjection = projectPerformerStatus(belief);
  return {
    success: true,
    action: 'clarify',
    clarifyType: 'turn_belief_blocked',
    executionPath: 'turn_belief_gate',
    response: message,
    message,
    ...performerStatusResponseFields(statusProjection),
    turnBelief: belief,
    options: [
      {
        label: 'Use goal name',
        tool: 'create_store',
        parameters: { source: 'turn_belief_resolve_use_goal', resolveConflict: 'use_goal' },
      },
      {
        label: 'Use upload identity',
        tool: 'create_store',
        parameters: { source: 'turn_belief_resolve_use_evidence', resolveConflict: 'use_evidence' },
      },
      {
        label: 'Upload a different file',
        tool: 'general_chat',
        parameters: { source: 'turn_belief_resolve_reupload' },
      },
    ],
    pendingIntent: {
      tool: 'create_store',
      lockedIntent: 'create_store',
      turnBeliefId: belief.turnBeliefId,
      turnBelief: belief,
    },
  };
}

export default {
  extractGoalBusinessName,
  identityTokens,
  identitiesHardConflict,
  extractEvidenceBusinessName,
  extractNonOfferingFactsFromOcr,
  buildTurnBeliefFromIntake,
  buildTurnBeliefBlockedIntakePayload,
};
