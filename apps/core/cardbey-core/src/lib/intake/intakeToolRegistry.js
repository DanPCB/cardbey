/**
 * Intake V2 — single source of truth for executable tools (kernel).
 * Validator, executor policy, and plan normalization must use this registry only.
 */

export const RISK = {
  SAFE_READ: 'safe_read',
  STATE_CHANGE: 'state_change',
  DESTRUCTIVE: 'destructive',
};

/** @typedef {'FIRST' | 'MIDDLE' | 'FINAL' | 'STANDALONE'} PlanRole */

export const PLAN_ROLE = {
  FIRST: 'FIRST',
  MIDDLE: 'MIDDLE',
  FINAL: 'FINAL',
  STANDALONE: 'STANDALONE',
};

export const EXECUTION_PATHS = new Set(['chat', 'direct_action', 'proactive_plan', 'clarify']);

const ROLE_SORT = {
  [PLAN_ROLE.FIRST]: 0,
  [PLAN_ROLE.MIDDLE]: 1,
  [PLAN_ROLE.FINAL]: 2,
  [PLAN_ROLE.STANDALONE]: 3,
};

/**
 * @type {Array<{
 *   toolName: string,
 *   executionPath: 'chat'|'direct_action'|'proactive_plan',
 *   label: string,
 *   riskLevel: string,
 *   requiresStore: boolean,
 *   approvalRequired: boolean,
 *   requiredParams: string[],
 *   optionalParams: string[],
 *   parameterSchema: object,
 *   prerequisiteTools: string[],
 *   planRole: string,
 *   semanticDescription: string,
 *   examples: string[],
 * }>}
 */
