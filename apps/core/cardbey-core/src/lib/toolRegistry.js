/**
 * Tool Registry - centralized definitions for mission pipeline tools.
 * Step names (e.g. generate_tags) must exist here; buildDefaultMissionSteps validates against it.
 */

const TOOLS = [
  { toolName: 'analyze_store', label: 'Analyze store', description: 'Analyze store data and structure', category: 'store', targetTypes: ['store', 'draft_store'], requiresConfirmation: false, aliases: ['analyze'] },
  { toolName: 'generate_tags', label: 'Generate tags', description: 'Generate product or category tags', category: 'store', targetTypes: ['store', 'draft_store'], requiresConfirmation: false, aliases: ['tags'] },
  { toolName: 'rewrite_descriptions', label: 'Rewrite descriptions', description: 'Rewrite product or store descriptions', category: 'store', targetTypes: ['store', 'draft_store'], requiresConfirmation: false, aliases: ['rewrite'] },
  { toolName: 'improve_hero', label: 'Improve hero', description: 'Improve store hero image or section', category: 'store', targetTypes: ['store', 'draft_store'], requiresConfirmation: false, aliases: ['hero'] },
  { toolName: 'market_research', label: 'Market research', description: 'Run researcher agent for market report (AU focus)', category: 'store', targetTypes: ['store', 'draft_store'], requiresConfirmation: false, aliases: ['campaign_research'] },
  { toolName: 'consensus', label: 'Consensus', description: 'Run three voter agents on market report and resolve approve/revise/hold', category: 'store', targetTypes: ['store', 'draft_store'], requiresConfirmation: false },
  { toolName: 'create_promotion', label: 'Create promotion', description: 'Create a promotion', category: 'promotion', targetTypes: ['promotion'], requiresConfirmation: false, aliases: ['generate_mini_website', 'mini_website'] },
  { toolName: 'launch_campaign', label: 'Launch campaign', description: 'Deploy promotion to channels (landing page, WhatsApp, social)', category: 'promotion', targetTypes: ['promotion'], requiresConfirmation: false },
  { toolName: 'publish_to_social', label: 'Share campaign', description: 'Share or post a campaign to social platforms (share links or connected Facebook Page)', category: 'promotion', targetTypes: ['promotion', 'store'], requiresConfirmation: true },
  { toolName: 'connect_social_account', label: 'Connect social account', description: 'Link Facebook Page via OAuth for automatic posting', category: 'promotion', targetTypes: ['store', 'promotion'], requiresConfirmation: false },
  { toolName: 'edit_artifact', label: 'Edit artifact copy', description: 'LLM-assisted edits to promotion, business profile, storefront hero, or mini-website draft preview', category: 'content', targetTypes: ['store', 'draft_store', 'promotion'], requiresConfirmation: false },
  { toolName: 'generate_promotion_asset', label: 'Generate promotion asset', description: 'Generate assets for promotion', category: 'promotion', targetTypes: ['promotion'], requiresConfirmation: false },
  { toolName: 'assign_promotion_slot', label: 'Assign promotion slot', description: 'Assign promotion to slot', category: 'promotion', targetTypes: ['promotion', 'slot_assignment'], requiresConfirmation: false },
  {
    toolName: 'activate_promotion',
    label: 'Activate promotion',
    description: 'Activate promotion',
    category: 'promotion',
    targetTypes: ['promotion'],
    requiresConfirmation: false,
    aliases: ['show_promotion', 'display_promotion', 'publish_promotion', 'show_promo'],
  },
  { toolName: 'content_creator', label: 'Content creator', description: 'Generate campaign content (social, email, promo copy)', category: 'content', targetTypes: ['store', 'draft_store'], requiresConfirmation: false, aliases: ['content'] },
  { toolName: 'crm', label: 'CRM', description: 'Log leads and customer interactions from campaign', category: 'crm', targetTypes: ['store'], requiresConfirmation: false },
  { toolName: 'resolve_target_screens', label: 'Resolve target screens', description: 'Resolve target screens for deployment', category: 'devices', targetTypes: ['device_group'], requiresConfirmation: false },
  { toolName: 'prepare_screen_asset', label: 'Prepare screen asset', description: 'Prepare asset for screen', category: 'content', targetTypes: ['device_group'], requiresConfirmation: false },
  { toolName: 'assign_screen_slot', label: 'Assign screen slot', description: 'Assign content to screen slot', category: 'devices', targetTypes: ['device_group', 'slot_assignment'], requiresConfirmation: false },
  { toolName: 'activate_screen_content', label: 'Activate screen content', description: 'Activate screen content', category: 'content', targetTypes: ['device_group'], requiresConfirmation: false },
  { toolName: 'generate_social_posts', label: 'Generate social posts', description: 'Generate social media posts for your store', category: 'content', targetTypes: ['store', 'draft_store'], requiresConfirmation: false, aliases: ['social_posts'] },
  { toolName: 'smart_visual', label: 'Smart visual', description: 'Generate images or moodboards from a text prompt (intake / campaigns)', category: 'content', targetTypes: ['store', 'draft_store', 'promotion'], requiresConfirmation: false },
  { toolName: 'create_offer', label: 'Create offer', description: 'Create an offer and optional promotion', category: 'promotion', targetTypes: ['promotion'], requiresConfirmation: false },
  { toolName: 'mini_website_get_sections', label: 'Load mini website sections', description: 'Read published mini website sections and theme for a store', category: 'store', targetTypes: ['store', 'draft_store'], requiresConfirmation: false },
  { toolName: 'generate_section_patches', label: 'Plan section edits', description: 'LLM: minimal section patches from user intent', category: 'store', targetTypes: ['store', 'draft_store'], requiresConfirmation: false },
  { toolName: 'mini_website_patch_sections', label: 'Apply mini website patches', description: 'Merge patches into mini website and save', category: 'store', targetTypes: ['store', 'draft_store'], requiresConfirmation: false },
  { toolName: 'propose_website_patch', label: 'Review proposed website changes', description: 'Emit patch proposal and pause for user approval', category: 'store', targetTypes: ['store', 'draft_store'], requiresConfirmation: false },
  { toolName: 'change_hero_headline', label: 'Change hero headline', description: 'Update mini-website hero headline/subheadline', category: 'store', targetTypes: ['store', 'draft_store'], requiresConfirmation: false },
  { toolName: 'signage.list-devices', label: 'List C-Net screens', description: 'List paired store screens and current playlist', category: 'devices', targetTypes: ['store', 'draft_store'], requiresConfirmation: false },
  { toolName: 'signage.publish-to-devices', label: 'Push playlist to screens', description: 'Push a SIGNAGE playlist to selected or all store screens', category: 'devices', targetTypes: ['store', 'draft_store'], requiresConfirmation: false },
  { toolName: 'mcp_context_products', label: 'MCP product context', description: 'Read-only published products via MCP adapter (runtime smoke / context)', category: 'mcp', targetTypes: ['store', 'draft_store', 'generic'], requiresConfirmation: false },
  { toolName: 'mcp_context_business', label: 'MCP business context', description: 'Read-only business/store summaries via MCP adapter (runtime smoke / context)', category: 'mcp', targetTypes: ['store', 'draft_store', 'generic'], requiresConfirmation: false },
  { toolName: 'mcp_context_store_assets', label: 'MCP store assets context', description: 'Read-only branding and asset metadata via MCP adapter (runtime smoke / context)', category: 'mcp', targetTypes: ['store', 'draft_store', 'generic'], requiresConfirmation: false },
  { toolName: 'mcp_context_promotions', label: 'MCP promotions context', description: 'Read-only active promotions for a store via MCP adapter', category: 'mcp', targetTypes: ['store', 'draft_store', 'generic'], requiresConfirmation: false },
  { toolName: 'mcp_context_missions', label: 'MCP missions context', description: 'Read-only recent mission pipeline history via MCP adapter', category: 'mcp', targetTypes: ['store', 'draft_store', 'generic'], requiresConfirmation: false },
  { toolName: 'mcp_context_analytics', label: 'MCP analytics context', description: 'Read-only store activity counts via MCP adapter', category: 'mcp', targetTypes: ['store', 'draft_store', 'generic'], requiresConfirmation: false },
  {
    toolName: 'mcp_google_calendar_create_event',
    label: 'Google Calendar: create event',
    description: 'Create a calendar event via Google Calendar API (OAuthConnection platform google)',
    category: 'mcp',
    targetTypes: ['store', 'draft_store', 'generic'],
    requiresConfirmation: true,
  },
  { toolName: 'start_build_store', label: 'Start build store', description: 'Create orchestrator build_store job and draft (AI operator)', category: 'operator', targetTypes: ['generic'], requiresConfirmation: false },
  { toolName: 'get_draft_by_run', label: 'Get draft by run', description: 'Resolve draft id by generationRunId (AI operator)', category: 'operator', targetTypes: ['generic'], requiresConfirmation: false },
  { toolName: 'get_draft_summary', label: 'Get draft summary', description: 'Draft status and catalog counts (AI operator)', category: 'operator', targetTypes: ['generic'], requiresConfirmation: false },
  { toolName: 'poll_orchestra_job', label: 'Poll orchestra job', description: 'Read orchestrator task status and result (AI operator)', category: 'operator', targetTypes: ['generic'], requiresConfirmation: false },
  { toolName: 'publish_store', label: 'Publish store from draft', description: 'Commit draft to published store (AI operator)', category: 'operator', targetTypes: ['generic'], requiresConfirmation: false },
  { toolName: 'log_event', label: 'Log event', description: 'Append operator log line (AI operator)', category: 'operator', targetTypes: ['generic'], requiresConfirmation: false },
  { toolName: 'run_pipeline', label: 'Run pipeline', description: 'Run full build_store pipeline in one tool (AI operator)', category: 'operator', targetTypes: ['generic'], requiresConfirmation: false },
  {
    toolName: 'mission_pipeline_stub',
    label: 'Pipeline branch stub',
    description: 'Internal: records a conditional branch without side effects (Phase 3 checkpoints)',
    category: 'operator',
    targetTypes: ['generic', 'store', 'draft_store'],
    requiresConfirmation: false,
  },
  {
    toolName: 'structured_store_build',
    label: 'Structured store build',
    description: 'After checkpoints: create DraftStore, generate preview, commit Business for authed users',
    category: 'store',
    targetTypes: ['store', 'draft_store'],
    requiresConfirmation: false,
  },
];

