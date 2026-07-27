/**
 * Intake evidence barrier types — frozen EvidenceView bundle for Performer classification.
 */

import type { EvidenceView, PerceptionFrame } from '../types.js';

export type IntakeEvidenceSnapshot = {
  ocrText: string | null;
  ocrStatus: 'ok' | 'weak' | 'failed' | 'skipped';
  ocrProvider: string | null;
  ocrError: string | null;
  visionObservations: Record<string, unknown> | null;
  uploadMetadata: {
    filename: string | null;
    mimeType: string | null;
    fileAssetId: string | null;
    hasImageRef: boolean;
  };
  interpretations: PerceptionFrame['interpretations'];
  entities: Array<{ kind: string; label: string; confidence: number }>;
  confidence: number;
};

export type IntakeEvidenceTiming = {
  startedAt: string;
  completedAt: string;
  totalMs: number;
  realityStreamMs: number;
  perceptionMs: number;
  evidenceMs: number;
  ocrMs: number;
  attachmentAnalysisMs: number;
};

export type IntakeEvidenceBundle = {
  streamId: string;
  evidenceView: EvidenceView;
  perceptionFrame: PerceptionFrame;
  snapshot: IntakeEvidenceSnapshot;
  timing: IntakeEvidenceTiming;
  /** Original upload ref (data URL or CDN URL) for visual grid CV. */
  imageRef?: string | null;
};

export type IntakeEvidenceBarrierResult =
  | {
      status: 'ready';
      bundle: IntakeEvidenceBundle;
      imageContext: {
        extractedText: string;
        provider: string | null;
        hasText: boolean;
        ocrError?: string | null;
        evidenceId: string;
        streamId: string;
      };
      attachmentAnalysis: import('../../intake/attachmentAnalysis.js').AttachmentAnalysis | null;
    }
  | {
      status: 'awaiting_perception';
      streamId: string | null;
      message: string;
      timing: Partial<IntakeEvidenceTiming>;
    }
  | {
      status: 'no_attachment';
    };
