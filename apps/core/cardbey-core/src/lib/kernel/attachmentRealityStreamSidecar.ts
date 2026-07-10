/**
 * Phase 1 — behavior-neutral Reality Stream sidecar for attachment ingest.
 * Appends immutable events only; never classifies mission family.
 * @see docs/COGNITIVE_KERNEL_SPEC.md
 */

import { randomUUID } from 'node:crypto';
import { appendRealityStreamEvent } from './ingress.js';
import { observePassiveCognitivePipeline } from './passive/passivePipeline.js';
import type { RealityStreamEvent, RealityObservation } from './types.js';

const FORBIDDEN_PAYLOAD_KEYS = new Set([
  'artifactType',
  'documentType',
  'missionFamily',
  'tool',
  'suggestedActions',
  'lockedIntent',
]);

export type RealityStreamContext = {
  streamId?: string | null;
  sessionId?: string | null;
  missionId?: string | null;
  userId?: string | null;
  fileAssetId?: string | null;
  entityContextId?: string | null;
  source?: string | null;
  ingestCorrelationId?: string | null;
};

export type AttachmentIngestSidecarInput = RealityStreamContext & {
  filename?: string | null;
  mimeType?: string | null;
  imageRef?: string | null;
  userGoal?: string | null;
  ocrText?: string | null;
  ocrFailed?: boolean;
  ocrProvider?: string | null;
  ocrError?: string | null;
  visionResult?: {
    ok?: boolean;
    ocrText?: string | null;
    extractedFields?: Record<string, unknown> | null;
    provider?: string | null;
    error?: string | null;
  } | null;
};

export type RealityStreamAppendResult = {
  streamId: string;
  eventId: string;
};

function safeLogWarn(message: string, err: unknown): void {
  console.warn(message, err instanceof Error ? err.message : err);
}

function scrubPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (FORBIDDEN_PAYLOAD_KEYS.has(key)) continue;
    out[key] = value;
  }
  return out;
}

function observation(
  kind: string,
  payload: Record<string, unknown>,
  detector: string,
  confidence?: number,
): RealityObservation {
  return {
    observationId: randomUUID(),
    kind,
    payload: scrubPayload(payload),
    detector,
    ...(confidence != null ? { confidence } : {}),
  };
}

/**
 * Resolve stream id for correlated attachment ingest events.
 */
export function resolveRealityStreamId(ctx: RealityStreamContext = {}): string {
  const explicit = String(ctx.streamId ?? '').trim();
  if (explicit) return explicit;

  const sessionId = String(ctx.sessionId ?? '').trim();
  if (sessionId) return `reality:session:${sessionId}`;

  const missionId = String(ctx.missionId ?? '').trim();
  if (missionId) return `reality:mission:${missionId}`;

  const fileAssetId = String(ctx.fileAssetId ?? '').trim();
  if (fileAssetId) return `reality:asset:${fileAssetId}`;

  const entityContextId = String(ctx.entityContextId ?? '').trim();
  if (entityContextId) return `reality:entity:${entityContextId}`;

  const correlationId = String(ctx.ingestCorrelationId ?? '').trim();
  if (correlationId) return `reality:ingest:${correlationId}`;

  return `reality:ephemeral:${randomUUID()}`;
}

function baseMetadata(ctx: RealityStreamContext): Record<string, unknown> {
  const meta: Record<string, unknown> = {
    layer: 'attachment_ingest_sidecar',
    kernelPhase: 1,
  };
  if (ctx.ingestCorrelationId) meta.ingestCorrelationId = ctx.ingestCorrelationId;
  if (ctx.source) meta.source = ctx.source;
  if (ctx.sessionId) meta.sessionId = ctx.sessionId;
  if (ctx.missionId) meta.missionId = ctx.missionId;
  if (ctx.userId) meta.userId = ctx.userId;
  return meta;
}

function imagePayloadRef(imageRef?: string | null, fileAssetId?: string | null): string | null {
  if (fileAssetId) return fileAssetId;
  const ref = String(imageRef ?? '').trim();
  if (!ref) return null;
  if (ref.startsWith('data:') && ref.length > 96) {
    return `data-url:${ref.slice(0, 48)}…${ref.length}`;
  }
  return ref;
}

function appendEvent(
  streamId: string,
  kind: RealityStreamEvent['kind'],
  payloadRef: string | null,
  observations: RealityObservation[],
  metadata: Record<string, unknown>,
): RealityStreamAppendResult {
  const event: RealityStreamEvent = {
    eventId: randomUUID(),
    streamId,
    recordedAt: new Date().toISOString(),
    kind,
    payloadRef,
    observations,
    metadata,
  };
  appendRealityStreamEvent(event);
  return { streamId, eventId: event.eventId };
}

/**
 * Append session_context ref — no mission interpretation.
 */
