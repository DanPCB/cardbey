/**
 * Build enriched evidence snapshot from Reality Stream events + perception.
 */

import type { PerceptionFrame, RealityStreamEvent } from '../types.js';
import type { IntakeEvidenceSnapshot } from './intakeEvidence.types.js';

function findOcrPayload(events: RealityStreamEvent[]) {
  const event = events.find((e) => e.kind === 'ocr_output');
  const obs = event?.observations?.find((o) => o.kind === 'ocr_text');
  return obs?.payload ?? null;
}

function findVisionPayload(events: RealityStreamEvent[]) {
  const event = events.find((e) => e.kind === 'vision_output');
  const obs = event?.observations?.find((o) => o.kind === 'vision_extract');
  return obs?.payload ?? null;
}

function findUploadMetadata(events: RealityStreamEvent[]) {
  const event = events.find((e) => e.kind === 'user_upload');
  const obs = event?.observations?.find((o) => o.kind === 'file_metadata');
  return obs?.payload ?? null;
}

export function buildIntakeEvidenceSnapshot(
  events: RealityStreamEvent[],
  perception: PerceptionFrame,
): IntakeEvidenceSnapshot {
  const ocr = findOcrPayload(events);
  const vision = findVisionPayload(events);
  const upload = findUploadMetadata(events);

  const ocrText = String(ocr?.text ?? '').trim() || null;
  let ocrStatus: IntakeEvidenceSnapshot['ocrStatus'] = 'skipped';
  if (ocrText) {
    ocrStatus = ocrText.length < 12 ? 'weak' : 'ok';
  } else if (ocr?.status === 'failed' || ocr?.error) {
    ocrStatus = 'failed';
  }

  const interpretations = perception.interpretations ?? [];
  const entities = interpretations.map((i) => ({
    kind: i.entityKind ?? 'unknown',
    label: i.label,
    confidence: i.confidence,
  }));

  const confidence =
    entities.length > 0
      ? Math.max(...entities.map((e) => e.confidence))
      : ocrStatus === 'ok'
        ? 0.75
        : 0.4;

  return {
    ocrText,
    ocrStatus,
    ocrProvider: typeof ocr?.provider === 'string' ? ocr.provider : null,
    ocrError: typeof ocr?.error === 'string' ? ocr.error : null,
    visionObservations:
      vision && typeof vision === 'object' ? (vision as Record<string, unknown>) : null,
    uploadMetadata: {
      filename: typeof upload?.filename === 'string' ? upload.filename : null,
      mimeType: typeof upload?.mimeType === 'string' ? upload.mimeType : null,
      fileAssetId: typeof upload?.fileAssetId === 'string' ? upload.fileAssetId : null,
      hasImageRef: upload?.hasImageRef === true,
    },
    interpretations,
    entities,
    confidence,
  };
}
