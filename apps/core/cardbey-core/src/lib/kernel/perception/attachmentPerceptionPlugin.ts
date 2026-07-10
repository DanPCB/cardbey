/**
 * Phase 2 — attachment stream perception.
 * Interprets Reality Stream events without assigning a mission family.
 */

import { randomUUID } from 'node:crypto';
import type { PerceptionFrame, RealityStreamEvent, RealityStreamWindow } from '../types.js';

const PLUGIN_ID = 'attachment_stream';
const PLUGIN_VERSION = '1.0.0';

const STAMP_CUES =
  /\b(stamp|stamps|punch|buy\s+\d+|get\s+\d+|free\s+\w+|rewards?|loyalty|coffee\s+club|member)\b/i;
const MENU_CUES = /\b(menu|espresso|latte|cappuccino|price|\$\d|catalog|products?)\b/i;
const PROMO_CUES = /\b(flyer|poster|promo|promotion|sale|discount|% off)\b/i;

function collectObservationIds(events: RealityStreamEvent[]): string[] {
  const ids: string[] = [];
  for (const event of events) {
    for (const obs of event.observations ?? []) {
      if (obs.observationId) ids.push(obs.observationId);
    }
  }
  return ids;
}

function findUpload(events: RealityStreamEvent[]) {
  return events.find((e) => e.kind === 'user_upload');
}

function findOcr(events: RealityStreamEvent[]) {
  const event = events.find((e) => e.kind === 'ocr_output');
  const obs = event?.observations?.find((o) => o.kind === 'ocr_text');
  return obs?.payload ?? null;
}

function findVision(events: RealityStreamEvent[]) {
  const event = events.find((e) => e.kind === 'vision_output');
  const obs = event?.observations?.find((o) => o.kind === 'vision_extract');
  return obs?.payload ?? null;
}

/**
 * Perceive attachment ingest events — entity cues only, no mission assignment.
 */
export function perceiveAttachmentStream(args: {
  streamId: string;
  events: RealityStreamEvent[];
  window: RealityStreamWindow;
}): PerceptionFrame {
  const { streamId, events, window } = args;
  const allObservationIds = collectObservationIds(events);
  const uploadObs =
    findUpload(events)?.observations?.find((o) => o.kind === 'file_metadata')?.payload ?? {};
  const filename = String(uploadObs.filename ?? '').toLowerCase();
  const mimeType = String(uploadObs.mimeType ?? '').toLowerCase();
  const ocr = findOcr(events);
  const ocrText = String(ocr?.text ?? '');
  const vision = findVision(events);
  const visionFields =
    vision?.extractedFields && typeof vision.extractedFields === 'object'
      ? (vision.extractedFields as Record<string, unknown>)
      : null;

  /** @type {PerceptionFrame['interpretations']} */
  const interpretations: PerceptionFrame['interpretations'] = [];

  const push = (
    label: string,
    entityKind: string,
    confidence: number,
    observationIds: string[] = allObservationIds,
  ) => {
    interpretations.push({ label, entityKind, confidence, observationIds });
  };

  if (mimeType.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif)$/i.test(filename)) {
    push('Uploaded image file', 'uploaded_image', 0.95);
  } else if (mimeType === 'application/pdf' || /\.pdf$/i.test(filename)) {
    push('Uploaded PDF document', 'uploaded_pdf', 0.92);
  } else if (filename || mimeType) {
    push('Uploaded file', 'uploaded_file', 0.8);
  }

  if (ocrText.length >= 12) {
    push('Extractable text present', 'text_extracted', 0.88);
  } else if (ocrText.length > 0) {
    push('Weak OCR text', 'weak_text', 0.55);
  } else if (events.some((e) => e.kind === 'ocr_output')) {
    push('OCR attempted without usable text', 'no_text', 0.7);
  }

  const textBlob = `${ocrText} ${filename}`.toLowerCase();
  if (STAMP_CUES.test(textBlob) || /loyalty|stamp|rewards?/.test(filename)) {
    push('Reward program visual/language cues', 'reward_program_cues', 0.82);
  }
  if (MENU_CUES.test(textBlob) || /menu|catalog/.test(filename)) {
    push('Menu or catalog document cues', 'menu_document_cues', 0.8);
  }
  if (PROMO_CUES.test(textBlob) || /flyer|poster|promo/.test(filename)) {
    push('Marketing promotional material cues', 'promo_material_cues', 0.75);
  }

  const stamps = Number(visionFields?.requiredStamps);
  const reward = String(visionFields?.reward ?? '').trim();
  if (vision?.ok === true && Number.isFinite(stamps) && stamps >= 1 && reward) {
    push('Structured reward fields detected by vision', 'vision_reward_fields', 0.9);
  } else if (vision?.ok === true) {
    push('Vision enrichment produced partial fields', 'vision_partial_fields', 0.65);
  }

  if (!interpretations.length) {
    push('Attachment present with limited signals', 'unknown_attachment', 0.4);
  }

  return {
    frameId: randomUUID(),
    streamId,
    window,
    pluginId: PLUGIN_ID,
    pluginVersion: PLUGIN_VERSION,
    createdAt: new Date().toISOString(),
    interpretations,
  };
}

export const attachmentPerceptionPlugin = {
  id: PLUGIN_ID,
  version: PLUGIN_VERSION,
};
