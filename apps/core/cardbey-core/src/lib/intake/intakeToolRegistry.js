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

export const EXECUTION_PATHS = new Set(['chat', 'direct_action', 'proactive_plan', 'clarify', 'service_request']);

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
    executionPath: 'kernel_dispatch',
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
    toolName: 'create_campaign',
    executionPath: 'kernel_dispatch',
    label: 'Create Campaign',
    riskLevel: RISK.STATE_CHANGE,
    requiresStore: true,
    approvalRequired: false,
    planRole: PLAN_ROLE.STANDALONE,
    prerequisiteTools: [],
    parameterSchema: {
      properties: {
        campaignContext: { type: 'string' },
        storeId: { type: 'string' },
        hint: { type: 'string' },
        _sourceTool: { type: 'string' },
        _autoSubmit: { type: 'boolean' },
      },
    },
    requiredParams: ['storeId'],
    optionalParams: ['campaignContext', 'hint', '_sourceTool', '_autoSubmit'],
    semanticDescription: `Start structured campaign checkpoint pipeline (research, product selection, creative, launch review).`,
    examples: ['launch a marketing campaign for my store', 'create a promotion campaign'],
  },
  {
    toolName: 'edit_artifact',
    executionPath: 'proactive_plan',
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
    toolName: 'audit_store_completeness',
    executionPath: 'proactive_plan',
    label: 'Audit Store Completeness',
    riskLevel: RISK.SAFE_READ,
    requiresStore: true,
    approvalRequired: false,
    planRole: PLAN_ROLE.STANDALONE,
    prerequisiteTools: [],
    parameterSchema: {
      properties: { storeId: { type: 'string' } },
    },
    requiredParams: [],
    optionalParams: ['storeId'],
    semanticDescription: `Score store profile completeness and list missing fields (phone, hero, products, etc.). Use for fix-issues and checklist requests.`,
    examples: ['fix issues', 'what is missing', 'complete my profile', 'store checklist', 'diagnose store'],
  },
  {
    toolName: 'generate_health_report',
    executionPath: 'proactive_plan',
    label: 'Generate Health Report',
    riskLevel: RISK.SAFE_READ,
    requiresStore: true,
    approvalRequired: false,
    planRole: PLAN_ROLE.FINAL,
    prerequisiteTools: ['audit_store_completeness'],
    parameterSchema: {
      properties: {
        storeId: { type: 'string' },
        audit: { type: 'object' },
      },
    },
    requiredParams: [],
    optionalParams: ['storeId', 'audit'],
    semanticDescription: `Turn completeness audit into prioritised fix delimited by impact.`,
    examples: ['top fixes for my store', 'what should I fix first'],
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
    toolName: 'content_creator',
    executionPath: 'proactive_plan',
    label: 'Content Creator',
    riskLevel: RISK.SAFE_READ,
    requiresStore: true,
    approvalRequired: false,
    planRole: PLAN_ROLE.STANDALONE,
    prerequisiteTools: [],
    parameterSchema: {
      properties: {
        storeId: { type: 'string' },
        goal: { type: 'string' },
      },
    },
    requiredParams: [],
    optionalParams: ['storeId', 'goal'],
    semanticDescription: `Full campaign content plan (social + email). Prefer generate_social_posts for quick social-only requests.`,
    examples: ['content plan for my campaign', 'social and email copy'],
  },
  {
    toolName: 'smart_visual',
    executionPath: 'proactive_plan',
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
    semanticDescription: `Generate AI promotional graphics (image + copy + Content Studio canvas) from a text prompt.`,
    examples: ['generate a visual', 'create a promotion graphic', 'make a promo image for my spring collection'],
  },
  {
    toolName: 'create_promotion_graphic',
    executionPath: 'proactive_plan',
    label: 'Create Promotion Graphic',
    riskLevel: RISK.SAFE_READ,
    requiresStore: true,
    approvalRequired: false,
    planRole: PLAN_ROLE.STANDALONE,
    prerequisiteTools: [],
    parameterSchema: {
      required: ['prompt'],
      properties: {
        storeId: { type: 'string' },
        prompt: { type: 'string' },
        description: { type: 'string' },
        imageDataUrl: { type: 'string' },
        userImageUrl: { type: 'string' },
        skipImage: { type: 'boolean' },
        format: { type: 'string' },
        style: { type: 'string' },
        mood: { type: 'string' },
      },
    },
    requiredParams: ['prompt'],
    optionalParams: ['description', 'format', 'style', 'mood', 'storeId', 'imageDataUrl', 'userImageUrl', 'skipImage'],
    semanticDescription: `One-shot promotional graphic: AI/stock hero image, headline, subheadline, CTA, branded canvas.`,
    examples: ['create a promotion graphic for my spring dresses', 'make a promo poster for the sale'],
  },
  {
    toolName: 'video_generate_multimodal',
    executionPath: 'proactive_plan',
    label: 'Generate Video',
    riskLevel: RISK.SAFE_READ,
    requiresStore: false,
    approvalRequired: false,
    planRole: PLAN_ROLE.STANDALONE,
    prerequisiteTools: [],
    parameterSchema: {
      properties: {
        missionId: { type: 'string' },
      },
    },
    requiredParams: [],
    optionalParams: ['missionId'],
    semanticDescription: `Create a short promo or explainer video, or deliver multimodal video output to the mission console.`,
    examples: ['create a promo video', 'generate a marketing video', 'make a short video ad for my store'],
  },
  // DANH: fix-video-routing
  {
    toolName: 'create_video',
    executionPath: 'proactive_plan',
    label: 'Create Store Video',
    riskLevel: RISK.STATE_CHANGE,
    requiresStore: true,
    approvalRequired: false,
    planRole: PLAN_ROLE.STANDALONE,
    prerequisiteTools: [],
    parameterSchema: {
      properties: {
        storeId: { type: 'string' },
        prompt: { type: 'string' },
        style: { type: 'string' },
        duration: { type: 'number' },
      },
    },
    requiredParams: [],
    optionalParams: ['storeId', 'prompt', 'style', 'duration'],
    semanticDescription: `Generate a promotional video for the store using AI.`,
    examples: [
      'create a video for my store',
      'generate a promotional video',
      'make a store video',
      'product video for my shop',
    ],
  },
  // DANH: skill-round6-document
  {
    toolName: 'ingest_document',
    executionPath: 'proactive_plan',
    label: 'Scan Business Card',
    riskLevel: RISK.STATE_CHANGE,
    requiresStore: true,
    approvalRequired: true,
    planRole: PLAN_ROLE.STANDALONE,
    prerequisiteTools: [],
    parameterSchema: {
      properties: {
        storeId: { type: 'string' },
        imageData: { type: 'string' },
        imageDataUrl: { type: 'string' },
        imageUrl: { type: 'string' },
        confirmed: { type: 'boolean' },
      },
    },
    requiredParams: [],
    optionalParams: ['storeId', 'imageData', 'imageDataUrl', 'imageUrl', 'confirmed'],
    semanticDescription:
      'Scan a business card or product tag image, extract data via OCR, and optionally create a catalog product.',
    examples: [
      'scan this business card',
      'scan card to create product',
      'import product from card photo',
    ],
  },
  {
    toolName: 'ingest_asset_for_intent_detection',
    executionPath: 'direct_action',
    label: 'Analyze Uploaded Asset',
    riskLevel: RISK.SAFE_READ,
    requiresStore: false,
    approvalRequired: false,
    planRole: PLAN_ROLE.STANDALONE,
    prerequisiteTools: [],
    parameterSchema: {
      properties: {
        storeId: { type: 'string' },
        fileAssetId: { type: 'string' },
        mimeType: { type: 'string' },
        filename: { type: 'string' },
        imageDataUrl: { type: 'string' },
        source: { type: 'string' },
        currentEntry: { type: 'string' },
        userPrompt: { type: 'string' },
      },
    },
    requiredParams: [],
    optionalParams: ['storeId', 'fileAssetId', 'mimeType', 'filename', 'imageDataUrl', 'source', 'currentEntry', 'userPrompt'],
    semanticDescription:
      'Classify an uploaded file or image and suggest what the user may want to do — never auto-start store creation.',
    examples: ['(image attached)', '(files attached)'],
  },
  {
    toolName: 'ingest_document',
    executionPath: 'proactive_plan',
    label: 'Ingest Business Document',
    riskLevel: RISK.STATE_CHANGE,
    requiresStore: true,
    approvalRequired: false,
    planRole: PLAN_ROLE.STANDALONE,
    prerequisiteTools: [],
    parameterSchema: {
      properties: {
        storeId: { type: 'string' },
        documentUrl: { type: 'string' },
        documentBase64: { type: 'string' },
        mimeType: { type: 'string' },
        imageUrl: { type: 'string' },
        imageDataUrl: { type: 'string' },
      },
    },
    requiredParams: [],
    optionalParams: ['storeId', 'documentUrl', 'documentBase64', 'mimeType', 'imageUrl', 'imageDataUrl'],
    semanticDescription:
      'Extract products, promotions, and campaign calendar from a flyer, brochure, or document image (URL paste or upload).',
    examples: [
      'here is our flyer',
      'scan this brochure',
      'https://example.com/promo.jpg',
    ],
  },
  {
    toolName: 'scan_document',
    executionPath: 'proactive_plan',
    label: 'Import Business Document',
    riskLevel: RISK.STATE_CHANGE,
    requiresStore: true,
    approvalRequired: false,
    planRole: PLAN_ROLE.STANDALONE,
    prerequisiteTools: [],
    parameterSchema: {
      properties: {
        storeId: { type: 'string' },
        imageUrl: { type: 'string' },
        imageDataUrl: { type: 'string' },
        extractedText: { type: 'string' },
      },
    },
    requiredParams: [],
    optionalParams: ['storeId', 'imageUrl', 'imageDataUrl', 'extractedText'],
    semanticDescription: `Extract products, promotions, and events from an uploaded flyer, brochure, or document image and build catalog + campaign plan.`,
    examples: [
      'scan this flyer',
      'upload my brochure',
      'import products from this document',
      'read this flyer and create promotions',
      'extract data from this PDF image',
    ],
  },
  {
    toolName: 'create_store',
    executionPath: 'proactive_plan',
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
    toolName: 'validate_store_context',
    executionPath: 'proactive_plan',
    label: 'Validate Store Context',
    riskLevel: RISK.SAFE_READ,
    requiresStore: false,
    approvalRequired: false,
    planRole: PLAN_ROLE.FIRST,
    prerequisiteTools: [],
    parameterSchema: {
      properties: {
        storeId: { type: 'string' },
        draftId: { type: 'string' },
        storeName: { type: 'string' },
        location: { type: 'string' },
        storeType: { type: 'string' },
      },
    },
    requiredParams: [],
    optionalParams: ['storeId', 'draftId', 'storeName', 'location', 'storeType'],
    semanticDescription: `Validate store or draft context before catalog or build steps.`,
    examples: ['validate store context'],
  },
  {
    toolName: 'capture_requirements',
    executionPath: 'proactive_plan',
    label: 'Capture Requirements',
    riskLevel: RISK.SAFE_READ,
    requiresStore: false,
    approvalRequired: false,
    planRole: PLAN_ROLE.MIDDLE,
    prerequisiteTools: [],
    parameterSchema: { properties: {} },
    requiredParams: [],
    optionalParams: [],
    semanticDescription: `Checkpoint: capture optional special requirements during store build.`,
    examples: ['add special requirements'],
  },
  {
    toolName: 'structured_store_build',
    executionPath: 'proactive_plan',
    label: 'Build Store Preview',
    riskLevel: RISK.STATE_CHANGE,
    requiresStore: false,
    approvalRequired: false,
    planRole: PLAN_ROLE.MIDDLE,
    prerequisiteTools: [],
    parameterSchema: {
      properties: {
        storeName: { type: 'string' },
        location: { type: 'string' },
        storeType: { type: 'string' },
        intentMode: { type: 'string' },
      },
    },
    requiredParams: [],
    optionalParams: ['storeName', 'location', 'storeType', 'intentMode'],
    semanticDescription: `Generate structured store preview / draft from captured business details.`,
    examples: ['build store preview'],
  },
  {
    toolName: 'prepare_catalog',
    executionPath: 'proactive_plan',
    label: 'Prepare Catalog',
    riskLevel: RISK.SAFE_READ,
    requiresStore: true,
    approvalRequired: false,
    planRole: PLAN_ROLE.FIRST,
    prerequisiteTools: ['validate_store_context'],
    parameterSchema: {
      properties: { storeId: { type: 'string' }, draftId: { type: 'string' } },
    },
    requiredParams: [],
    optionalParams: ['storeId', 'draftId'],
    semanticDescription: `Prepare catalog context before adding products.`,
    examples: ['prepare catalog'],
  },
  {
    toolName: 'validate_products',
    executionPath: 'proactive_plan',
    label: 'Validate Products',
    riskLevel: RISK.SAFE_READ,
    requiresStore: true,
    approvalRequired: false,
    planRole: PLAN_ROLE.MIDDLE,
    prerequisiteTools: [],
    parameterSchema: {
      properties: { storeId: { type: 'string' }, draftId: { type: 'string' } },
    },
    requiredParams: [],
    optionalParams: ['storeId', 'draftId'],
    semanticDescription: `Validate product rows before catalog finalize.`,
    examples: ['validate products'],
  },
  {
    toolName: 'finalize_catalog',
    executionPath: 'proactive_plan',
    label: 'Finalize Catalog',
    riskLevel: RISK.STATE_CHANGE,
    requiresStore: true,
    approvalRequired: false,
    planRole: PLAN_ROLE.FINAL,
    prerequisiteTools: [],
    parameterSchema: {
      properties: { storeId: { type: 'string' }, draftId: { type: 'string' } },
    },
    requiredParams: [],
    optionalParams: ['storeId', 'draftId'],
    semanticDescription: `Finalize catalog when products are ready.`,
    examples: ['finalize catalog'],
  },
  {
    toolName: 'upload_store_asset',
    executionPath: 'proactive_plan',
    label: 'Upload Store Asset',
    riskLevel: RISK.STATE_CHANGE,
    requiresStore: true,
    approvalRequired: false,
    planRole: PLAN_ROLE.STANDALONE,
    prerequisiteTools: [],
    parameterSchema: {
      properties: {
        assetType: { type: 'string' },
        generationRunId: { type: 'string' },
        storeId: { type: 'string' },
      },
    },
    requiredParams: [],
    optionalParams: ['assetType', 'generationRunId', 'storeId'],
    semanticDescription:
      'Upload a logo, avatar, or hero image to the store. Use when user wants to upload their own logo or brand image.',
    examples: ['upload my logo', 'add my store logo', 'upload a logo for my store', 'set my brand image'],
  },
  {
    toolName: 'replace_store_catalog',
    executionPath: 'proactive_plan',
    label: 'Replace Store Catalog',
    riskLevel: RISK.STATE_CHANGE,
    requiresStore: true,
    approvalRequired: false,
    planRole: PLAN_ROLE.STANDALONE,
    prerequisiteTools: [],
    parameterSchema: {
      properties: {
        generationRunId: { type: 'string' },
        storeId: { type: 'string' },
      },
    },
    requiredParams: [],
    optionalParams: ['generationRunId', 'storeId'],
    semanticDescription:
      'Replace the store product catalog with real menu items uploaded by the user. Use when user wants to add their real products, menu, or items.',
    examples: ['add my real products', 'replace with my menu', 'upload my menu', 'add real items to my store'],
  },
  {
    toolName: 'update_store_hero',
    executionPath: 'proactive_plan',
    label: 'Update Store Hero Image',
    riskLevel: RISK.STATE_CHANGE,
    requiresStore: true,
    approvalRequired: false,
    planRole: PLAN_ROLE.STANDALONE,
    prerequisiteTools: [],
    parameterSchema: {
      properties: {
        generationRunId: { type: 'string' },
        storeId: { type: 'string' },
        imageQuery: { type: 'string' },
        focus: { type: 'string' },
      },
    },
    requiredParams: [],
    optionalParams: ['generationRunId', 'storeId', 'imageQuery', 'focus'],
    semanticDescription:
      'Change or customize the store hero banner image. Use when user wants to change the main hero photo or banner.',
    examples: ['customize hero image', 'change my banner', 'update hero photo', 'change the main store image'],
  },
  {
    toolName: 'setBusinessSocialLinks',
    executionPath: 'proactive_plan',
    label: 'Set Business Social Links',
    riskLevel: RISK.STATE_CHANGE,
    requiresStore: true,
    approvalRequired: false,
    planRole: PLAN_ROLE.STANDALONE,
    prerequisiteTools: [],
    parameterSchema: {
      properties: {
        storeId: { type: 'string' },
        socialLinks: {
          type: 'object',
          properties: {
            instagram: { type: 'string', description: 'Full Instagram profile URL' },
            facebook: { type: 'string', description: 'Full Facebook page URL' },
            tiktok: { type: 'string', description: 'Full TikTok profile URL' },
            x: { type: 'string', description: 'Full X (Twitter) profile URL' },
            youtube: { type: 'string', description: 'Full YouTube channel URL' },
            linkedin: { type: 'string', description: 'Full LinkedIn company page URL' },
            whatsapp: { type: 'string', description: 'WhatsApp link (wa.me format)' },
          },
        },
      },
    },
    requiredParams: ['storeId'],
    optionalParams: ['socialLinks'],
    semanticDescription: `Set or update social network profile links for a business store.
Only provide networks explicitly mentioned by the user — use full https URLs.
Do not invent social URLs; ask the user if unsure.`,
    examples: [
      'add my Instagram https://instagram.com/mchairsalon',
      'set our Facebook and WhatsApp links',
      'update social accounts for my store',
    ],
  },
  {
    toolName: 'update_brand_kit',
    executionPath: 'proactive_plan',
    label: 'Update Brand Kit',
    riskLevel: RISK.STATE_CHANGE,
    requiresStore: true,
    approvalRequired: false,
    planRole: PLAN_ROLE.STANDALONE,
    prerequisiteTools: [],
    parameterSchema: {
      properties: {
        storeId: { type: 'string' },
        tone: { type: 'string' },
        style: { type: 'string' },
        colors: { type: 'array', items: { type: 'string' } },
      },
    },
    requiredParams: ['storeId'],
    optionalParams: ['tone', 'style', 'colors'],
    semanticDescription: `Update the store's brand kit including tone, style, and color palette. Use when the user describes their brand personality, preferred colors, or visual style.`,
    examples: [
      'our brand is luxury with pink and gold',
      'make the style modern and minimal',
      'use warm friendly colors for my cafe',
    ],
  },
  {
    toolName: 'search_hero_media',
    executionPath: 'proactive_plan',
    label: 'Search Hero Media',
    riskLevel: RISK.SAFE_READ,
    requiresStore: false,
    approvalRequired: false,
    planRole: PLAN_ROLE.STANDALONE,
    prerequisiteTools: [],
    parameterSchema: {
      properties: {
        query: { type: 'string' },
        mediaType: { type: 'string' },
        storeId: { type: 'string' },
        perPage: { type: 'number' },
      },
    },
    requiredParams: ['query'],
    optionalParams: ['mediaType', 'storeId', 'perPage'],
    semanticDescription: `Search for hero images or videos across Pexels, Coverr, Pixabay, and Mixkit. Use when the user wants stock media for their store hero section.`,
    examples: [
      'find a hero video for my cafe',
      'search background video for my bakery',
      'look for stock footage for restaurant hero',
    ],
  },
  {
    toolName: 'create_campaign_brief',
    executionPath: 'proactive_plan',
    label: 'Create Campaign Brief',
    riskLevel: RISK.SAFE_READ,
    requiresStore: false,
    approvalRequired: false,
    planRole: PLAN_ROLE.STANDALONE,
    prerequisiteTools: [],
    parameterSchema: {
      properties: {
        storeId: { type: 'string' },
        objective: { type: 'string' },
        targetAudience: { type: 'string' },
        offer: { type: 'string' },
        duration: { type: 'string' },
        tone: { type: 'string' },
      },
    },
    requiredParams: [],
    optionalParams: ['storeId', 'objective', 'targetAudience', 'offer', 'duration', 'tone'],
    semanticDescription: `Define structured campaign intent including objective, audience, offer, duration, and tone.`,
    examples: [
      'run a 20% off promotion for local customers',
      'create a campaign brief for my summer sale',
      'promote my new menu to families',
    ],
  },
  {
    toolName: 'generate_campaign_graphics',
    executionPath: 'proactive_plan',
    label: 'Generate Campaign Graphics',
    riskLevel: RISK.SAFE_READ,
    requiresStore: false,
    approvalRequired: false,
    planRole: PLAN_ROLE.STANDALONE,
    prerequisiteTools: [],
    parameterSchema: {
      properties: {
        storeId: { type: 'string' },
        brief: { type: 'object' },
        style: { type: 'string' },
        mediaType: { type: 'string' },
      },
    },
    requiredParams: [],
    optionalParams: ['storeId', 'brief', 'style', 'mediaType'],
    semanticDescription: `Find stock images or videos matched to a campaign brief.`,
    examples: ['find images for my sale campaign', 'get promo graphics for my cafe'],
  },
  {
    toolName: 'generate_campaign_copy',
    executionPath: 'proactive_plan',
    label: 'Generate Campaign Copy',
    riskLevel: RISK.SAFE_READ,
    requiresStore: false,
    approvalRequired: false,
    planRole: PLAN_ROLE.STANDALONE,
    prerequisiteTools: [],
    parameterSchema: {
      properties: {
        storeId: { type: 'string' },
        brief: { type: 'object' },
        tone: { type: 'string' },
        platforms: { type: 'array', items: { type: 'string' } },
      },
    },
    requiredParams: [],
    optionalParams: ['storeId', 'brief', 'tone', 'platforms'],
    semanticDescription: `Write headlines, captions, CTAs, and platform-specific variants for a campaign.`,
    examples: [
      'write Instagram copy for my promotion',
      'create social captions for my sale',
    ],
  },
  {
    toolName: 'qa_campaign_package',
    executionPath: 'proactive_plan',
    label: 'QA Campaign Package',
    riskLevel: RISK.SAFE_READ,
    requiresStore: false,
    approvalRequired: false,
    planRole: PLAN_ROLE.STANDALONE,
    prerequisiteTools: [],
    parameterSchema: {
      properties: {
        brief: { type: 'object' },
        graphics: { type: 'array' },
        copy: { type: 'object' },
      },
    },
    requiredParams: [],
    optionalParams: ['brief', 'graphics', 'copy'],
    semanticDescription: `Validate that a campaign brief, graphics, and copy are complete before packaging.`,
    examples: ['check my campaign is ready to publish', 'validate campaign package'],
  },
  {
    toolName: 'package_campaign_artifact',
    executionPath: 'proactive_plan',
    label: 'Package Campaign Artifact',
    riskLevel: RISK.STATE_CHANGE,
    requiresStore: false,
    approvalRequired: false,
    planRole: PLAN_ROLE.STANDALONE,
    prerequisiteTools: [],
    parameterSchema: {
      properties: {
        storeId: { type: 'string' },
        brief: { type: 'object' },
        graphics: { type: 'array' },
        copy: { type: 'object' },
        slideshowId: { type: 'string' },
      },
    },
    requiredParams: [],
    optionalParams: ['storeId', 'brief', 'graphics', 'copy', 'slideshowId'],
    semanticDescription: `Bundle brief, graphics, copy, and optional slideshow into a publishable campaign artifact.`,
    examples: ['package my campaign for publishing', 'create campaign artifact from my brief'],
  },
  {
    toolName: 'select_display_content',
    executionPath: 'proactive_plan',
    label: 'Select Display Content',
    riskLevel: RISK.SAFE_READ,
    requiresStore: false,
    approvalRequired: false,
    planRole: PLAN_ROLE.STANDALONE,
    prerequisiteTools: [],
    parameterSchema: {
      properties: {
        storeId: { type: 'string' },
        contentType: { type: 'string' },
        artifactId: { type: 'string' },
        campaignId: { type: 'string' },
      },
    },
    requiredParams: [],
    optionalParams: ['storeId', 'contentType', 'artifactId', 'campaignId'],
    semanticDescription: `Choose campaign artifact, hero, slideshow, or product content to show on in-store displays.`,
    examples: [
      'show my campaign on the store screen',
      'display my hero on the TV',
      'push slideshow to display',
    ],
  },
  {
    toolName: 'format_for_display',
    executionPath: 'proactive_plan',
    label: 'Format For Display',
    riskLevel: RISK.SAFE_READ,
    requiresStore: false,
    approvalRequired: false,
    planRole: PLAN_ROLE.STANDALONE,
    prerequisiteTools: [],
    parameterSchema: {
      properties: {
        content: { type: 'object' },
        displayProfile: { type: 'object' },
      },
    },
    requiredParams: [],
    optionalParams: ['content', 'displayProfile'],
    semanticDescription: `Adapt content to screen resolution, slide duration, loop, and transition settings.`,
    examples: ['format my campaign for the TV screen', 'set display to 9:16 portrait mode'],
  },
  {
    toolName: 'push_to_display_device',
    executionPath: 'proactive_plan',
    label: 'Push To Display Device',
    riskLevel: RISK.STATE_CHANGE,
    requiresStore: false,
    approvalRequired: false,
    planRole: PLAN_ROLE.STANDALONE,
    prerequisiteTools: [],
    parameterSchema: {
      properties: {
        deviceId: { type: 'string' },
        storeId: { type: 'string' },
        formatted: { type: 'object' },
      },
    },
    requiredParams: [],
    optionalParams: ['deviceId', 'storeId', 'formatted'],
    semanticDescription: `Send formatted content to a paired in-store display screen or digital signage device.`,
    examples: [
      'push to my store screen',
      'update the display with my promotion',
      'send content to paired TV',
    ],
  },
  {
    toolName: 'verify_display_output',
    executionPath: 'proactive_plan',
    label: 'Verify Display Output',
    riskLevel: RISK.SAFE_READ,
    requiresStore: false,
    approvalRequired: false,
    planRole: PLAN_ROLE.STANDALONE,
    prerequisiteTools: [],
    parameterSchema: {
      properties: {
        deviceId: { type: 'string' },
        contentId: { type: 'string' },
        pushResult: { type: 'object' },
      },
    },
    requiredParams: [],
    optionalParams: ['deviceId', 'contentId', 'pushResult'],
    semanticDescription: `Confirm a display device received content and is playing it correctly.`,
    examples: ['check if my screen is playing the campaign', 'verify display is working'],
  },
  {
    toolName: 'analyze_offer_performance',
    executionPath: 'proactive_plan',
    label: 'Analyze Offer Performance',
    riskLevel: RISK.SAFE_READ,
    requiresStore: false,
    approvalRequired: false,
    planRole: PLAN_ROLE.STANDALONE,
    prerequisiteTools: [],
    parameterSchema: {
      properties: {
        storeId: { type: 'string' },
        offerId: { type: 'string' },
        campaignId: { type: 'string' },
        lookbackDays: { type: 'number' },
      },
    },
    requiredParams: [],
    optionalParams: ['storeId', 'offerId', 'campaignId', 'lookbackDays'],
    semanticDescription: `Analyze how a current offer or promotion is performing and identify weak points.`,
    examples: [
      'how is my promotion performing',
      'analyze my offer results',
      'check campaign performance last week',
    ],
  },
  {
    toolName: 'suggest_offer_improvements',
    executionPath: 'proactive_plan',
    label: 'Suggest Offer Improvements',
    riskLevel: RISK.SAFE_READ,
    requiresStore: false,
    approvalRequired: false,
    planRole: PLAN_ROLE.STANDALONE,
    prerequisiteTools: [],
    parameterSchema: {
      properties: {
        storeId: { type: 'string' },
        analysis: { type: 'object' },
        tone: { type: 'string' },
        brandKit: { type: 'object' },
      },
    },
    requiredParams: [],
    optionalParams: ['storeId', 'analysis', 'tone', 'brandKit'],
    semanticDescription: `Generate ranked suggestions to improve offer copy, timing, audience, discount, or media.`,
    examples: [
      'suggest ways to improve my promotion',
      'how can I boost my offer',
      'recommend campaign improvements',
    ],
  },
  {
    toolName: 'apply_offer_optimization',
    executionPath: 'proactive_plan',
    label: 'Apply Offer Optimization',
    riskLevel: RISK.STATE_CHANGE,
    requiresStore: false,
    approvalRequired: true,
    planRole: PLAN_ROLE.STANDALONE,
    prerequisiteTools: [],
    parameterSchema: {
      properties: {
        storeId: { type: 'string' },
        offerId: { type: 'string' },
        suggestion: { type: 'object' },
        confirmed: { type: 'boolean' },
      },
    },
    requiredParams: [],
    optionalParams: ['storeId', 'offerId', 'suggestion', 'confirmed'],
    semanticDescription: `Apply a selected optimization suggestion to an offer after user confirmation.`,
    examples: [
      'apply the top suggestion to my offer',
      'optimize my promotion with the recommended change',
    ],
  },
  {
    toolName: 'track_offer_outcome',
    executionPath: 'proactive_plan',
    label: 'Track Offer Outcome',
    riskLevel: RISK.SAFE_READ,
    requiresStore: false,
    approvalRequired: false,
    planRole: PLAN_ROLE.STANDALONE,
    prerequisiteTools: [],
    parameterSchema: {
      properties: {
        storeId: { type: 'string' },
        offerId: { type: 'string' },
        optimizationId: { type: 'string' },
        baselineMetrics: { type: 'object' },
        suggestion: { type: 'object' },
      },
    },
    requiredParams: [],
    optionalParams: ['storeId', 'offerId', 'optimizationId', 'baselineMetrics', 'suggestion'],
    semanticDescription: `Record optimization baseline metrics and schedule the next performance review.`,
    examples: [
      'track my offer optimization results',
      'record baseline for my promotion change',
    ],
  },
  {
    toolName: 'audit_local_presence',
    executionPath: 'proactive_plan',
    label: 'Audit Local Presence',
    riskLevel: RISK.SAFE_READ,
    requiresStore: false,
    approvalRequired: false,
    planRole: PLAN_ROLE.STANDALONE,
    prerequisiteTools: [],
    parameterSchema: {
      properties: {
        storeId: { type: 'string' },
        includeCompetitors: { type: 'boolean' },
      },
    },
    requiredParams: [],
    optionalParams: ['storeId', 'includeCompetitors'],
    semanticDescription: `Assess local visibility gaps across profile, content, offers, social links, and displays.`,
    examples: [
      'audit my local presence',
      'how visible is my store locally',
      'check my business growth gaps',
    ],
  },
  {
    toolName: 'generate_growth_plan',
    executionPath: 'proactive_plan',
    label: 'Generate Growth Plan',
    riskLevel: RISK.SAFE_READ,
    requiresStore: false,
    approvalRequired: false,
    planRole: PLAN_ROLE.STANDALONE,
    prerequisiteTools: [],
    parameterSchema: {
      properties: {
        storeId: { type: 'string' },
        audit: { type: 'object' },
        businessType: { type: 'string' },
        goals: { type: 'array', items: { type: 'string' } },
      },
    },
    requiredParams: [],
    optionalParams: ['storeId', 'audit', 'businessType', 'goals'],
    semanticDescription: `Generate ranked local growth actions from a presence audit.`,
    examples: [
      'what should I do to grow locally',
      'create a growth plan for my store',
      'recommend actions to get more customers',
    ],
  },
  {
    toolName: 'monitor_growth_baseline',
    executionPath: 'proactive_plan',
    label: 'Monitor Growth Baseline',
    riskLevel: RISK.SAFE_READ,
    requiresStore: false,
    approvalRequired: false,
    planRole: PLAN_ROLE.STANDALONE,
    prerequisiteTools: [],
    parameterSchema: {
      properties: {
        storeId: { type: 'string' },
        audit: { type: 'object' },
        planId: { type: 'string' },
        actionTaken: { type: 'string' },
      },
    },
    requiredParams: [],
    optionalParams: ['storeId', 'audit', 'planId', 'actionTaken'],
    semanticDescription: `Record growth audit baseline scores and schedule the next local review.`,
    examples: [
      'track my growth baseline',
      'record my local presence scores',
    ],
  },
  {
    toolName: 'check_booking_availability',
    executionPath: 'proactive_plan',
    label: 'Check Booking Availability',
    riskLevel: RISK.SAFE_READ,
    requiresStore: false,
    approvalRequired: false,
    planRole: PLAN_ROLE.STANDALONE,
    prerequisiteTools: [],
    parameterSchema: {
      properties: {
        storeId: { type: 'string' },
        serviceType: { type: 'string' },
        date: { type: 'string' },
        duration: { type: 'number' },
        partySize: { type: 'number' },
      },
    },
    requiredParams: [],
    optionalParams: ['storeId', 'serviceType', 'date', 'duration', 'partySize'],
    semanticDescription: `Find open appointment or reservation slots for a store on a given date.`,
    examples: [
      'check availability for tomorrow',
      'what slots are open on Friday',
      'show available appointment times',
    ],
  },
  {
    toolName: 'create_booking_record',
    executionPath: 'proactive_plan',
    label: 'Create Booking Record',
    riskLevel: RISK.STATE_CHANGE,
    requiresStore: false,
    approvalRequired: false,
    planRole: PLAN_ROLE.STANDALONE,
    prerequisiteTools: [],
    parameterSchema: {
      properties: {
        storeId: { type: 'string' },
        slotId: { type: 'string' },
        customerName: { type: 'string' },
        customerPhone: { type: 'string' },
        customerEmail: { type: 'string' },
        serviceType: { type: 'string' },
        notes: { type: 'string' },
      },
    },
    requiredParams: ['customerName'],
    optionalParams: [
      'storeId',
      'slotId',
      'customerPhone',
      'customerEmail',
      'serviceType',
      'notes',
    ],
    semanticDescription: `Reserve an available slot and create a confirmed booking for a customer.`,
    examples: [
      'book an appointment for Jane at 2pm',
      'create a booking for a haircut',
      'reserve a table for 4',
    ],
  },
  {
    toolName: 'confirm_booking_customer',
    executionPath: 'proactive_plan',
    label: 'Confirm Booking Customer',
    riskLevel: RISK.SAFE_READ,
    requiresStore: false,
    approvalRequired: false,
    planRole: PLAN_ROLE.STANDALONE,
    prerequisiteTools: [],
    parameterSchema: {
      properties: {
        booking: { type: 'object' },
        channel: { type: 'string' },
      },
    },
    requiredParams: ['booking'],
    optionalParams: ['channel'],
    semanticDescription: `Send a booking confirmation message to the customer via WhatsApp, email, or SMS.`,
    examples: [
      'send booking confirmation to customer',
      'confirm appointment via WhatsApp',
    ],
  },
  {
    toolName: 'schedule_booking_reminder',
    executionPath: 'proactive_plan',
    label: 'Schedule Booking Reminder',
    riskLevel: RISK.SAFE_READ,
    requiresStore: false,
    approvalRequired: false,
    planRole: PLAN_ROLE.STANDALONE,
    prerequisiteTools: [],
    parameterSchema: {
      properties: {
        booking: { type: 'object' },
        reminderLeadHours: { type: 'number' },
      },
    },
    requiredParams: ['booking'],
    optionalParams: ['reminderLeadHours'],
    semanticDescription: `Schedule a reminder notification before the customer's appointment.`,
    examples: [
      'send a reminder 24 hours before the booking',
      'schedule appointment reminder',
    ],
  },
  {
    toolName: 'handle_booking_outcome',
    executionPath: 'proactive_plan',
    label: 'Handle Booking Outcome',
    riskLevel: RISK.STATE_CHANGE,
    requiresStore: false,
    approvalRequired: false,
    planRole: PLAN_ROLE.STANDALONE,
    prerequisiteTools: [],
    parameterSchema: {
      properties: {
        bookingId: { type: 'string' },
        outcome: { type: 'string' },
        reason: { type: 'string' },
        refund: { type: 'boolean' },
      },
    },
    requiredParams: ['outcome'],
    optionalParams: ['bookingId', 'reason', 'refund'],
    semanticDescription: `Mark a booking as completed, cancelled, or no-show and trigger follow-up actions.`,
    examples: [
      'mark booking as completed',
      'customer cancelled the appointment',
      'record a no-show',
    ],
  },
  {
    toolName: 'publish_store',
    executionPath: 'proactive_plan',
    label: 'Publish Store',
    riskLevel: RISK.STATE_CHANGE,
    requiresStore: true,
    approvalRequired: false,
    planRole: PLAN_ROLE.STANDALONE,
    prerequisiteTools: [],
    parameterSchema: {
      properties: {
        generationRunId: { type: 'string' },
        storeId: { type: 'string' },
      },
    },
    requiredParams: [],
    optionalParams: ['generationRunId', 'storeId'],
    semanticDescription: `Publish a mini website or store to make it publicly live on the internet.
Use when the user wants to publish, go live, launch their store, make it public,
or share their website with customers.`,
    examples: [
      'publish my store',
      'make my store live',
      'go live',
      'launch my website',
      'publish my mini website',
      'I want to publish',
    ],
  },
  {
    toolName: 'activate_campaigns',
    executionPath: 'proactive_plan',
    label: 'Activate Campaigns',
    riskLevel: RISK.STATE_CHANGE,
    requiresStore: true,
    approvalRequired: true,
    planRole: PLAN_ROLE.STANDALONE,
    prerequisiteTools: [],
    parameterSchema: {
      properties: {
        storeId: { type: 'string' },
      },
    },
    requiredParams: ['storeId'],
    optionalParams: [],
    semanticDescription: `Activate draft store promotions created from document ingestion or campaign planning.`,
    examples: [
      'activate campaigns',
      'launch campaigns',
      'go live with campaigns',
      'make my promos active',
    ],
  },
  {
    toolName: 'code_fix',
    executionPath: 'proactive_plan',
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
    executionPath: 'proactive_plan',
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
  // DANH: skill-runtime-phase7
  {
    toolName: 'get_store_analytics',
    executionPath: 'proactive_plan',
    label: 'Store Performance Analytics',
    riskLevel: RISK.SAFE_READ,
    requiresStore: true,
    approvalRequired: false,
    planRole: PLAN_ROLE.STANDALONE,
    prerequisiteTools: [],
    parameterSchema: {
      properties: {
        storeId: { type: 'string' },
      },
    },
    requiredParams: [],
    optionalParams: ['storeId'],
    semanticDescription: `Retrieve store performance metrics — bookings, products, active promotions, and days since last update.`,
    examples: [
      'how is my store performing',
      'show store stats',
      'store performance overview',
      'how is my store doing',
    ],
  },
  // DANH: review-routing-fix
  {
    toolName: 'get_review_summary',
    executionPath: 'proactive_plan',
    label: 'Review Summary',
    riskLevel: RISK.SAFE_READ,
    requiresStore: true,
    approvalRequired: false,
    planRole: PLAN_ROLE.STANDALONE,
    prerequisiteTools: [],
    parameterSchema: {
      properties: {
        storeId: { type: 'string' },
      },
    },
    requiredParams: [],
    optionalParams: ['storeId'],
    semanticDescription: `Fetch customer reviews summary, ratings, and feedback. Use when owner asks about reviews or wants to respond — NOT for store performance metrics (get_store_analytics) or health audit (analyze_store).`,
    examples: [
      'show me my reviews',
      'what are customers saying',
      'customer feedback summary',
      'respond to my latest review',
    ],
  },
  // DANH: skill-round4-loyalty
  {
    toolName: 'setup_loyalty_program',
    executionPath: 'proactive_plan',
    label: 'Setup Loyalty Program',
    riskLevel: RISK.STATE_CHANGE,
    requiresStore: true,
    approvalRequired: false,
    planRole: PLAN_ROLE.STANDALONE,
    prerequisiteTools: [],
    parameterSchema: {
      properties: {
        storeId: { type: 'string' },
      },
    },
    requiredParams: [],
    optionalParams: ['storeId'],
    semanticDescription: `Set up a loyalty or rewards program for repeat customers — tiers, points, and member perks.`,
    examples: [
      'setup a loyalty program',
      'create a rewards program',
      'loyalty tiers for repeat customers',
      'points program for members',
    ],
  },
  {
    toolName: 'device.sendInput',
    executionPath: 'proactive_plan',
    label: 'Device Control',
    riskLevel: RISK.STATE_CHANGE,
    requiresStore: false,
    approvalRequired: true,
    planRole: PLAN_ROLE.STANDALONE,
    prerequisiteTools: [],
    parameterSchema: {
      required: ['task'],
      properties: {
        task: { type: 'string' },
      },
    },
    requiredParams: ['task'],
    optionalParams: [],
    semanticDescription: `Control the user's local computer via SuperCopilot (open apps, type text, click UI). Not for C-Net TV/screens listing.`,
    examples: [
      'use device control to open Notepad',
      'open notepad on my computer',
      'type hello in notepad',
      'click save on my screen',
    ],
  },
  {
    toolName: 'signage.list-devices',
    executionPath: 'proactive_plan',
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
    executionPath: 'proactive_plan',
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
    executionPath: 'proactive_plan',
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
    executionPath: 'proactive_plan',
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
    toolName: 'service_request',
    executionPath: 'service_request',
    label: 'Local service request',
    riskLevel: RISK.SAFE_READ,
    requiresStore: false,
    approvalRequired: false,
    planRole: PLAN_ROLE.STANDALONE,
    prerequisiteTools: [],
    parameterSchema: {
      properties: {
        serviceType: { type: 'string' },
        location: { type: 'string' },
        timeWindow: { type: 'string' },
        budget: { type: 'string' },
      },
    },
    requiredParams: [],
    optionalParams: ['serviceType', 'location', 'timeWindow', 'budget'],
    semanticDescription: `User wants to book, find, or hire a local service provider (hair, nails, massage, barber, physio, cleaning, etc.). Capture preferences and search for providers in Cardbey — do not refuse as "business only".`,
    examples: [
      'help me book a haircut this Sunday',
      'find a nail salon near me',
      'book a massage for tomorrow',
      'help me to book a hair cut',
    ],
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
    toolName: 'generate_poster',
    executionPath: 'proactive_plan',
    label: 'Generate poster',
    riskLevel: RISK.STATE_CHANGE,
    requiresStore: true,
    approvalRequired: false,
    planRole: PLAN_ROLE.STANDALONE,
    prerequisiteTools: [],
    parameterSchema: {
      properties: {
        storeId: { type: 'string' },
        posterType: { type: 'string' },
        customTitle: { type: 'string' },
        customSubtitle: { type: 'string' },
        highlightItems: { type: 'array', items: {} },
        colorScheme: { type: 'object' },
      },
    },
    requiredParams: ['storeId'],
    optionalParams: ['posterType', 'customTitle', 'customSubtitle', 'highlightItems', 'colorScheme'],
    semanticDescription: `Create a promotional poster or flyer for the active store using catalog items, hero image, and vertical-aware templates.`,
    examples: [
      'create a promotional poster for my store',
      'make a flyer for instagram',
      'design a marketing poster',
    ],
  },
  {
    toolName: 'mutate_poster',
    executionPath: 'proactive_plan',
    label: 'Edit poster',
    riskLevel: RISK.STATE_CHANGE,
    requiresStore: false,
    approvalRequired: false,
    planRole: PLAN_ROLE.STANDALONE,
    prerequisiteTools: [],
    parameterSchema: {
      properties: {
        posterId: { type: 'string' },
        instruction: { type: 'string' },
        currentElements: { type: 'array', items: {} },
      },
    },
    requiredParams: ['instruction', 'currentElements'],
    optionalParams: ['posterId'],
    semanticDescription: `Edit a poster already shown in chat — change title, swap images, adjust colors or font size.`,
    examples: [
      'change the title to MC Hair Salon Melbourne',
      'swap the background image',
      'make the title bigger',
    ],
  },
  {
    toolName: 'canvas.loadTemplate',
    executionPath: 'proactive_plan',
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
    executionPath: 'proactive_plan',
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
    executionPath: 'proactive_plan',
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
  {
    toolName: 'scanHardcodedStrings',
    executionPath: 'proactive_plan',
    label: 'Scan hardcoded strings',
    riskLevel: RISK.SAFE_READ,
    requiresStore: false,
    approvalRequired: false,
    planRole: PLAN_ROLE.STANDALONE,
    prerequisiteTools: [],
    category: 'i18n',
    intentKeywords: ['scan', 'i18n', 'hardcoded', 'translation', 'audit'],
    parameterSchema: {
      properties: {
        filePath: { type: 'string' },
      },
    },
    requiredParams: ['filePath'],
    optionalParams: [],
    semanticDescription:
      'Scan a source file for hardcoded user-facing strings that bypass the i18n translation system',
    examples: ['scan this file for hardcoded strings', 'audit i18n in StoreBookingSteps.tsx'],
  },
  {
    toolName: 'checkI18nKey',
    executionPath: 'proactive_plan',
    label: 'Check i18n key',
    riskLevel: RISK.SAFE_READ,
    requiresStore: false,
    approvalRequired: false,
    planRole: PLAN_ROLE.STANDALONE,
    prerequisiteTools: [],
    category: 'i18n',
    intentKeywords: ['check', 'key', 'translation', 'exists'],
    parameterSchema: {
      properties: {
        key: { type: 'string' },
        locale: { type: 'string' },
      },
    },
    requiredParams: ['key'],
    optionalParams: ['locale'],
    semanticDescription: 'Check if a translation key exists in i18n.js for a given locale',
    examples: ['check if booking.summary exists', 'does common.bookNow exist in Vietnamese'],
  },
  {
    toolName: 'addI18nKey',
    executionPath: 'proactive_plan',
    label: 'Add i18n key',
    riskLevel: RISK.STATE_CHANGE,
    requiresStore: false,
    approvalRequired: false,
    planRole: PLAN_ROLE.STANDALONE,
    prerequisiteTools: [],
    category: 'i18n',
    intentKeywords: ['add', 'key', 'translation', 'locale'],
    parameterSchema: {
      properties: {
        namespace: { type: 'string' },
        key: { type: 'string' },
        translations: { type: 'object' },
      },
    },
    requiredParams: ['namespace', 'key', 'translations'],
    optionalParams: [],
    semanticDescription: 'Add translation key with values for all active locales to i18n.js',
    examples: ['add booking.summary key for en and vi', 'insert common.back translation'],
  },
  {
    toolName: 'wireI18nString',
    executionPath: 'proactive_plan',
    label: 'Wire i18n string',
    riskLevel: RISK.STATE_CHANGE,
    requiresStore: false,
    approvalRequired: false,
    planRole: PLAN_ROLE.STANDALONE,
    prerequisiteTools: [],
    category: 'i18n',
    intentKeywords: ['wire', 'fix', 'replace', 'translation'],
    parameterSchema: {
      properties: {
        filePath: { type: 'string' },
        originalString: { type: 'string' },
        i18nKey: { type: 'string' },
        namespace: { type: 'string' },
        type: { type: 'string' },
      },
    },
    requiredParams: ['filePath', 'originalString', 'i18nKey'],
    optionalParams: ['namespace', 'type'],
    semanticDescription: 'Replace hardcoded string in a component with t() translation call',
    examples: ['wire Book now to common.bookNow', 'replace hardcoded label with t() call'],
  },
  {
    toolName: 'generateI18nKey',
    executionPath: 'proactive_plan',
    label: 'Generate i18n key',
    riskLevel: RISK.SAFE_READ,
    requiresStore: false,
    approvalRequired: false,
    planRole: PLAN_ROLE.STANDALONE,
    prerequisiteTools: [],
    category: 'i18n',
    intentKeywords: ['generate', 'key', 'namespace', 'camelcase'],
    parameterSchema: {
      properties: {
        value: { type: 'string' },
        namespace: { type: 'string' },
        filePath: { type: 'string' },
      },
    },
    requiredParams: ['value'],
    optionalParams: ['namespace', 'filePath'],
    semanticDescription: 'Derive camelCase key name and namespace from string value and file path',
    examples: ['generate key for Book now in booking flow', 'suggest namespace for this label'],
  },
  {
    toolName: 'translateString',
    executionPath: 'proactive_plan',
    label: 'Translate string',
    riskLevel: RISK.SAFE_READ,
    requiresStore: false,
    approvalRequired: false,
    planRole: PLAN_ROLE.STANDALONE,
    prerequisiteTools: [],
    category: 'i18n',
    intentKeywords: ['translate', 'language', 'localize', 'vietnamese', 'i18n'],
    parameterSchema: {
      properties: {
        value: { type: 'string' },
        targetLocales: { type: 'array' },
        context: { type: 'string' },
      },
    },
    requiredParams: ['value', 'targetLocales'],
    optionalParams: ['context'],
    semanticDescription: 'Translate UI string into target locales using Claude API',
    examples: ['translate Book now to Vietnamese', 'localize this button label for vi and zh'],
  },
  {
    toolName: 'runI18nTests',
    executionPath: 'proactive_plan',
    label: 'Run i18n tests',
    riskLevel: RISK.SAFE_READ,
    requiresStore: false,
    approvalRequired: false,
    planRole: PLAN_ROLE.STANDALONE,
    prerequisiteTools: [],
    category: 'i18n',
    intentKeywords: ['test', 'i18n', 'regression', 'verify'],
    parameterSchema: {
      properties: {
        testPattern: { type: 'string' },
      },
    },
    requiredParams: [],
    optionalParams: ['testPattern'],
    semanticDescription: 'Run i18n test suite to confirm no regression after translation changes',
    examples: ['run i18n tests', 'verify translation changes did not break tests'],
  },
  {
    toolName: 'reportI18nProgress',
    executionPath: 'proactive_plan',
    label: 'Report i18n progress',
    riskLevel: RISK.STATE_CHANGE,
    requiresStore: false,
    approvalRequired: false,
    planRole: PLAN_ROLE.STANDALONE,
    prerequisiteTools: [],
    category: 'i18n',
    intentKeywords: ['report', 'progress', 'summary', 'blackboard'],
    parameterSchema: {
      properties: {
        missionId: { type: 'string' },
        filesScanned: { type: 'number' },
        filesFixed: { type: 'number' },
        stringsFound: { type: 'number' },
        stringsWired: { type: 'number' },
        keysAdded: { type: 'number' },
        skipped: { type: 'array' },
        errors: { type: 'array' },
        locales: { type: 'array' },
      },
    },
    requiredParams: ['missionId'],
    optionalParams: ['filesScanned', 'filesFixed', 'stringsFound', 'stringsWired', 'keysAdded', 'skipped', 'errors', 'locales'],
    semanticDescription: 'Write i18n repair progress summary to MissionBlackboard',
    examples: ['report i18n repair progress', 'summarize strings wired on blackboard'],
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
          : t.executionPath === 'proactive_plan'
            ? '(proactive_plan)'
            : '(chat)';
      const risk =
        t.riskLevel === RISK.STATE_CHANGE ? ' ⚠ state_change' : t.riskLevel === RISK.DESTRUCTIVE ? ' ⚠ destructive' : '';
      const description = String(t.semanticDescription ?? t.description ?? '').trim();
      const descriptionPreview = description.length > 100 ? `${description.slice(0, 100)}…` : description;
      const examples = Array.isArray(t.examples) ? t.examples.slice(0, 3).join('; ') : '';
      return `${i + 1}. ${t.toolName} ${path}${risk}
   ${descriptionPreview}${examples ? `\n   Examples: ${examples}` : ''}`;
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

