/**
 * Runtime Skill Registry — canonical operational skills (Phase D).
 * Distinct from performerRuntime/skillContracts.js (workflow plan validation).
 */

export const SKILL_TYPE = {
  ANALYSIS: 'analysis',
  CAMPAIGN_GENERATION: 'campaign_generation',
  COPY_GENERATION: 'copy_generation',
  DESIGN_GENERATION: 'design_generation',
  SLIDESHOW_GENERATION: 'slideshow_generation',
  VIDEO_GENERATION: 'video_generation',
  DEVICE_PUBLISH: 'device_publish',
  QA_VALIDATION: 'qa_validation',
  ORCHESTRATION: 'orchestration',
  ENRICHMENT: 'enrichment',
};

const DEFAULT_RETRY = { maxRetries: 3, backoffMs: 1000 };
const DEFAULT_TIMEOUT = { timeoutMs: 300_000 };

/** @type {Record<string, object>} */
export const RUNTIME_SKILLS = {
  [SKILL_TYPE.ANALYSIS]: {
    skillId: SKILL_TYPE.ANALYSIS,
    skillType: SKILL_TYPE.ANALYSIS,
    label: 'Store Analysis',
    supportedTools: ['analyze_store'],
    executionMode: 'sequential',
    retryPolicy: { ...DEFAULT_RETRY, maxRetries: 2 },
    timeoutPolicy: { ...DEFAULT_TIMEOUT },
    requiredCapabilities: ['runtimeStepExecution'],
    inputSchema: {},
    outputSchema: {},
  },
  [SKILL_TYPE.CAMPAIGN_GENERATION]: {
    skillId: SKILL_TYPE.CAMPAIGN_GENERATION,
    skillType: SKILL_TYPE.CAMPAIGN_GENERATION,
    label: 'Campaign Generation',
    supportedTools: [
      'analyze_store',
      'create_campaign',
      'create_promotion',
      'generate_offer',
      'build_campaign_package',
      'launch_campaign',
    ],
    executionMode: 'sequential',
    retryPolicy: DEFAULT_RETRY,
    timeoutPolicy: DEFAULT_TIMEOUT,
    requiredCapabilities: ['runtimeStepExecution'],
    inputSchema: {},
    outputSchema: {},
  },
  [SKILL_TYPE.COPY_GENERATION]: {
    skillId: SKILL_TYPE.COPY_GENERATION,
    skillType: SKILL_TYPE.COPY_GENERATION,
    label: 'Copy Generation',
    supportedTools: ['create_promotion', 'generate_offer_copy', 'campaign_research'],
    executionMode: 'parallel',
    retryPolicy: DEFAULT_RETRY,
    timeoutPolicy: DEFAULT_TIMEOUT,
    requiredCapabilities: ['runtimeStepExecution'],
    inputSchema: {},
    outputSchema: {},
  },
  [SKILL_TYPE.DESIGN_GENERATION]: {
    skillId: SKILL_TYPE.DESIGN_GENERATION,
    skillType: SKILL_TYPE.DESIGN_GENERATION,
    label: 'Design Generation',
    supportedTools: ['generate_promotion_asset', 'generate_poster', 'generate_banner'],
    executionMode: 'parallel',
    retryPolicy: DEFAULT_RETRY,
    timeoutPolicy: DEFAULT_TIMEOUT,
    requiredCapabilities: ['runtimeStepExecution'],
    inputSchema: {},
    outputSchema: {},
  },
  [SKILL_TYPE.SLIDESHOW_GENERATION]: {
    skillId: SKILL_TYPE.SLIDESHOW_GENERATION,
    skillType: SKILL_TYPE.SLIDESHOW_GENERATION,
    label: 'Slideshow Generation',
    supportedTools: ['generate_slideshow', 'export_slideshow'],
    executionMode: 'parallel',
    retryPolicy: DEFAULT_RETRY,
    timeoutPolicy: DEFAULT_TIMEOUT,
    requiredCapabilities: ['runtimeStepExecution'],
    inputSchema: {},
    outputSchema: {},
  },
  [SKILL_TYPE.VIDEO_GENERATION]: {
    skillId: SKILL_TYPE.VIDEO_GENERATION,
    skillType: SKILL_TYPE.VIDEO_GENERATION,
    label: 'Video Generation',
    supportedTools: ['generate_video', 'export_video'],
    executionMode: 'parallel',
    retryPolicy: { ...DEFAULT_RETRY, maxRetries: 2 },
    timeoutPolicy: { timeoutMs: 600_000 },
    requiredCapabilities: ['runtimeStepExecution'],
    inputSchema: {},
    outputSchema: {},
  },
  [SKILL_TYPE.DEVICE_PUBLISH]: {
    skillId: SKILL_TYPE.DEVICE_PUBLISH,
    skillType: SKILL_TYPE.DEVICE_PUBLISH,
    label: 'Device Publish',
    supportedTools: ['publish_campaign', 'deploy_to_device', 'publish_to_screen'],
    executionMode: 'sequential',
    retryPolicy: { ...DEFAULT_RETRY, maxRetries: 2 },
    timeoutPolicy: DEFAULT_TIMEOUT,
    requiredCapabilities: ['runtimeStepExecution'],
    inputSchema: {},
    outputSchema: {},
  },
  [SKILL_TYPE.QA_VALIDATION]: {
    skillId: SKILL_TYPE.QA_VALIDATION,
    skillType: SKILL_TYPE.QA_VALIDATION,
    label: 'QA Validation',
    supportedTools: ['validate_assets', 'readiness_review', 'deployment_validation'],
    executionMode: 'sequential',
    retryPolicy: { maxRetries: 1, backoffMs: 500 },
    timeoutPolicy: { timeoutMs: 120_000 },
    requiredCapabilities: ['runtimeStepExecution'],
    inputSchema: {},
    outputSchema: {},
  },
  [SKILL_TYPE.ENRICHMENT]: {
    skillId: SKILL_TYPE.ENRICHMENT,
    skillType: SKILL_TYPE.ENRICHMENT,
    label: 'Audience Enrichment',
    supportedTools: ['campaign_research', 'audience_analysis'],
    executionMode: 'parallel',
    retryPolicy: DEFAULT_RETRY,
    timeoutPolicy: DEFAULT_TIMEOUT,
    requiredCapabilities: ['runtimeStepExecution'],
    inputSchema: {},
    outputSchema: {},
  },
  [SKILL_TYPE.ORCHESTRATION]: {
    skillId: SKILL_TYPE.ORCHESTRATION,
    skillType: SKILL_TYPE.ORCHESTRATION,
    label: 'Orchestration',
    supportedTools: [],
    executionMode: 'sequential',
    retryPolicy: { maxRetries: 0, backoffMs: 0 },
    timeoutPolicy: { timeoutMs: 60_000 },
    requiredCapabilities: [],
    inputSchema: {},
    outputSchema: {},
  },
};

