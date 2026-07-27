/**
 * Orchestrate vision intake: location → classify → route (via tool dispatch for episodic memory).
 */

import { dispatchTool } from '../toolDispatcher.js';
import { createVisionEvent } from './visionEventContract.js';
import { saveVisionUploadFiles } from './saveVisionUploads.js';
import { validateVisionIntakeRequest } from './visionIntakeValidation.js';

/**
 * @param {object} params
 * @param {string|null} params.userId
 * @param {string} params.surface
 * @param {string|null} [params.defaultIntentHint]
 * @param {string|null} [params.decodedPayload]
 * @param {object|null} [params.clientLocation]
 * @param {string|null} [params.storeIdHint]
 * @param {string|null} [params.missionId]
 * @param {Express.Multer.File[]} [params.files]
 */
export async function runVisionIntake(params = {}) {
  const validation = validateVisionIntakeRequest({
    files: params.files ?? [],
    decodedPayload: params.decodedPayload ?? null,
  });
  if (!validation.ok) {
    return { ok: false, error: validation };
  }

  const imagePaths =
    Array.isArray(params.files) && params.files.length > 0
      ? saveVisionUploadFiles(params.files)
      : [];

  const imageBuffers = (params.files ?? [])
    .map((f) => (f?.buffer ? { buffer: f.buffer, mimetype: f.mimetype } : null))
    .filter(Boolean);

  const event = createVisionEvent({
    userId: params.userId ?? null,
    surface: params.surface,
    storeIdHint: params.storeIdHint ?? null,
    decodedPayload: params.decodedPayload ?? null,
    imagePaths,
  });

  const context = {
    userId: params.userId ?? null,
    storeId: params.storeIdHint ?? null,
    missionId: params.missionId ?? null,
  };

  const locDispatch = await dispatchTool(
    'resolve_vision_location',
    { imageBuffers, clientLocation: params.clientLocation ?? null },
    context,
  );
  const location = locDispatch.output?.location ?? null;
  const needsLocation = locDispatch.output?.needsLocation === true;
  event.location = location;

  const classifyDispatch = await dispatchTool(
    'classify_vision_event',
    {
      decodedPayload: params.decodedPayload ?? null,
      surface: params.surface,
      defaultIntentHint: params.defaultIntentHint ?? null,
      imagePaths,
      imageBuffers,
    },
    context,
  );
  event.intent = classifyDispatch.output?.intent ?? 'unknown';
  event.intentConfidence = classifyDispatch.output?.confidence ?? 0;
  event.extraction = classifyDispatch.output?.extraction ?? {};

  const routeDispatch = await dispatchTool(
    'route_vision_event',
    {
      event,
      storeIdHint: params.storeIdHint ?? null,
      missionId: params.missionId ?? null,
    },
    context,
  );

  return {
    ok: true,
    event,
    needsLocation,
    classification: classifyDispatch.output ?? null,
    route: routeDispatch.output ?? null,
  };
}