export function recordSessionContextRef(
  ctx: RealityStreamContext,
): RealityStreamAppendResult | null {
  const sessionId = String(ctx.sessionId ?? '').trim();
  if (!sessionId) return null;

  const streamId = resolveRealityStreamId(ctx);
  return appendEvent(
    streamId,
    'session_context',
    sessionId,
    [
      observation(
        'session_ref',
        {
          sessionId,
          ...(ctx.missionId ? { missionId: ctx.missionId } : {}),
        },
        'attachment_ingest',
      ),
    ],
    baseMetadata(ctx),
  );
}

/**
 * Append user_upload event — file metadata only.
 */
export function recordUserUploadEvent(
  input: AttachmentIngestSidecarInput,
): RealityStreamAppendResult | null {
  const filename = String(input.filename ?? '').trim();
  const mimeType = String(input.mimeType ?? '').trim();
  const imageRef = String(input.imageRef ?? '').trim();
  if (!filename && !mimeType && !imageRef && !input.fileAssetId) return null;

  const streamId = resolveRealityStreamId(input);
  return appendEvent(
    streamId,
    'user_upload',
    imagePayloadRef(imageRef, input.fileAssetId),
    [
      observation(
        'file_metadata',
        {
          filename: filename || null,
          mimeType: mimeType || null,
          hasImageRef: Boolean(imageRef),
          fileAssetId: input.fileAssetId ?? null,
        },
        'attachment_ingest',
      ),
    ],
    baseMetadata(input),
  );
}

/**
 * Append ocr_output event — raw detector text only.
 */
export function recordOcrOutputEvent(
  input: AttachmentIngestSidecarInput,
): RealityStreamAppendResult | null {
  const text = String(input.ocrText ?? '').trim();
  const attempted =
    text.length > 0 ||
    input.ocrFailed === true ||
    Boolean(input.ocrError) ||
    Boolean(input.imageRef);

  if (!attempted) return null;

  let status: 'ok' | 'weak' | 'failed' | 'skipped' = 'skipped';
  if (text.length > 0) {
    status = text.length < 12 ? 'weak' : 'ok';
  } else if (input.ocrFailed || input.ocrError) {
    status = 'failed';
  }

  const streamId = resolveRealityStreamId(input);
  return appendEvent(
    streamId,
    'ocr_output',
    null,
    [
      observation(
        'ocr_text',
        {
          text,
          textLength: text.length,
          status,
          provider: input.ocrProvider ?? null,
          error: input.ocrError ?? null,
        },
        'ocr_provider',
        status === 'ok' ? 0.9 : status === 'weak' ? 0.5 : undefined,
      ),
    ],
    baseMetadata(input),
  );
}

/**
 * Append vision_output event — raw extractor fields only (no mission family).
 */
export function recordVisionOutputEvent(
  input: AttachmentIngestSidecarInput,
): RealityStreamAppendResult | null {
  const vision = input.visionResult;
  if (!vision) return null;

  const streamId = resolveRealityStreamId(input);
  return appendEvent(
    streamId,
    'vision_output',
    imagePayloadRef(input.imageRef, input.fileAssetId),
    [
      observation(
        'vision_extract',
        {
          ok: vision.ok === true,
          ocrText: vision.ocrText ?? null,
          extractedFields: vision.extractedFields
            ? scrubPayload(vision.extractedFields)
            : null,
          provider: vision.provider ?? null,
          error: vision.error ?? null,
        },
        'vision_extractor',
      ),
    ],
    baseMetadata(input),
  );
}

export type AttachmentStreamRecordResult = {
  streamId: string;
  ingestCorrelationId: string;
};

/**
 * Append Reality Stream events synchronously (no passive pipeline).
 * Used by the mandatory intake evidence barrier.
 */
export function recordAttachmentStreamEvents(
  input: AttachmentIngestSidecarInput = {},
): AttachmentStreamRecordResult {
  const correlationId = input.ingestCorrelationId ?? randomUUID();
  const streamId =
    input.streamId ??
    resolveRealityStreamId({
      ...input,
      ingestCorrelationId: correlationId,
    });
  const ctx: AttachmentIngestSidecarInput = {
    ...input,
    ingestCorrelationId: correlationId,
    streamId,
  };

  if (ctx.sessionId) recordSessionContextRef(ctx);
  recordUserUploadEvent(ctx);
  recordOcrOutputEvent(ctx);
  recordVisionOutputEvent(ctx);

  return { streamId, ingestCorrelationId: correlationId };
}

/**
 * Fire-and-forget sidecar for attachment ingest paths.
 * Never throws; does not classify mission family.
 */
export function recordAttachmentIngestSidecar(input: AttachmentIngestSidecarInput = {}): void {
  try {
    const ctx = recordAttachmentStreamEvents(input);
    observePassiveCognitivePipeline({
      streamId: ctx.streamId,
      userGoal: input.userGoal ?? null,
      ingestCorrelationId: ctx.ingestCorrelationId,
    });
  } catch (err) {
    safeLogWarn('[RealityStream] attachment ingest sidecar failed (non-fatal):', err);
  }
}
