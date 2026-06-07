// DANH: skill-round5-cardscan
/**
 * Card scan — SuperCopilot bridge check, OCR stub, product creation stub.
 */

import { skillRegistry } from '../SkillRegistry.js';

/** @type {import('../types.js').SkillDefinition} */
export const CardScanSkill = {
  name: 'card_scan',
  version: '1.0',
  description: 'Scan a business card and create a product when SuperCopilot bridge is available.',
  triggers: [
    'scan_card',
    'scan_business_card',
    'card_to_product',
    'scan_card_to_create',
    'import_from_card',
    'business_card_scan',
  ],
  requiredContext: ['userId'],
  observable: true,
  steps: [
    {
      id: 'check_scan_capability',
      name: 'Check scan capability',
      tool: 'check_scan_capability',
      required: true,
      buildInput: (ctx) => ({ userId: ctx.userId }),
    },
    {
      id: 'extract_card_data',
      name: 'Extract card data',
      tool: 'extract_card_data',
      required: true,
      buildInput: (ctx, stepResults) => ({
        available: stepResults.check_scan_capability?.output?.available === true,
        imageUrl: ctx.toolInput?.imageUrl ?? null,
      }),
    },
    {
      id: 'create_product_from_card',
      name: 'Create product from card',
      tool: 'create_product_from_card',
      required: false,
      buildInput: (_ctx, stepResults) => ({
        extracted: stepResults.extract_card_data?.output?.extracted === true,
        cardData: stepResults.extract_card_data?.output ?? null,
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

if (!skillRegistry.has(CardScanSkill.name)) {
  skillRegistry.register(CardScanSkill);
}
