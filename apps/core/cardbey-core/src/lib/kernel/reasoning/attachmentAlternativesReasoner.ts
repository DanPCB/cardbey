/**
 * Phase 2 — passive reasoning over attachment evidence.
 * Proposes ranked alternatives; does not decide or execute.
 */

import { randomUUID } from 'node:crypto';
import type {
  AlternativeMission,
  EvidenceView,
  MissionFamily,
  PerceptionFrame,
  ReasoningFrame,
} from '../types.js';

const REASONER_ID = 'attachment_alternatives';
const REASONER_VERSION = '1.0.0';

export { REASONER_ID, REASONER_VERSION };

type ScoredAlternative = AlternativeMission & { _weight: number };

function hasKind(perception: PerceptionFrame, entityKind: string): boolean {
  return perception.interpretations.some((i) => i.entityKind === entityKind);
}

function kindConfidence(perception: PerceptionFrame, entityKind: string): number {
  return (
    perception.interpretations.find((i) => i.entityKind === entityKind)?.confidence ?? 0
  );
}

function alt(
  id: string,
  label: string,
  missionFamily: MissionFamily,
  toolHint: string,
  score: number,
  rationale: string,
  evidenceId: string,
): ScoredAlternative {
  return {
    id,
    label,
    missionFamily,
    toolHint,
    score: Math.min(0.99, Math.max(0.01, score)),
    rationale,
    supportingEvidenceIds: [evidenceId],
    _weight: score,
  };
}

/**
 * Reason over frozen evidence — returns alternatives only.
 */
export function reasonAttachmentAlternatives(args: {
  evidence: EvidenceView;
  perception: PerceptionFrame;
  userGoal?: string | null;
}): ReasoningFrame {
  const { evidence, perception, userGoal } = args;
  const goal = String(userGoal ?? '').trim().toLowerCase();

  /** @type {ScoredAlternative[]} */
  const candidates: ScoredAlternative[] = [];

  const rewardCues = hasKind(perception, 'reward_program_cues');
  const visionReward = hasKind(perception, 'vision_reward_fields');
  const menuCues = hasKind(perception, 'menu_document_cues');
  const promoCues = hasKind(perception, 'promo_material_cues');
  const hasText = hasKind(perception, 'text_extracted') || hasKind(perception, 'weak_text');
  const isPdf = hasKind(perception, 'uploaded_pdf');

  if (rewardCues || visionReward || /loyalty|stamp|reward/.test(goal)) {
    const base = visionReward ? 0.94 : rewardCues ? 0.88 : 0.72;
    candidates.push(
      alt(
        'alt_loyalty',
        'Loyalty Program',
        'loyalty',
        'setup_loyalty_program',
        base,
        visionReward
          ? 'Vision extracted stamp/reward structure from upload'
          : 'Reward program language or visual cues in stream',
        evidence.evidenceId,
      ),
    );
    candidates.push(
      alt(
        'alt_membership',
        'Customer Membership',
        'loyalty',
        'setup_loyalty_program',
        Math.max(0.45, base - 0.39),
        'Related membership pattern; lower confidence than explicit stamp card',
        evidence.evidenceId,
      ),
    );
  }

  if (menuCues || isPdf || /menu|catalog|import/.test(goal)) {
    const base = menuCues ? 0.95 : isPdf ? 0.78 : 0.65;
    candidates.push(
      alt(
        'alt_import_catalog',
        'Import Catalog',
        'catalog',
        'import_catalog',
        base,
        'Menu, catalog, or priced item cues in upload',
        evidence.evidenceId,
      ),
    );
    candidates.push(
      alt(
        'alt_translate_menu',
        'Translate Menu',
        'menu',
        'import_catalog',
        Math.max(0.5, base - 0.13),
        'Menu document may need translation before import',
        evidence.evidenceId,
      ),
    );
    candidates.push(
      alt(
        'alt_qr_menu',
        'Generate QR Menu',
        'menu',
        'import_catalog',
        Math.max(0.45, base - 0.24),
        'Menu upload could become customer-facing QR menu',
        evidence.evidenceId,
      ),
    );
  }

  if (promoCues || /campaign|promo|marketing|flyer/.test(goal)) {
    candidates.push(
      alt(
        'alt_campaign',
        'Marketing Campaign',
        'campaign',
        'launch_campaign',
        promoCues ? 0.82 : 0.61,
        promoCues
          ? 'Promotional flyer or poster cues detected'
          : 'User language suggests marketing intent',
        evidence.evidenceId,
      ),
    );
    candidates.push(
      alt(
        'alt_flyer',
        'Marketing Flyer',
        'content',
        'launch_campaign',
        promoCues ? 0.55 : 0.42,
        'Secondary promotional artifact path',
        evidence.evidenceId,
      ),
    );
  }

  if (hasText && !menuCues && !rewardCues) {
    candidates.push(
      alt(
        'alt_create_store',
        'Create Store',
        'store',
        'create_store',
        0.52,
        'Business text detected without stronger catalog or loyalty cues',
        evidence.evidenceId,
      ),
    );
  }

  candidates.push(
    alt(
      'alt_save_suitcase',
      'Save to Suitcase',
      'content',
      'save_to_suitcase',
      0.38,
      'Conservative archive path when intent is unclear',
      evidence.evidenceId,
    ),
  );

  const alternatives: AlternativeMission[] = [...candidates]
    .sort((a, b) => b._weight - a._weight)
    .slice(0, 6)
    .map(({ _weight, ...rest }) => rest);

  const top = alternatives[0];
  const second = alternatives[1];
  const margin = top && second ? top.score - second.score : top?.score ?? 0;

  /** @type {ReasoningFrame['ambiguities']} */
  const ambiguities: NonNullable<ReasoningFrame['ambiguities']> = [];
  if (margin < 0.12 && top && second) {
    ambiguities.push({
      conflict: `${top.label} vs ${second.label}`,
      clarifyQuestion: `This upload could be ${top.label.toLowerCase()} or ${second.label.toLowerCase()}. Which do you want?`,
    });
  }
  if (hasKind(perception, 'no_text') && hasKind(perception, 'uploaded_image')) {
    ambiguities.push({
      conflict: 'Image without readable text',
      clarifyQuestion: 'I could not read much text. Should I treat this as a loyalty card, menu, or something else?',
    });
  }

  const inferredGoals = alternatives.slice(0, 3).map((a) => ({
    id: a.id,
    label: a.label,
    confidence: a.score,
  }));

  return {
    frameId: randomUUID(),
    evidenceId: evidence.evidenceId,
    createdAt: new Date().toISOString(),
    userGoal: userGoal ?? null,
    inferredGoals,
    alternatives,
    ambiguities: ambiguities.length ? ambiguities : undefined,
    risks:
      margin < 0.08
        ? [{ id: 'low_margin', severity: 'medium', message: 'Top alternatives are closely scored' }]
        : undefined,
    opportunities: menuCues
      ? [{ id: 'catalog_import', label: 'High-confidence catalog import candidate' }]
      : rewardCues
        ? [{ id: 'loyalty_setup', label: 'Reward program setup candidate' }]
        : undefined,
    experienceConsulted: [],
    knowledgeConsulted: [],
    confidence: top?.score ?? 0.35,
  };
}
