/**
 * Smart display publish — select content, format, push to device, verify playback.
 */

import { skillRegistry } from '../SkillRegistry.js';

/** @type {import('../types.js').SkillDefinition} */
export const SmartDisplayPublishSkill = {
  name: 'smart_display_publish',
  version: '1.0',
  description:
    'Publish content to a paired in-store display screen: select content, format for display, push to device, and verify.',
  triggers: [
    'publish_to_display',
    'push_to_screen',
    'smart_display',
    'display_publish',
    'show_on_screen',
    'update_display',
  ],
  requiredContext: ['storeId', 'userId'],
  observable: true,
  composes: ['campaign'],
  steps: [
    {
      id: 'select_content',
      name: 'Select display content',
      tool: 'select_display_content',
      required: true,
      buildInput: (ctx) => ({
        storeId: ctx.storeId,
        contentType: ctx.toolInput?.contentType || 'campaign',
        artifactId: ctx.toolInput?.artifactId || null,
        campaignId: ctx.toolInput?.campaignId || null,
      }),
    },
    {
      id: 'format_content',
      name: 'Format for display',
      tool: 'format_for_display',
      required: true,
      buildInput: (ctx, stepResults) => ({
        content: stepResults.select_content?.output?.content,
        displayProfile: ctx.toolInput?.displayProfile || null,
      }),
    },
    {
      id: 'push_device',
      name: 'Push to device',
      tool: 'push_to_display_device',
      required: true,
      buildInput: (ctx, stepResults) => ({
        deviceId: ctx.toolInput?.deviceId || null,
        storeId: ctx.storeId,
        formatted: stepResults.format_content?.output?.formatted,
      }),
    },
    {
      id: 'verify',
      name: 'Verify display',
      tool: 'verify_display_output',
      required: false,
      buildInput: (ctx, stepResults) => ({
        deviceId: ctx.toolInput?.deviceId || null,
        contentId: stepResults.select_content?.output?.content?.id,
        pushResult: stepResults.push_device?.output,
      }),
    },
  ],
  retryPolicy: {
    maxAttempts: 3,
    backoffMs: 2000,
    shouldRetry: (error) =>
      error?.code !== 'VALIDATION_ERROR' &&
      error?.code !== 'PERMISSION_DENIED' &&
      error?.code !== 'DEVICE_NOT_PAIRED',
  },
};

if (!skillRegistry.has(SmartDisplayPublishSkill.name)) {
  skillRegistry.register(SmartDisplayPublishSkill);
}
