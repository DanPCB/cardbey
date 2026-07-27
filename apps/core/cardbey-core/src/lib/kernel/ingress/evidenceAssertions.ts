/**
 * Runtime assertions — upload/evidence consistency gates (never silent mis-route).
 */

import { isAttachmentOnlyPlaceholderMessage } from '../../intake/assetUploadGuard.js';
import { selectStreamWindow } from '../ingress.js';
import type { EvidenceView } from '../types.js';
import type { IntakeEvidenceBundle } from './intakeEvidence.types.js';

export class IntakeEvidenceAssertionError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'IntakeEvidenceAssertionError';
    this.code = code;
  }
}

export function streamHasUploadEvent(streamId: string | null | undefined): boolean {
  const id = String(streamId ?? '').trim();
  if (!id) return false;
  return selectStreamWindow({ streamId: id }).some((e) => e.kind === 'user_upload');
}

/**
 * Reject classification when stream has upload but hasAttachment flag is false.
 */
export function assertClassificationEvidenceGate(args: {
  hasAttachmentFlag: boolean;
  streamId?: string | null;
  evidenceView?: EvidenceView | null;
}): void {
  const streamId = String(args.streamId ?? '').trim() || null;
  const streamHasUpload = streamId ? streamHasUploadEvent(streamId) : false;

  if (streamHasUpload && !args.hasAttachmentFlag) {
    throw new IntakeEvidenceAssertionError(
      'EVIDENCE_HAS_ATTACHMENT_MISMATCH',
      `Reality stream ${streamId} has user_upload but hasAttachment=false`,
    );
  }

  if (args.hasAttachmentFlag && streamHasUpload && !args.evidenceView?.evidenceId) {
    throw new IntakeEvidenceAssertionError(
      'EVIDENCE_VIEW_REQUIRED',
      `Upload exists on stream ${streamId} but no frozen EvidenceView is available`,
    );
  }
}

/**
 * Block placeholder-only uploads from routing to general_chat when evidence exists.
 */
export function guardClassificationAgainstEvidence(args: {
  classification: Record<string, unknown>;
  userMessage?: string | null;
  bundle?: IntakeEvidenceBundle | null;
  attachmentOnlyUpload?: boolean;
}): Record<string, unknown> {
  const classification = { ...args.classification };
  const tool = String(classification.tool ?? '').trim();
  const userMessage = String(args.userMessage ?? '').trim();
  const isPlaceholder = isAttachmentOnlyPlaceholderMessage(userMessage);
  const hasEvidence = Boolean(args.bundle?.evidenceView?.evidenceId);

  if (
    hasEvidence &&
    isPlaceholder &&
    tool === 'general_chat' &&
    (args.attachmentOnlyUpload === true || isPlaceholder)
  ) {
    console.warn('[KernelIngress] reroute placeholder upload away from general_chat', {
      evidenceId: args.bundle?.evidenceView.evidenceId,
      streamId: args.bundle?.streamId,
    });
    return {
      ...classification,
      tool: 'ingest_asset_for_intent_detection',
      executionPath: 'direct_action',
      confidence: Math.max(Number(classification.confidence) || 0, 0.92),
      _classificationSource: 'evidence_barrier_placeholder_guard',
      parameters: {
        ...(classification.parameters && typeof classification.parameters === 'object'
          ? classification.parameters
          : {}),
        evidenceId: args.bundle?.evidenceView.evidenceId,
        streamId: args.bundle?.streamId,
      },
    };
  }

  return classification;
}
