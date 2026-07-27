// DANH: skill-round5-cnet
/**
 * Deploy C-Net — config check, payload prep, honest deploy stub.
 */

import { skillRegistry } from '../SkillRegistry.js';

/** @type {import('../types.js').SkillDefinition} */
export const DeployCNetSkill = {
  name: 'deploy_cnet',
  version: '1.0',
  description: 'Check C-Net configuration, prepare store payload, and deploy when keys are set.',
  triggers: [
    'deploy_cnet',
    'cnet',
    'c_net',
    'deploy_c_net',
    'content_network',
    'push_to_cnet',
    'deploy_content_network',
  ],
  requiredContext: ['storeId', 'userId'],
  observable: true,
  steps: [
    {
      id: 'check_cnet_config',
      name: 'Check C-Net config',
      tool: 'check_cnet_config',
      required: true,
      buildInput: (ctx) => ({ storeId: ctx.storeId }),
    },
    {
      id: 'prepare_cnet_payload',
      name: 'Prepare C-Net payload',
      tool: 'prepare_cnet_payload',
      required: true,
      buildInput: (ctx, stepResults) => ({
        storeId: ctx.storeId,
        configured: stepResults.check_cnet_config?.output?.configured === true,
      }),
    },
    {
      id: 'deploy_to_cnet',
      name: 'Deploy to C-Net',
      tool: 'deploy_to_cnet',
      required: true,
      buildInput: (ctx, stepResults) => ({
        configured: stepResults.check_cnet_config?.output?.configured === true,
        payload: stepResults.prepare_cnet_payload?.output?.payload ?? null,
        storeId: ctx.storeId,
      }),
    },
  ],
  retryPolicy: {
    maxAttempts: 2,
    backoffMs: 1500,
    shouldRetry: (error) =>
      error?.code !== 'VALIDATION_ERROR' && error?.code !== 'PERMISSION_DENIED',
  },
};

if (!skillRegistry.has(DeployCNetSkill.name)) {
  skillRegistry.register(DeployCNetSkill);
}
