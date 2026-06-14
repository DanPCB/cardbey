/**
 * Vision intake — classify photos/scans and route to storefront, document ingestion, or stubs.
 */

import { skillRegistry } from '../SkillRegistry.js';

/** @type {import('../types.js').SkillDefinition} */
export const VisionIntakeSkill = {
  name: 'vision_intake',
  version: '1.0',
  description:
    'Classifies visual capture (photos, QR codes) by intent and routes to document ingestion, storefront, or candidate actions.',
  triggers: [
    'vision_intake',
    'capture_photo',
    'scan_vision',
    'photograph_store',
    'scan_qr',
    'capture_flyer',
  ],
  requiredContext: ['userId'],
  observable: true,
  displayResultType: 'vision_intake_result',
  steps: [
    {
      id: 'resolve_vision_location',
      name: 'Resolve location',
      tool: 'resolve_vision_location',
      required: false,
      buildInput: (ctx) => ({
        imageBuffers: ctx.toolInput?.imageBuffers ?? [],
        clientLocation: ctx.toolInput?.clientLocation ?? null,
      }),
    },
    {
      id: 'classify_vision_event',
      name: 'Classify vision event',
      tool: 'classify_vision_event',
      required: true,
      buildInput: (ctx, stepResults) => ({
        decodedPayload: ctx.toolInput?.decodedPayload ?? null,
        surface: ctx.toolInput?.surface ?? 'unknown',
        defaultIntentHint: ctx.toolInput?.defaultIntentHint ?? null,
        imagePaths: ctx.toolInput?.imagePaths ?? [],
        imageBuffers: ctx.toolInput?.imageBuffers ?? [],
        location: stepResults.resolve_vision_location?.output?.location ?? null,
      }),
    },
    {
      id: 'route_vision_event',
      name: 'Route vision event',
      tool: 'route_vision_event',
      required: true,
      buildInput: (ctx, stepResults) => {
        const classification = stepResults.classify_vision_event?.output ?? {};
        return {
          event: {
            id: ctx.toolInput?.eventId ?? ctx.missionId ?? 'vision',
            captureMode: ctx.toolInput?.captureMode ?? 'photo',
            surface: ctx.toolInput?.surface ?? 'unknown',
            userId: ctx.userId ?? null,
            storeIdHint: ctx.storeId ?? ctx.toolInput?.storeIdHint ?? null,
            decodedPayload: ctx.toolInput?.decodedPayload ?? null,
            imagePaths: ctx.toolInput?.imagePaths ?? [],
            location: stepResults.resolve_vision_location?.output?.location ?? null,
            intent: classification.intent ?? 'unknown',
            intentConfidence: classification.confidence ?? 0,
            extraction: classification.extraction ?? {},
          },
          storeIdHint: ctx.storeId ?? ctx.toolInput?.storeIdHint ?? null,
          missionId: ctx.missionId ?? null,
        };
      },
    },
  ],
  retryPolicy: {
    maxAttempts: 2,
    backoffMs: 1200,
    shouldRetry: (error) =>
      error?.code !== 'VALIDATION_ERROR' && error?.code !== 'PERMISSION_DENIED',
  },
};

if (!skillRegistry.has(VisionIntakeSkill.name)) {
  skillRegistry.register(VisionIntakeSkill);
}