/** @type {Record<string, string>} */
export const TOOL_TO_SKILL = {
  analyze_store: SKILL_TYPE.ANALYSIS,
  create_campaign: SKILL_TYPE.CAMPAIGN_GENERATION,
  create_promotion: SKILL_TYPE.CAMPAIGN_GENERATION,
  generate_offer: SKILL_TYPE.CAMPAIGN_GENERATION,
  build_campaign_package: SKILL_TYPE.CAMPAIGN_GENERATION,
  launch_campaign: SKILL_TYPE.CAMPAIGN_GENERATION,
  campaign_research: SKILL_TYPE.ENRICHMENT,
  audience_analysis: SKILL_TYPE.ENRICHMENT,
  generate_offer_copy: SKILL_TYPE.COPY_GENERATION,
  generate_promotion_asset: SKILL_TYPE.DESIGN_GENERATION,
  generate_poster: SKILL_TYPE.DESIGN_GENERATION,
  generate_banner: SKILL_TYPE.DESIGN_GENERATION,
  generate_slideshow: SKILL_TYPE.SLIDESHOW_GENERATION,
  export_slideshow: SKILL_TYPE.SLIDESHOW_GENERATION,
  generate_video: SKILL_TYPE.VIDEO_GENERATION,
  export_video: SKILL_TYPE.VIDEO_GENERATION,
  publish_campaign: SKILL_TYPE.DEVICE_PUBLISH,
  deploy_to_device: SKILL_TYPE.DEVICE_PUBLISH,
  publish_to_screen: SKILL_TYPE.DEVICE_PUBLISH,
  validate_assets: SKILL_TYPE.QA_VALIDATION,
  readiness_review: SKILL_TYPE.QA_VALIDATION,
  deployment_validation: SKILL_TYPE.QA_VALIDATION,
};

/** @type {Record<string, string>} */
export const AGENT_TO_SKILL = {
  audienceAgent: SKILL_TYPE.ENRICHMENT,
  copyAgent: SKILL_TYPE.COPY_GENERATION,
  designAgent: SKILL_TYPE.DESIGN_GENERATION,
  slideshowAgent: SKILL_TYPE.SLIDESHOW_GENERATION,
  videoAgent: SKILL_TYPE.VIDEO_GENERATION,
  devicePublishAgent: SKILL_TYPE.DEVICE_PUBLISH,
  QAAgent: SKILL_TYPE.QA_VALIDATION,
};

/**
 * @param {string} skillId
 */
export function getRuntimeSkill(skillId) {
  const id = typeof skillId === 'string' ? skillId.trim() : '';
  return RUNTIME_SKILLS[id] ?? null;
}

/**
 * @param {string} toolName
 */
export function resolveSkillIdForTool(toolName) {
  const tool = typeof toolName === 'string' ? toolName.trim().toLowerCase() : '';
  return TOOL_TO_SKILL[tool] ?? SKILL_TYPE.ORCHESTRATION;
}

/**
 * @param {string} agentName
 */
export function resolveSkillIdForAgent(agentName) {
  const agent = typeof agentName === 'string' ? agentName.trim() : '';
  return AGENT_TO_SKILL[agent] ?? null;
}

export function listRuntimeSkills() {
  return Object.values(RUNTIME_SKILLS);
}

export default {
  SKILL_TYPE,
  RUNTIME_SKILLS,
  TOOL_TO_SKILL,
  AGENT_TO_SKILL,
  getRuntimeSkill,
  resolveSkillIdForTool,
  resolveSkillIdForAgent,
  listRuntimeSkills,
};