export const INTAKE_TOOL_REGISTRY = [
  {
    toolName: 'market_research',
    executionPath: 'proactive_plan',
    label: 'Market Research',
    riskLevel: RISK.SAFE_READ,
    requiresStore: false,
    approvalRequired: false,
    planRole: PLAN_ROLE.FIRST,
    prerequisiteTools: [],
    parameterSchema: {
      properties: {
        goal: { type: 'string' },
        campaignContext: { type: 'string' },
        storeId: { type: 'string' },
      },
    },
    requiredParams: [],
    optionalParams: ['goal', 'campaignContext', 'storeId'],
    semanticDescription: `Research target market, audience insights, and trends to inform campaigns. First step before creating or launching any campaign.`,
    examples: ['research my market', 'who are my customers', 'what should my campaign focus on'],
  },
  {
    toolName: 'create_promotion',
    executionPath: 'proactive_plan',
    label: 'Create Promotion',
    riskLevel: RISK.STATE_CHANGE,
    requiresStore: true,
    approvalRequired: true,
    planRole: PLAN_ROLE.MIDDLE,
    prerequisiteTools: ['market_research'],
    parameterSchema: {
      properties: {
        productContext: { type: 'string' },
        campaignContext: { type: 'string' },
        productId: { type: 'string' },
        storeId: { type: 'string' },
      },
    },
    requiredParams: [],
    optionalParams: ['productContext', 'campaignContext', 'productId', 'storeId'],
    semanticDescription: `Create promotional content and campaign materials. Requires market_research first.`,
    examples: ['create a promotion for my product', 'generate campaign assets', 'create a discount offer'],
  },
  {
    toolName: 'launch_campaign',
    executionPath: 'proactive_plan',
    label: 'Launch Campaign',
    riskLevel: RISK.STATE_CHANGE,
    requiresStore: true,
    approvalRequired: true,
    planRole: PLAN_ROLE.FINAL,
    prerequisiteTools: ['market_research', 'create_promotion'],
    parameterSchema: {
      properties: {
        campaignContext: { type: 'string' },
        storeId: { type: 'string' },
        hint: { type: 'string' },
      },
    },
    requiredParams: [],
    optionalParams: ['campaignContext', 'storeId', 'hint'],
    semanticDescription: `Launch a marketing campaign across channels. Final step after market_research and create_promotion.`,
    examples: ['launch a marketing campaign', 'deploy my promotion', "launch a Valentine's campaign"],
  },
  {
    toolName: 'edit_artifact',
    executionPath: 'direct_action',
    label: 'Edit stored copy',
    riskLevel: RISK.STATE_CHANGE,
    requiresStore: true,
    approvalRequired: true,
    planRole: PLAN_ROLE.STANDALONE,
    prerequisiteTools: [],
    parameterSchema: {
      properties: {
        storeId: { type: 'string' },
        instruction: { type: 'string' },
        description: { type: 'string' },
        artifactType: { type: 'string' },
        targetScope: { type: 'string' },
        artifactId: { type: 'string' },
        promotionId: { type: 'string' },
        draftId: { type: 'string' },
        websiteDraftId: { type: 'string' },
        priorStepsContext: { type: 'string' },
        selectedImageUrl: { type: 'string' },
        confirmImageSelection: { type: 'boolean' },
        storeCategory: { type: 'string' },
      },
    },
    requiredParams: [],
    optionalParams: [
      'storeId',
      'instruction',
      'description',
      'artifactType',
      'targetScope',
      'artifactId',
      'promotionId',
      'draftId',
      'websiteDraftId',
      'priorStepsContext',
      'selectedImageUrl',
      'confirmImageSelection',
      'storeCategory',
    ],
    semanticDescription: `Edit or translate copy already stored in the database: latest promotion (title, message, CTA, badge in metadata), business name/description/tagline, storefront hero text or hero image (Pexels search when user asks for a photo), or mini-website draft preview. Use artifactType "sweep" (or omit when the user says translate everything) to run promotion + website + business + hero text. For app preview / code path fixes, use code_fix instead.`,
    examples: [
      'translate all my store copy to Vietnamese',
      'change the promotion headline',
      'update our business tagline',
      'rewrite the mini website hero',
      'change hero image to a fashion photo',
      'swap the storefront banner photo',
    ],
  },
  {
    toolName: 'connect_social_account',
    executionPath: 'proactive_plan',
    label: 'Connect Social Account',
    riskLevel: RISK.STATE_CHANGE,
    requiresStore: true,
    approvalRequired: false,
    planRole: PLAN_ROLE.STANDALONE,
    prerequisiteTools: [],
    parameterSchema: {
      properties: {
        platform: { type: 'string' },
        storeId: { type: 'string' },
      },
    },
    requiredParams: ['platform'],
    optionalParams: ['storeId'],
    semanticDescription: `Connect a social media account (Facebook, Instagram, Zalo)
    so Cardbey can post campaigns automatically. Use when the user wants to link
    their social account or when publish_to_social fails due to missing connection.`,
    examples: [
      'connect my Facebook',
      'link my Instagram account',
      'connect social media',
      'connect Zalo',
    ],
  },
  {
    toolName: 'publish_to_social',
    executionPath: 'proactive_plan',
    label: 'Share Campaign',
    riskLevel: RISK.STATE_CHANGE,
    requiresStore: true,
    approvalRequired: true,
    planRole: PLAN_ROLE.STANDALONE,
    prerequisiteTools: [],
    parameterSchema: {
      properties: {
        platforms: { type: 'array', items: { type: 'string' } },
        promotionId: { type: 'string' },
        campaignUrl: { type: 'string' },
        caption: { type: 'string' },
        hashtags: { type: 'array', items: { type: 'string' } },
        postMode: { type: 'string' },
        storeId: { type: 'string' },
      },
    },
    requiredParams: ['platforms'],
    optionalParams: ['promotionId', 'campaignUrl', 'caption', 'hashtags', 'postMode', 'storeId'],
    semanticDescription: `Share or publish a campaign to social media platforms.
    Supports Facebook, Instagram, Zalo, WhatsApp, Telegram, Twitter, and email.
    If a platform account is connected, posts automatically.
    If not connected, generates a share link the owner can use manually.
    Use "all" in platforms to share everywhere at once.`,
    examples: [
      'share my campaign to Facebook',
      'post to Instagram',
      'share everywhere',
      'share to Zalo',
      'send to WhatsApp',
      'share campaign link',
      'post to all my social media',
    ],
  },
  {
    toolName: 'analyze_store',
    executionPath: 'proactive_plan',
    label: 'Analyze Store',
    riskLevel: RISK.SAFE_READ,
    requiresStore: true,
    approvalRequired: false,
    planRole: PLAN_ROLE.FIRST,
    prerequisiteTools: [],
    parameterSchema: {
      properties: {
        storeId: { type: 'string' },
        focus: { type: 'string' },
      },
    },
    requiredParams: [],
    optionalParams: ['storeId', 'focus'],
    semanticDescription: `Analyze and audit store content, layout, and performance. First step in store improvement workflows.`,
    examples: ['analyze my store', 'improve my store', 'what can I improve', 'store improvement'],
  },
  {
    toolName: 'rewrite_descriptions',
    executionPath: 'proactive_plan',
    label: 'Rewrite Descriptions',
    riskLevel: RISK.STATE_CHANGE,
    requiresStore: true,
    approvalRequired: true,
    planRole: PLAN_ROLE.MIDDLE,
    prerequisiteTools: ['analyze_store'],
    parameterSchema: {
      properties: {
        storeId: { type: 'string' },
        focus: { type: 'string' },
      },
    },
    requiredParams: [],
    optionalParams: ['storeId', 'focus'],
    semanticDescription: `Rewrite product descriptions and catalog copy.`,
    examples: ['rewrite my product descriptions', 'improve my catalog copy'],
  },
  {
    toolName: 'improve_hero',
    executionPath: 'proactive_plan',
    label: 'Improve Hero Section',
    riskLevel: RISK.STATE_CHANGE,
    requiresStore: true,
    approvalRequired: true,
    planRole: PLAN_ROLE.FINAL,
    prerequisiteTools: ['analyze_store'],
    parameterSchema: {
      properties: { storeId: { type: 'string' } },
    },
    requiredParams: [],
    optionalParams: ['storeId'],
    semanticDescription: `Improve the hero section visually. For text changes prefer code_fix. Not for specific image swaps.`,
    examples: ['improve my store hero', 'make my store look better', 'enhance store visuals'],
  },
  {
    toolName: 'generate_tags',
    executionPath: 'proactive_plan',
    label: 'Generate Product Tags',
    riskLevel: RISK.STATE_CHANGE,
    requiresStore: true,
    approvalRequired: true,
    planRole: PLAN_ROLE.STANDALONE,
    prerequisiteTools: [],
    parameterSchema: {
      properties: { storeId: { type: 'string' } },
    },
    requiredParams: [],
    optionalParams: ['storeId'],
    semanticDescription: `Generate and assign relevant product tags.`,
    examples: ['generate tags for my products', 'add keywords to my catalog'],
  },
  {
    toolName: 'generate_social_posts',
    executionPath: 'proactive_plan',
    label: 'Generate Social Posts',
    riskLevel: RISK.SAFE_READ,
    requiresStore: true,
    approvalRequired: false,
    planRole: PLAN_ROLE.STANDALONE,
    prerequisiteTools: [],
    parameterSchema: {
      properties: {
        storeId: { type: 'string' },
        platform: { type: 'string' },
        context: { type: 'string' },
      },
    },
    requiredParams: [],
    optionalParams: ['storeId', 'platform', 'context'],
    semanticDescription: `Create social posts and captions for Instagram, Facebook, etc.`,
    examples: ['create social media posts', 'write Instagram captions', 'social content plan'],
  },
  {
    toolName: 'smart_visual',
    executionPath: 'direct_action',
    label: 'Generate Visuals',
    riskLevel: RISK.SAFE_READ,
    requiresStore: false,
    approvalRequired: false,
    planRole: PLAN_ROLE.STANDALONE,
    prerequisiteTools: [],
    parameterSchema: {
      required: ['prompt'],
      properties: {
        prompt: { type: 'string' },
        campaignContext: { type: 'string' },
        missionId: { type: 'string' },
      },
    },
    requiredParams: ['prompt'],
    optionalParams: ['campaignContext', 'missionId'],
    semanticDescription: `Generate standalone images or moodboards without a full campaign flow.`,
    examples: ['generate a visual', 'create a moodboard', 'make an image for my product'],
  },
  {
    toolName: 'create_store',
    executionPath: 'direct_action',
    label: 'Create Store',
    riskLevel: RISK.STATE_CHANGE,
    requiresStore: false,
    approvalRequired: false,
    planRole: PLAN_ROLE.STANDALONE,
    prerequisiteTools: [],
    parameterSchema: {
      properties: {
        storeName: { type: 'string' },
        location: { type: 'string' },
        storeType: { type: 'string' },
        intentMode: { type: 'string' },
        _autoSubmit: { type: 'boolean' },
      },
    },
    requiredParams: [],
    optionalParams: ['storeName', 'location', 'storeType', 'intentMode', '_autoSubmit'],
    semanticDescription: `Start automated build_store for a new business (name and optional location from natural language).`,
    examples: ['create a store for my cafe in Melbourne', 'build a store for Acme Co'],
  },
  {
    toolName: 'code_fix',
    executionPath: 'direct_action',
    label: 'Fix Content / Text',
    riskLevel: RISK.STATE_CHANGE,
    requiresStore: false,
    approvalRequired: true,
    planRole: PLAN_ROLE.STANDALONE,
    prerequisiteTools: [],
    parameterSchema: {
      required: ['description'],
      properties: {
        description: { type: 'string' },
        filePaths: { type: 'array', items: {} },
        repoContext: { type: 'string' },
      },
    },
    requiredParams: ['description'],
    optionalParams: ['filePaths', 'repoContext'],
    semanticDescription: `Fix text, headlines, titles, labels. Never use for image/photo changes.`,
    examples: ['fix the headline to MIMI WEB', 'change the tagline', 'update the hero text'],
  },
  {
    toolName: 'orders_report',
    executionPath: 'direct_action',
    label: 'Orders & Sales Report',
    riskLevel: RISK.SAFE_READ,
    requiresStore: true,
    approvalRequired: false,
    planRole: PLAN_ROLE.STANDALONE,
    prerequisiteTools: [],
    parameterSchema: {
      properties: {
        storeId: { type: 'string' },
        dateFrom: { type: 'string' },
        dateTo: { type: 'string' },
        groupBy: { type: 'string', enum: ['day', 'week', 'product', 'customer'] },
        targetMetric: { type: 'string', enum: ['revenue', 'orders', 'customers', 'units'] },
        targetValue: { type: 'string' },
        period: { type: 'string' },
      },
    },
    requiredParams: [],
    optionalParams: [
      'storeId',
      'dateFrom',
      'dateTo',
      'groupBy',
      'targetMetric',
      'targetValue',
      'period',
    ],
    semanticDescription: `Orders, sales, revenue, growth targets, best sellers.`,
    examples: ['show me my orders', 'set a revenue goal', 'increase sales target by 10%'],
  },
  {
    toolName: 'signage.list-devices',
    executionPath: 'direct_action',
    label: 'List Screens',
    riskLevel: RISK.SAFE_READ,
    requiresStore: true,
    approvalRequired: false,
    planRole: PLAN_ROLE.STANDALONE,
    prerequisiteTools: [],
    parameterSchema: {
      properties: {
        storeId: { type: 'string' },
        status: { type: 'string', enum: ['online', 'all'] },
      },
    },
    requiredParams: [],
    optionalParams: ['storeId', 'status'],
    semanticDescription: `List paired screens / C-Net devices.`,
    examples: ['show my screens', 'list my devices', 'what screens do I have'],
  },
  {
    toolName: 'signage.publish-to-devices',
    executionPath: 'direct_action',
    label: 'Push to Screens',
    riskLevel: RISK.STATE_CHANGE,
    requiresStore: true,
    approvalRequired: true,
    planRole: PLAN_ROLE.STANDALONE,
    prerequisiteTools: [],
    parameterSchema: {
      required: ['playlistId'],
      properties: {
        storeId: { type: 'string' },
        playlistId: { type: 'string' },
        pushToAll: { type: 'boolean' },
        deviceIds: { type: 'array', items: {} },
      },
    },
    requiredParams: ['playlistId'],
    optionalParams: ['storeId', 'pushToAll', 'deviceIds'],
    semanticDescription: `Push playlists to physical screens via C-Net.`,
    examples: ['push content to my screens', 'publish to my TV displays'],
  },
  {
    toolName: 'create_offer',
    executionPath: 'direct_action',
    label: 'Create Offer',
    riskLevel: RISK.STATE_CHANGE,
    requiresStore: true,
    approvalRequired: true,
    planRole: PLAN_ROLE.STANDALONE,
    prerequisiteTools: [],
    parameterSchema: {
      properties: {
        storeId: { type: 'string' },
        description: { type: 'string' },
        campaignContext: { type: 'string' },
      },
    },
    requiredParams: [],
    optionalParams: ['storeId', 'description', 'campaignContext'],
    semanticDescription: `Create a discount, sale, or promotional offer for the store.`,
    examples: ['10% off sale', 'create a discount offer', 'set sale target', 'new coupon'],
  },
  {
    toolName: 'generate_slideshow',
    executionPath: 'direct_action',
    label: 'Generate Slideshow',
    riskLevel: RISK.STATE_CHANGE,
    requiresStore: false,
    approvalRequired: false,
    planRole: PLAN_ROLE.STANDALONE,
    prerequisiteTools: [],
    parameterSchema: {
      required: ['promotionId'],
      properties: {
        promotionId: { type: 'string' },
        instanceId: { type: 'string' },
        frameDurationMs: { type: 'number' },
        aspectRatio: { type: 'string' },
      },
    },
    requiredParams: ['promotionId'],
    optionalParams: ['instanceId', 'frameDurationMs', 'aspectRatio'],
    semanticDescription: `Creates an animated slideshow from promotion content. Export runs in Content Studio; upload the GIF via media API when ready.`,
    examples: ['create a slideshow for my promotion', 'export my promotion as a gif slideshow', 'animated slideshow from promo'],
  },
  {
    toolName: 'general_chat',
    executionPath: 'chat',
    label: 'General Chat',
    riskLevel: RISK.SAFE_READ,
    requiresStore: false,
    approvalRequired: false,
    planRole: PLAN_ROLE.STANDALONE,
    prerequisiteTools: [],
    parameterSchema: {
      properties: { response: { type: 'string' } },
    },
    requiredParams: [],
    optionalParams: ['response'],
    semanticDescription: `General questions and capabilities. For hero/banner image updates, prefer improve_hero or smart_visual — do not tell the user to use a preview-panel button.`,
    examples: ['what can you do', 'how do I publish', 'where are my orders'],
  },
  {
    toolName: 'analyze_content',
    executionPath: 'chat',
    label: 'Analyze Content',
    description: 'Read, analyze, or extract information from uploaded images, documents, or flyers',
    planRole: PLAN_ROLE.STANDALONE,
    riskLevel: RISK.SAFE_READ,
    requiresStore: false,
    approvalRequired: false,
    prerequisiteTools: [],
    parameterSchema: {
      properties: {
        contentType: { type: 'string' },
        extractionGoal: { type: 'string' },
      },
      required: [],
    },
    requiredParams: [],
    optionalParams: ['contentType', 'extractionGoal'],
    semanticDescription:
      'Analyze uploaded images or documents. Use when user says "read this", "what does this say", "analyze this flyer", "extract info from this image". Do NOT use for creating campaigns.',
    examples: [
      'read this flyer',
      'what does this say?',
      'analyze this image',
      'extract the text from this',
      'what information is in this document?',
    ],
  },
  {
    toolName: 'canvas.loadTemplate',
    executionPath: 'direct_action',
    label: 'Load canvas template',
    riskLevel: RISK.STATE_CHANGE,
    requiresStore: false,
    approvalRequired: false,
    planRole: PLAN_ROLE.STANDALONE,
    prerequisiteTools: [],
    // Phase 3: executor implementation (canvasToolExecutor); registry only lists the tool.
    executor: 'canvasToolExecutor',
    parameterSchema: {
      required: ['templateId'],
      properties: {
        templateId: { type: 'string' },
      },
    },
    requiredParams: ['templateId'],
    optionalParams: [],
    semanticDescription: `Load a design template onto the Contents Studio canvas by template id.`,
    examples: ['load the bakery promo template', 'open template t_abc123 on the canvas'],
  },
  {
    toolName: 'canvas.applyBrandAsset',
    executionPath: 'direct_action',
    label: 'Apply brand asset to canvas',
    riskLevel: RISK.STATE_CHANGE,
    requiresStore: false,
    approvalRequired: false,
    planRole: PLAN_ROLE.STANDALONE,
    prerequisiteTools: [],
    executor: 'canvasToolExecutor',
    parameterSchema: {
      required: ['assetId', 'assetUrl'],
      properties: {
        assetId: { type: 'string' },
        assetUrl: { type: 'string' },
        position: { type: 'object' },
      },
    },
    requiredParams: ['assetId', 'assetUrl'],
    optionalParams: ['position'],
    semanticDescription: `Place a logo or brand asset from the content library onto the canvas.`,
    examples: ['add my brand logo to the canvas', 'put the fetched logo in the corner'],
  },
  {
    toolName: 'canvas.exportToSuitcase',
    executionPath: 'direct_action',
    label: 'Export canvas to suitcase',
    riskLevel: RISK.STATE_CHANGE,
    requiresStore: false,
    approvalRequired: true,
    planRole: PLAN_ROLE.STANDALONE,
    prerequisiteTools: [],
    executor: 'canvasToolExecutor',
    parameterSchema: {
      properties: {
        filename: { type: 'string' },
        format: { type: 'string', enum: ['png', 'jpeg'] },
      },
    },
    requiredParams: [],
    optionalParams: ['filename', 'format'],
    semanticDescription: `Export the current Contents Studio canvas design to the content suitcase (PNG or JPEG). Default format PNG.`,
    examples: ['export this design to my suitcase', 'save the canvas as a PNG'],
  },
];

