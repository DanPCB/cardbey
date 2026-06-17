/**
 * Built-in composable skills — pre-registered with semantic versioning and fallbacks.
 */

import composableSkillRegistry from './skillRegistry.js';

const FALLBACK_STEPS = [
  { action: 'diagnose_store', params: { mode: 'lightweight' } },
];

composableSkillRegistry.register({
  id: 'analyze_store_fallback',
  version: '1.0.0',
  name: 'Analyze Store (Fallback)',
  description: 'Lightweight store diagnosis when full analysis fails',
  category: 'analysis',
  tags: ['store', 'fallback'],
  capabilities: ['analyze'],
  inputs: [{ name: 'storeId', type: 'string', required: true }],
  outputs: [{ name: 'summary', type: 'string' }],
  steps: FALLBACK_STEPS,
  timeout: 30_000,
});

composableSkillRegistry.register({
  id: 'create_campaign_fallback',
  version: '1.0.0',
  name: 'Create Campaign (Fallback)',
  description: 'Draft-only campaign when launch path fails',
  category: 'marketing',
  tags: ['campaign', 'fallback'],
  capabilities: ['campaign_create'],
  inputs: [{ name: 'storeId', type: 'string', required: true }],
  outputs: [{ name: 'draftId', type: 'string' }],
  steps: [{ action: 'generate_campaign_draft' }],
  timeout: 60_000,
});

composableSkillRegistry.register({
  id: 'generate_content_fallback',
  version: '1.0.0',
  name: 'Generate Content (Fallback)',
  description: 'Template-based content when LLM generation fails',
  category: 'creative',
  tags: ['content', 'fallback'],
  capabilities: ['generate'],
  inputs: [{ name: 'topic', type: 'string', required: true }],
  outputs: [{ name: 'content', type: 'string' }],
  steps: [{ action: 'select_template', params: { type: 'social_post' } }],
  timeout: 15_000,
});

composableSkillRegistry.register({
  id: 'analyze_store',
  version: '1.0.0',
  name: 'Analyze Store',
  description: 'Analyze store performance metrics and generate recommendations',
  category: 'analysis',
  tags: ['store', 'analytics', 'recommendations'],
  capabilities: ['analyze', 'forecast', 'analyze_store'],
  inputs: [
    { name: 'storeId', type: 'string', required: true },
    { name: 'timeRange', type: 'string', required: false, default: '30d' },
    {
      name: 'metrics',
      type: 'array',
      required: false,
      default: ['sales', 'traffic', 'conversion'],
    },
  ],
  outputs: [
    { name: 'healthScore', type: 'number' },
    { name: 'recommendations', type: 'array' },
    { name: 'trends', type: 'object' },
  ],
  steps: [
    { action: 'analyze_store', params: { includeHistory: true } },
    { action: 'audit_store_completeness' },
    { action: 'generate_health_report' },
  ],
  timeout: 60_000,
  fallback: 'analyze_store_fallback',
  retry: { maxAttempts: 3, backoff: 'exponential', backoffMs: 500 },
});

composableSkillRegistry.register({
  id: 'create_campaign',
  version: '1.0.0',
  name: 'Create Campaign',
  description: 'Create and launch a marketing campaign',
  category: 'marketing',
  tags: ['campaign', 'marketing', 'launch'],
  capabilities: ['campaign_create', 'launch', 'create_campaign'],
  inputs: [
    { name: 'storeId', type: 'string', required: true },
    { name: 'budget', type: 'number', required: true },
    { name: 'targeting', type: 'object', required: false },
    { name: 'creative', type: 'object', required: false },
  ],
  outputs: [
    { name: 'campaignId', type: 'string' },
    { name: 'status', type: 'string' },
    { name: 'estimatedReach', type: 'number' },
  ],
  steps: [
    { action: 'create_campaign' },
    { action: 'build_campaign_package' },
    { action: 'launch_campaign' },
  ],
  timeout: 120_000,
  fallback: 'create_campaign_fallback',
  retry: { maxAttempts: 2, backoff: 'fixed', backoffMs: 1000 },
});

composableSkillRegistry.register({
  id: 'generate_content',
  version: '1.0.0',
  name: 'Generate Content',
  description: 'Generate content for social media, ads, or store',
  category: 'creative',
  tags: ['content', 'social', 'creative'],
  capabilities: ['generate', 'design', 'generate_content'],
  inputs: [
    {
      name: 'type',
      type: 'string',
      required: true,
      enum: ['social_post', 'ad_copy', 'product_desc'],
    },
    { name: 'topic', type: 'string', required: true },
    { name: 'tone', type: 'string', required: false, default: 'professional' },
    { name: 'length', type: 'number', required: false, default: 100 },
  ],
  outputs: [
    { name: 'content', type: 'string' },
    { name: 'suggestions', type: 'array' },
  ],
  steps: [
    { action: 'select_template', params: { type: 'social_post' } },
    { action: 'generate_offer_copy' },
  ],
  timeout: 30_000,
  fallback: 'generate_content_fallback',
});

export default composableSkillRegistry;
