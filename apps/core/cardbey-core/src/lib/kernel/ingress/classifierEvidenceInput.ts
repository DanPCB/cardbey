/**
 * Derive Performer classifier input from frozen EvidenceView — not "(Image attached)" placeholders.
 */

import { isAttachmentOnlyPlaceholderMessage } from '../../intake/assetUploadGuard.js';
import type { IntakeEvidenceBundle } from './intakeEvidence.types.js';

export function buildClassifierInputFromEvidence(args: {
  userMessage?: string | null;
  bundle?: IntakeEvidenceBundle | null;
}): string {
  const userMessage = String(args.userMessage ?? '').trim();
  const snapshot = args.bundle?.snapshot;
  if (!snapshot) return userMessage;

  const ocrText = String(snapshot.ocrText ?? '').trim();
  const entitySummary = (snapshot.entities ?? [])
    .slice(0, 4)
    .map((e) => `${e.label} (${e.kind})`)
    .join('; ');

  if (isAttachmentOnlyPlaceholderMessage(userMessage)) {
    if (ocrText.length > 0) {
      return `[Upload evidence]\n${ocrText.slice(0, 1200)}`;
    }
    if (entitySummary) {
      return `[Upload evidence]\nDetected: ${entitySummary}`;
    }
    return '[Upload evidence]\nImage uploaded; perception complete.';
  }

  if (ocrText.length > 0) {
    return `${userMessage}\n\n[Attached image content: ${ocrText.slice(0, 800)}]`;
  }
  if (entitySummary) {
    return `${userMessage}\n\n[Upload evidence: ${entitySummary}]`;
  }
  return userMessage;
}

export function buildEvidenceSummaryForResponse(bundle: IntakeEvidenceBundle | null | undefined): string | null {
  const snapshot = bundle?.snapshot;
  if (!snapshot) return null;
  if (snapshot.ocrText) return snapshot.ocrText.slice(0, 800);
  const entitySummary = (snapshot.entities ?? []).map((e) => e.label).join(', ');
  return entitySummary || null;
}