/** @param {string} toolName */
export function getToolEntry(toolName) {
  return INTAKE_TOOL_REGISTRY.find((t) => t.toolName === toolName) ?? null;
}

/** @param {string} toolName */
export function isRegisteredTool(toolName) {
  return INTAKE_TOOL_REGISTRY.some((t) => t.toolName === toolName);
}

export function formatToolRegistryForPrompt() {
  return INTAKE_TOOL_REGISTRY.map((t, i) => {
      const path =
        t.executionPath === 'proactive_plan'
          ? '(multi-step plan)'
          : t.executionPath === 'direct_action'
            ? '(direct_action)'
            : '(chat)';
      const risk =
        t.riskLevel === RISK.STATE_CHANGE ? ' ⚠ state_change' : t.riskLevel === RISK.DESTRUCTIVE ? ' ⚠ destructive' : '';
      return `${i + 1}. ${t.toolName} ${path}${risk}
   ${String(t.semanticDescription).trim()}
   Examples: ${t.examples.slice(0, 3).join('; ')}`;
    })
    .join('\n\n');
}

/**
 * Strict parameter validation for execution-critical flows.
 * Unknown keys → errors (not silently passed).
 * @param {string} toolName
 * @param {Record<string, unknown>} parameters
 * @param {{ strictUnknownKeys?: boolean }} opts
 * @returns {{ ok: boolean, errors: Array<{ field: string, reason: string }>, cleaned: Record<string, unknown> }}
 */
