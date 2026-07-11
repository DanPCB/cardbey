/**
 * Campaign / loyalty spine detection and plan enrichment helpers.
 * Compiler-spine missions must not be short-circuited by DeepSeek primary intake.
 */

const COMPILER_SPINE_TOOLS = new Set([
  'create_campaign',
  'create_campaign_brief',
  'setup_loyalty_program',
  'create_loyalty_program',
]);

const CAMPAIGN_LOYALTY_MESSAGE =
  /\b(loyalty|campaign|reward\s*program|points\s*program|stamp\s*card|promo(tion)?)\b/i;

export function isCampaignOrLoyaltyMessage(userMessage: string): boolean {
  return CAMPAIGN_LOYALTY_MESSAGE.test(String(userMessage ?? '').trim());
}

/**
 * True when intake should continue on the existing compiler / loyalty spine
 * instead of DeepSeek primary short-circuit.
 */
export function isCompilerSpineIntake(
  classification: Record<string, unknown>,
  userMessage: string,
): boolean {
  const tool = String(classification?.tool ?? '').trim().toLowerCase();
  if (classification?._compilerEligible === true) return true;
  if (COMPILER_SPINE_TOOLS.has(tool)) return true;
  if (tool.includes('loyalty')) return true;
  if (String(classification?.executionPath ?? '').includes('multi_agent_compile')) return true;
  if (isCampaignOrLoyaltyMessage(userMessage)) return true;
  return false;
}

export interface CampaignNameContext {
  storeName?: string;
  userMessage?: string;
}

/**
 * Derive a concrete campaign name from user context (no placeholders).
 */
export function generateCampaignNameFromContext(
  userMessage: string,
  context: CampaignNameContext = {},
): string {
  const storeRaw = String(context.storeName ?? '').trim();
  const storeSlug = storeRaw
    ? storeRaw.replace(/[^a-zA-Z0-9]+/g, '').slice(0, 24)
    : 'Store';
  const msg = String(userMessage ?? '').toLowerCase();
  const keywords: string[] = [];
  if (/loyalty|points|stamp/i.test(msg)) keywords.push('Loyalty');
  if (/campaign|promo/i.test(msg)) keywords.push('Campaign');
  if (keywords.length === 0) keywords.push('Campaign');
  const date = new Date().toISOString().slice(0, 10);
  return `${storeSlug}_${keywords.join('')}_${date}`;
}

export type RewardType = 'POINTS' | 'DISCOUNT';

export interface RewardShape {
  type: RewardType;
  value: number;
}

/**
 * Normalize reward type/value from user message and draft parameters.
 */
export function normalizeRewardType(
  reward: Partial<RewardShape> & { reward?: string },
  userMessage: string,
): RewardShape {
  const msg = String(userMessage ?? '').toLowerCase();
  const wantsPoints = /\bpoints?\b/i.test(msg);
  const wantsDiscount = /\bdiscount|percent|%|off\b/i.test(msg);

  let type: RewardType = 'POINTS';
  if (wantsPoints && !wantsDiscount) {
    type = 'POINTS';
  } else if (wantsDiscount && !wantsPoints) {
    type = 'DISCOUNT';
  } else if (reward.type === 'DISCOUNT' || reward.reward === 'discount') {
    type = 'DISCOUNT';
  } else if (reward.type === 'POINTS' || reward.type === 'points') {
    type = 'POINTS';
  }

  let value = Number(reward.value);
  if (!Number.isFinite(value) || value <= 0) {
    value = type === 'DISCOUNT' ? 10 : 100;
  }
  if (type === 'DISCOUNT' && value > 100) value = 100;

  return { type, value };
}

export function campaignPlannerPromptExtension(userMessage: string): string {
  if (!isCampaignOrLoyaltyMessage(userMessage)) return '';

  return `

CAMPAIGN / LOYALTY PLANNING RULES (mandatory when user requests a campaign or loyalty program):
- NEVER use placeholder names like "Loyalty Campaign Name" or IDs like "placeholder"
- Step 1 must generate a concrete campaign name from store + user intent + date
- Step 2 must generate a real campaign ID (format CAMP-XXXXXX or uuid) before launch
- Include verify_campaign_status after create/launch with expected status (DRAFT or ACTIVE)
- Include rollback_campaign_creation on failure paths for create/launch steps
- rewardType must be POINTS or DISCOUNT consistently with rewardValue (not mixed discount/points)
- requiredTools should include: setup_loyalty_program or create_campaign as appropriate`;
}

export function campaignCriticPromptExtension(userMessage: string): string {
  if (!isCampaignOrLoyaltyMessage(userMessage)) return '';

  return `

CAMPAIGN / LOYALTY REVIEW (reject plan if any apply):
- Placeholder campaign name or ID
- Missing post-launch verification step
- Missing rollback or error-handling for create/launch
- reward type inconsistency (e.g. type POINTS with discount semantics)`;
}
