/**
 * ============================================================
 * PHASE C — PLAN TEMPLATES
 * ============================================================
 *
 * Building blocks for dynamic plan generation by intent.
 */

/** @typedef {import('./plannerTypes.js').PlanTemplate} PlanTemplate */

/** @type {Record<string, string>} */
export const INTENT_TEMPLATE_ALIASES = {
  update_store: 'create_store',
  publish_store: 'create_store',
  import_products: 'add_product',
  update_product: 'add_product',
  delete_product: 'add_product',
  list_products: 'add_product',
  launch_campaign: 'create_campaign',
  update_campaign: 'create_campaign',
  update_logo: 'generate_graphic',
  update_hero_image: 'generate_graphic',
  generate_promo_material: 'generate_graphic',
  update_catalog: 'create_catalog',
  import_products_catalog: 'create_catalog',
  upload_asset: 'create_catalog',
  guide_to_sign_in: 'general_chat',
  clarification: 'general_chat',
  create_store_first: 'create_store',
};

/** @type {Record<string, PlanTemplate>} */
export const PLAN_TEMPLATES = {
  create_store: {
    intent: 'create_store',
    workflow: 'store_creation',
    steps: [
      {
        id: 'step_1',
        name: 'validate_store_input',
        label: 'Validating store details...',
        labelVI: 'Đang xác thực thông tin cửa hàng...',
        type: 'action',
        tool: 'validate_store_input',
        optional: false,
        dependencies: [],
        estimatedDuration: 2,
        guestBehavior: 'allow',
      },
      {
        id: 'step_2',
        name: 'create_store_record',
        label: 'Creating your store...',
        labelVI: 'Đang tạo cửa hàng...',
        type: 'action',
        tool: 'create_store_record',
        optional: false,
        dependencies: ['step_1'],
        estimatedDuration: 3,
        guestBehavior: 'allow',
      },
      {
        id: 'step_3',
        name: 'upload_logo',
        label: 'Would you like to upload a logo?',
        labelVI: 'Bạn có muốn tải lên logo không?',
        type: 'checkpoint',
        tool: 'upload_logo',
        optional: true,
        dependencies: ['step_2'],
        estimatedDuration: 10,
        guestBehavior: 'allow',
        checkpointConfig: {
          type: 'upload',
          prompt: 'Would you like to upload a logo for your store?',
          required: false,
          options: [
            { id: 'upload', label: 'Upload now', description: 'Upload a logo image' },
            { id: 'skip', label: 'Skip', description: 'Skip this step' },
          ],
        },
      },
      {
        id: 'step_4',
        name: 'capture_requirements',
        label: 'Adding special requirements...',
        labelVI: 'Đang thêm yêu cầu đặc biệt...',
        type: 'checkpoint',
        tool: 'capture_requirements',
        optional: true,
        dependencies: ['step_2'],
        estimatedDuration: 5,
        guestBehavior: 'allow',
        checkpointConfig: {
          type: 'input',
          prompt: 'Add any special requirements for your store',
          required: false,
        },
      },
      {
        id: 'step_5',
        name: 'build_website_preview',
        label: 'Building store preview...',
        labelVI: 'Đang tạo bản xem trước cửa hàng...',
        type: 'action',
        tool: 'structured_store_build',
        optional: false,
        dependencies: ['step_2', 'step_3', 'step_4'],
        estimatedDuration: 15,
        guestBehavior: 'allow',
      },
      {
        id: 'step_6',
        name: 'analyze_store',
        label: 'Refining store content...',
        labelVI: 'Đang tinh chỉnh nội dung cửa hàng...',
        type: 'action',
        tool: 'analyze_store',
        optional: false,
        dependencies: ['step_5'],
        estimatedDuration: 5,
        guestBehavior: 'allow',
      },
      {
        id: 'step_7',
        name: 'finalize_store',
        label: 'Finalizing your store...',
        labelVI: 'Đang hoàn tất cửa hàng...',
        type: 'action',
        tool: 'finalize_store',
        optional: false,
        dependencies: ['step_6'],
        estimatedDuration: 2,
        guestBehavior: 'allow',
      },
    ],
    metadata: {
      totalSteps: 7,
      estimatedDuration: 42,
      requiresSignIn: false,
      requiresStore: false,
      primaryTool: 'create_store',
      tags: ['store', 'creation'],
      priority: 1,
    },
  },

  add_product: {
    intent: 'add_product',
    workflow: 'product_management',
    steps: [
      {
        id: 'step_1',
        name: 'validate_store_context',
        label: 'Validating store context...',
        labelVI: 'Đang xác thực cửa hàng...',
        type: 'action',
        tool: 'validate_store_context',
        optional: false,
        dependencies: [],
        estimatedDuration: 1,
        guestBehavior: 'guide_to_sign_in',
      },
      {
        id: 'step_2',
        name: 'prepare_catalog',
        label: 'Preparing product catalog...',
        labelVI: 'Đang chuẩn bị danh mục sản phẩm...',
        type: 'action',
        tool: 'prepare_catalog',
        optional: false,
        dependencies: ['step_1'],
        estimatedDuration: 3,
        guestBehavior: 'block',
      },
      {
        id: 'step_3',
        name: 'upload_products',
        label: 'Uploading product data...',
        labelVI: 'Đang tải lên dữ liệu sản phẩm...',
        type: 'checkpoint',
        tool: 'replace_store_catalog',
        optional: false,
        dependencies: ['step_2'],
        estimatedDuration: 10,
        guestBehavior: 'block',
        checkpointConfig: {
          type: 'upload',
          prompt: 'Upload your product file or enter product details',
          required: true,
        },
      },
      {
        id: 'step_4',
        name: 'validate_products',
        label: 'Validating product data...',
        labelVI: 'Đang xác thực dữ liệu sản phẩm...',
        type: 'action',
        tool: 'validate_products',
        optional: false,
        dependencies: ['step_3'],
        estimatedDuration: 3,
        guestBehavior: 'block',
      },
      {
        id: 'step_5',
        name: 'finalize_catalog',
        label: 'Finalizing product catalog...',
        labelVI: 'Đang hoàn tất danh mục sản phẩm...',
        type: 'action',
        tool: 'finalize_catalog',
        optional: false,
        dependencies: ['step_4'],
        estimatedDuration: 2,
        guestBehavior: 'block',
      },
    ],
    metadata: {
      totalSteps: 5,
      estimatedDuration: 19,
      requiresSignIn: true,
      requiresStore: true,
      primaryTool: 'replace_store_catalog',
      tags: ['product', 'catalog'],
      priority: 2,
    },
  },

  create_campaign: {
    intent: 'create_campaign',
    workflow: 'campaign_creation',
    steps: [
      {
        id: 'step_1',
        name: 'validate_store_context',
        label: 'Validating store context...',
        labelVI: 'Đang xác thực cửa hàng...',
        type: 'action',
        tool: 'validate_store_context',
        optional: false,
        dependencies: [],
        estimatedDuration: 1,
        guestBehavior: 'guide_to_sign_in',
      },
      {
        id: 'step_2',
        name: 'analyze_campaign_goal',
        label: 'Analyzing campaign goals...',
        labelVI: 'Đang phân tích mục tiêu chiến dịch...',
        type: 'action',
        tool: 'analyze_campaign_goal',
        optional: false,
        dependencies: ['step_1'],
        estimatedDuration: 3,
        guestBehavior: 'block',
      },
      {
        id: 'step_3',
        name: 'select_target_products',
        label: 'Select products for campaign...',
        labelVI: 'Chọn sản phẩm cho chiến dịch...',
        type: 'checkpoint',
        tool: 'select_products',
        optional: false,
        dependencies: ['step_2'],
        estimatedDuration: 5,
        guestBehavior: 'block',
        checkpointConfig: {
          type: 'selection',
          prompt: 'Select products to include in this campaign',
          required: true,
        },
      },
      {
        id: 'step_4',
        name: 'create_promotion',
        label: 'Creating promotional content...',
        labelVI: 'Đang tạo nội dung quảng cáo...',
        type: 'action',
        tool: 'create_promotion',
        optional: false,
        dependencies: ['step_3'],
        estimatedDuration: 5,
        guestBehavior: 'block',
      },
      {
        id: 'step_5',
        name: 'review_campaign',
        label: 'Review campaign details...',
        labelVI: 'Xem lại chi tiết chiến dịch...',
        type: 'checkpoint',
        tool: 'review_campaign',
        optional: false,
        dependencies: ['step_4'],
        estimatedDuration: 5,
        guestBehavior: 'block',
        checkpointConfig: {
          type: 'review',
          prompt: 'Review your campaign before launching',
          required: true,
        },
      },
      {
        id: 'step_6',
        name: 'launch_campaign',
        label: 'Launching campaign...',
        labelVI: 'Đang phát hành chiến dịch...',
        type: 'action',
        tool: 'launch_campaign',
        optional: false,
        dependencies: ['step_5'],
        estimatedDuration: 3,
        guestBehavior: 'block',
      },
    ],
    metadata: {
      totalSteps: 6,
      estimatedDuration: 22,
      requiresSignIn: true,
      requiresStore: true,
      primaryTool: 'create_campaign',
      tags: ['campaign', 'marketing', 'promotion'],
      priority: 2,
    },
  },

  generate_graphic: {
    intent: 'generate_graphic',
    workflow: 'graphic_generation',
    steps: [
      {
        id: 'step_1',
        name: 'validate_store_context',
        label: 'Validating store context...',
        labelVI: 'Đang xác thực cửa hàng...',
        type: 'action',
        tool: 'validate_store_context',
        optional: false,
        dependencies: [],
        estimatedDuration: 1,
        guestBehavior: 'guide_to_sign_in',
      },
      {
        id: 'step_2',
        name: 'specify_graphic_purpose',
        label: 'Specifying graphic purpose...',
        labelVI: 'Đang xác định mục đích đồ họa...',
        type: 'checkpoint',
        tool: 'specify_purpose',
        optional: false,
        dependencies: ['step_1'],
        estimatedDuration: 3,
        guestBehavior: 'block',
        checkpointConfig: {
          type: 'selection',
          prompt: 'What type of graphic do you need?',
          required: true,
          options: [
            { id: 'hero', label: 'Hero Image', description: 'Main store banner image' },
            { id: 'logo', label: 'Logo', description: 'Store logo' },
            { id: 'promo', label: 'Promotional Graphic', description: 'Campaign/promo image' },
            { id: 'product', label: 'Product Image', description: 'Product photography' },
          ],
        },
      },
      {
        id: 'step_3',
        name: 'generate_graphic',
        label: 'Generating graphic...',
        labelVI: 'Đang tạo đồ họa...',
        type: 'action',
        tool: 'generate_graphic',
        optional: false,
        dependencies: ['step_2'],
        estimatedDuration: 10,
        guestBehavior: 'block',
      },
      {
        id: 'step_4',
        name: 'review_graphic',
        label: 'Review generated graphic...',
        labelVI: 'Xem lại đồ họa đã tạo...',
        type: 'checkpoint',
        tool: 'review_graphic',
        optional: false,
        dependencies: ['step_3'],
        estimatedDuration: 3,
        guestBehavior: 'block',
        checkpointConfig: {
          type: 'review',
          prompt: 'Review your generated graphic',
          required: true,
        },
      },
      {
        id: 'step_5',
        name: 'apply_graphic',
        label: 'Applying graphic to store...',
        labelVI: 'Đang áp dụng đồ họa vào cửa hàng...',
        type: 'action',
        tool: 'apply_graphic',
        optional: false,
        dependencies: ['step_4'],
        estimatedDuration: 3,
        guestBehavior: 'block',
      },
    ],
    metadata: {
      totalSteps: 5,
      estimatedDuration: 20,
      requiresSignIn: true,
      requiresStore: true,
      primaryTool: 'generate_graphic',
      tags: ['graphic', 'design', 'image'],
      priority: 3,
    },
  },

  create_catalog: {
    intent: 'create_catalog',
    workflow: 'catalog_creation',
    steps: [
      {
        id: 'step_1',
        name: 'validate_store_context',
        label: 'Validating store context...',
        labelVI: 'Đang xác thực cửa hàng...',
        type: 'action',
        tool: 'validate_store_context',
        optional: false,
        dependencies: [],
        estimatedDuration: 1,
        guestBehavior: 'guide_to_sign_in',
      },
      {
        id: 'step_2',
        name: 'upload_catalog_file',
        label: 'Uploading catalog file...',
        labelVI: 'Đang tải lên file danh mục...',
        type: 'checkpoint',
        tool: 'upload_catalog',
        optional: false,
        dependencies: ['step_1'],
        estimatedDuration: 10,
        guestBehavior: 'block',
        checkpointConfig: {
          type: 'upload',
          prompt: 'Upload your catalog file (CSV, Excel, or PDF)',
          required: true,
        },
      },
      {
        id: 'step_3',
        name: 'parse_catalog',
        label: 'Parsing catalog data...',
        labelVI: 'Đang phân tích dữ liệu danh mục...',
        type: 'action',
        tool: 'parse_catalog',
        optional: false,
        dependencies: ['step_2'],
        estimatedDuration: 5,
        guestBehavior: 'block',
      },
      {
        id: 'step_4',
        name: 'validate_catalog',
        label: 'Validating catalog entries...',
        labelVI: 'Đang xác thực mục danh mục...',
        type: 'action',
        tool: 'validate_catalog',
        optional: false,
        dependencies: ['step_3'],
        estimatedDuration: 3,
        guestBehavior: 'block',
      },
      {
        id: 'step_5',
        name: 'finalize_catalog',
        label: 'Finalizing catalog...',
        labelVI: 'Đang hoàn tất danh mục...',
        type: 'action',
        tool: 'finalize_catalog',
        optional: false,
        dependencies: ['step_4'],
        estimatedDuration: 2,
        guestBehavior: 'block',
      },
    ],
    metadata: {
      totalSteps: 5,
      estimatedDuration: 21,
      requiresSignIn: true,
      requiresStore: true,
      primaryTool: 'create_catalog',
      tags: ['catalog', 'product'],
      priority: 2,
    },
  },

  general_chat: {
    intent: 'general_chat',
    workflow: 'unknown',
    steps: [
      {
        id: 'step_1',
        name: 'process_message',
        label: 'Processing your message...',
        labelVI: 'Đang xử lý tin nhắn...',
        type: 'action',
        tool: 'general_chat',
        optional: false,
        dependencies: [],
        estimatedDuration: 2,
        guestBehavior: 'allow',
      },
    ],
    metadata: {
      totalSteps: 1,
      estimatedDuration: 2,
      requiresSignIn: false,
      requiresStore: false,
      primaryTool: 'general_chat',
      tags: ['chat', 'general'],
      priority: 5,
    },
  },
};

/**
 * Resolve template key for an intent (with aliases).
 * @param {string} intent
 */
export function resolveTemplateKey(intent) {
  const key = String(intent ?? '').trim();
  return INTENT_TEMPLATE_ALIASES[key] || key;
}

/**
 * @param {string} intent
 * @param {Record<string, unknown>} [context]
 * @returns {PlanTemplate}
 */
export function getTemplateForIntent(intent, context = {}) {
  const templateKey = resolveTemplateKey(intent);
  const template = PLAN_TEMPLATES[templateKey] || PLAN_TEMPLATES.general_chat;

  const isGuest = Boolean(context.isGuest ?? String(context.userId ?? '').startsWith('guest_'));

  if (!isGuest) {
    return template;
  }

  const guestSteps = template.steps.map((step) => {
    if (step.guestBehavior === 'guide_to_sign_in' && step.type !== 'checkpoint') {
      return {
        ...step,
        type: 'checkpoint',
        checkpointConfig: {
          type: 'confirmation',
          prompt: 'Sign in to continue',
          required: true,
        },
      };
    }
    return step;
  });

  return {
    ...template,
    steps: guestSteps,
    metadata: {
      ...template.metadata,
      requiresSignIn: true,
    },
  };
}