const BY_NAME = new Map(TOOLS.map((t) => [t.toolName, t]));

if (process.env.NODE_ENV !== 'production') {
  console.log(`[ToolRegistry] loaded tools: ${TOOLS.length}`);
}

/**
 * @param {string} toolName
 * @returns {{ toolName: string, label: string, description?: string, category: string, targetTypes: string[], requiresConfirmation: boolean } | undefined}
 */
export function getToolDefinition(toolName) {
  if (!toolName || typeof toolName !== 'string') return undefined;
  return BY_NAME.get(toolName.trim()) ?? undefined;
}

/**
 * @param {string} targetType
 * @returns {Array<{ toolName: string, label: string, description?: string, category: string, targetTypes: string[], requiresConfirmation: boolean }>}
 */
export function getToolsForTarget(targetType) {
  if (!targetType || typeof targetType !== 'string') return [];
  const t = targetType.trim();
  return TOOLS.filter((tool) => tool.targetTypes.includes(t));
}

/**
 * @param {string} category
 * @returns {Array<{ toolName: string, label: string, description?: string, category: string, targetTypes: string[], requiresConfirmation: boolean }>}
 */
export function getToolsForCategory(category) {
  if (!category || typeof category !== 'string') return [];
  const c = category.trim();
  return TOOLS.filter((tool) => tool.category === c);
}

/**
 * Tool list for LLM task planning (names must match dispatch / executors).
 * @returns {Array<{ toolName: string, label: string, description?: string, category: string, targetTypes: string[], planningHint: { agentHint: string } }>}
 */
export function getToolsForPlanner() {
  return TOOLS.map((t) => ({
    toolName: t.toolName,
    label: t.label,
    description: t.description,
    category: t.category,
    targetTypes: t.targetTypes,
    planningHint: { agentHint: 'dispatchTool' },
  }));
}

export { TOOLS };