export function validateToolParameters(toolName, parameters, opts = {}) {
  const strictUnknown = opts.strictUnknownKeys !== false;
  const entry = getToolEntry(toolName);
  const errors = [];
  const cleaned = {};

  if (!entry?.parameterSchema) {
    return { ok: true, errors: [], cleaned: parameters && typeof parameters === 'object' ? { ...parameters } : {} };
  }

  const schema = entry.parameterSchema;
  const input = parameters && typeof parameters === 'object' && !Array.isArray(parameters) ? parameters : {};

  const allowedKeys = schema.properties ? new Set(Object.keys(schema.properties)) : new Set();

  if (strictUnknown) {
    for (const key of Object.keys(input)) {
      if (allowedKeys.size && !allowedKeys.has(key)) {
        errors.push({ field: key, reason: 'unknown_field' });
      }
    }
  }

  if (Array.isArray(schema.required)) {
    for (const req of schema.required) {
      const val = input[req];
      if (val === null || val === undefined || val === '') {
        errors.push({ field: req, reason: 'required_missing' });
      }
    }
  }

  for (const key of allowedKeys) {
    if (!(key in input)) continue;
    const val = input[key];
    const def = schema.properties[key];
    if (def == null) continue;

    if (val === null || val === undefined) continue;

    if (def.type === 'string' && typeof val !== 'string') {
      errors.push({ field: key, reason: `expected_string_got_${typeof val}` });
      continue;
    }
    if (def.type === 'boolean' && typeof val !== 'boolean') {
      errors.push({ field: key, reason: `expected_boolean_got_${typeof val}` });
      continue;
    }
    if (def.type === 'array' && !Array.isArray(val)) {
      errors.push({ field: key, reason: 'expected_array' });
      continue;
    }
    if (def.type === 'number' && typeof val !== 'number') {
      errors.push({ field: key, reason: `expected_number_got_${typeof val}` });
      continue;
    }
    if (def.type === 'object') {
      if (val === null || typeof val !== 'object' || Array.isArray(val)) {
        errors.push({ field: key, reason: 'expected_plain_object' });
        continue;
      }
      cleaned[key] = val;
      continue;
    }
    if (def.enum && !def.enum.includes(val)) {
      errors.push({ field: key, reason: `enum_invalid:${val}` });
      continue;
    }
    cleaned[key] = val;
  }

  return { ok: errors.length === 0, errors, cleaned };
}

/**
 * @param {string} destinationTool
 * @returns {Set<string>}
 */
export function allowedPlanToolClosure(destinationTool) {
  const dest = getToolEntry(destinationTool);
  if (!dest || dest.executionPath !== 'proactive_plan') return new Set();
  const out = new Set();
  const stack = [destinationTool];
  while (stack.length) {
    const t = stack.pop();
    if (!t || out.has(t)) continue;
    out.add(t);
    const e = getToolEntry(t);
    if (e?.prerequisiteTools) {
      for (const p of e.prerequisiteTools) stack.push(p);
    }
  }
  return out;
}

/**
 * @param {string} role
 */
export function planRoleOrder(role) {
  return ROLE_SORT[role] ?? 99;
}
