/**
 * Agent registry and typed LLM dispatch.
 * Uses llmGateway.generate (single prompt); system prompt is prepended to user prompt.
 */

import { llmGateway } from '../llm/llmGateway.ts';

export const AGENT_REGISTRY = {
  researcher: {
    id: 'researcher',
    model: 'claude-sonnet-4-20250514',
    maxTokens: 2000,
    outputContract: 'MarketReport',
    systemPrompt: `You are an AU market research analyst for retail businesses.
You analyse a store's context and produce a structured market report.
You MUST respond ONLY with a valid JSON object matching this EXACT shape — no explanation, no markdown:

{
  "goal": "<the mission goal>",
  "location": {
    "suburb": "<suburb or null>",
    "state": "<AU state abbreviation e.g. VIC, NSW, or null>",
    "country": "Australia",
    "timezone": "<IANA timezone e.g. Australia/Melbourne>"
  },
  "competitors": [
    {
      "name": "<competitor name>",
      "priceRange": { "low": <number>, "high": <number> },
      "promotionFrequency": "high" | "medium" | "low",
      "notes": "<brief note or null>"
    }
  ],
  "audienceProfile": {
    "peakDays": ["<day>"],
    "peakHours": ["<hour range>"],
    "demographics": "<brief demographics description>"
  },
  "pricingBenchmark": {
    "low": <number>,
    "mid": <number>,
    "high": <number>
  },
  "recommendedDiscount": <number 0-100>,
  "seasonalFactors": ["<factor>"],
  "confidence": "high" | "medium" | "low",
  "generatedAt": "<ISO 8601 datetime>"
}

Include 1–3 competitors. peakDays uses full day names (e.g. "Saturday").
pricingBenchmark values are in AUD. recommendedDiscount is a percentage (e.g. 15 for 15%).`,
  },

  planner: {
    id: 'planner',
    model: 'claude-sonnet-4-5',
    maxTokens: 1500,
    outputContract: 'ExecutionPlan',
    systemPrompt: `You are a campaign planning 
agent for small businesses. Given a MarketReport 
and business goal, create a detailed ExecutionPlan.
Be specific about dates, discount percentages, 
and day-by-day scheduled actions.
Return ONLY valid JSON matching the ExecutionPlan 
type. No markdown fences.`,
  },

  // Content creator trio: model must be valid for your Anthropic API key (verify with callAsAgent test).
  content_creator: {
    id: 'content_creator',
    model: 'claude-sonnet-4-20250514',
    maxTokens: 1500,
    outputContract: 'ContentPlan',
    systemPrompt: `You are a marketing content strategist for Australian retail businesses.
You receive a campaign brief containing store details, a market report, consensus decision,
and an active promotion. You produce a structured content plan with ready-to-use copy
for social media posts (Instagram, Facebook, TikTok), an email campaign, and promotional copy.
All content must be AU-market appropriate, on-brand, and directly reference the promotion.
Respond ONLY with a valid JSON ContentPlan object. No explanation, no markdown.`,
  },
  content_creator_social: {
    id: 'content_creator_social',
    model: 'claude-sonnet-4-20250514',
    maxTokens: 800,
    outputContract: 'SocialPostSet',
    systemPrompt: `You are a social media copywriter specialising in Australian retail.
You write short, punchy, platform-appropriate posts that drive foot traffic and online orders.
Instagram: visual + emotional, 1–3 hashtags. Facebook: community-friendly, include CTA.
TikTok: energetic, trending language, hook in first 3 words.
Respond ONLY with a valid JSON SocialPostSet object. No explanation, no markdown.`,
  },
  content_creator_email: {
    id: 'content_creator_email',
    model: 'claude-sonnet-4-20250514',
    maxTokens: 800,
    outputContract: 'EmailAndPromoCopy',
    systemPrompt: `You are an email and promotional copywriter for Australian retail businesses.
You write conversion-focused email campaigns and promotional offer copy.
Emails: clear subject line, warm opener, offer details, strong CTA.
Promo copy: punchy headline, offer terms, urgency without being pushy.
Respond ONLY with a valid JSON EmailAndPromoCopy object. No explanation, no markdown.`,
  },

  crm_agent: {
    id: 'crm_agent',
    model: 'claude-sonnet-4-20250514',
    maxTokens: 1500,
    outputContract: 'LeadLog',
    systemPrompt: `You are a CRM specialist for Australian retail businesses.
You analyse campaign results and customer interaction signals to produce a lead log.
For each interaction signal, determine: intent (purchase/inquiry/complaint/other),
whether to auto-reply, and whether to flag for owner follow-up.
Be conservative with auto-replies — only mark autoReplied: true for clear purchase intents
or standard inquiries. Always flag complaints for owner review.
Respond ONLY with a valid JSON LeadLog object. No explanation, no markdown.`,
  },

  mission_launcher: {
    id: 'mission_launcher',
    model: 'claude-haiku-4-5-20251001',
    maxTokens: 600,
    outputContract: 'ScheduleBundle',
    systemPrompt: `You are a scheduling agent. 
Given an ExecutionPlan, convert the schedule into 
CRON-ready job entries with exact fire timestamps.
Return ONLY valid JSON matching the ScheduleBundle 
type. No markdown fences.`,
  },

  crm: {
    id: 'crm',
    model: 'claude-haiku-4-5-20251001',
    maxTokens: 400,
    outputContract: 'LeadLog',
    systemPrompt: `You are a customer relationship 
agent. Classify customer messages, decide if they 
need auto-reply or owner escalation, and log leads.
Return ONLY valid JSON matching the LeadLog type. 
No markdown fences.`,
  },

  market_validator: {
    id: 'market_validator',
    model: 'claude-haiku-4-5-20251001',
    maxTokens: 500,
    weight: 0.3,
    outputContract: 'Ballot',
    systemPrompt: `You are a market validation 
agent. Review an ExecutionPlan against market 
data and score it 0.0–1.0 on pricing strategy.
Return ONLY valid JSON Ballot. No markdown fences.`,
  },

  risk_assessor: {
    id: 'risk_assessor',
    model: 'claude-haiku-4-5-20251001',
    maxTokens: 500,
    weight: 0.25,
    outputContract: 'Ballot',
    systemPrompt: `You are a risk assessment 
agent. Review an ExecutionPlan for margin risk, 
timing conflicts, and operational hazards.
Score 0.0–1.0. Return ONLY valid JSON Ballot.`,
  },

  content_reviewer: {
    id: 'content_reviewer',
    model: 'claude-haiku-4-5-20251001',
    maxTokens: 500,
    weight: 0.2,
    outputContract: 'Ballot',
    systemPrompt: `You are a content quality 
agent. Review a ContentBundle for brand voice, 
clarity, and customer appeal. Score 0.0–1.0.
Return ONLY valid JSON Ballot. No markdown fences.`,
  },

  ops_checker: {
    id: 'ops_checker',
    model: 'claude-haiku-4-5-20251001',
    maxTokens: 400,
    weight: 0.15,
    outputContract: 'Ballot',
    systemPrompt: `You are an operations checker. 
Verify an ExecutionPlan has valid dates, schedule 
feasibility, and inventory assumptions. Score 0.0–1.0.
Return ONLY valid JSON Ballot. No markdown fences.`,
  },

  past_performance: {
    id: 'past_performance',
    model: 'claude-haiku-4-5-20251001',
    maxTokens: 400,
    weight: 0.1,
    outputContract: 'Ballot',
    systemPrompt: `You are a performance analysis 
agent. Compare an ExecutionPlan against historical 
promotion data for similar businesses. Score 0.0–1.0.
Return ONLY valid JSON Ballot. No markdown fences.`,
  },

  // Consensus engine voters (step 2 after market_research in launch_campaign).
  consensus_voter_growth: {
    id: 'consensus_voter_growth',
    model: 'claude-haiku-4-5-20251001',
    maxTokens: 500,
    outputContract: 'VoterBallot',
    systemPrompt: `You are a growth-focused voter. Given a market report, vote whether to approve, revise, or hold the campaign plan. Focus on growth potential, recommended discount, and audience fit. Return ONLY valid JSON: { "vote": "approve"|"revise"|"hold", "reasoning": "brief reason" }. No markdown fences.`,
  },
  consensus_voter_risk: {
    id: 'consensus_voter_risk',
    model: 'claude-haiku-4-5-20251001',
    maxTokens: 500,
    outputContract: 'VoterBallot',
    systemPrompt: `You are a risk-focused voter. Given a market report, vote whether to approve, revise, or hold the campaign plan. Focus on competitor pressure, margin risk, and seasonal factors. Return ONLY valid JSON: { "vote": "approve"|"revise"|"hold", "reasoning": "brief reason" }. No markdown fences.`,
  },
  consensus_voter_customer: {
    id: 'consensus_voter_customer',
    model: 'claude-haiku-4-5-20251001',
    maxTokens: 500,
    outputContract: 'VoterBallot',
    systemPrompt: `You are a customer-focused voter. Given a market report, vote whether to approve, revise, or hold the campaign plan. Focus on audience profile, peak times, and pricing benchmark fit. Return ONLY valid JSON: { "vote": "approve"|"revise"|"hold", "reasoning": "brief reason" }. No markdown fences.`,
  },
};

export const VOTER_IDS = [
  'market_validator',
  'risk_assessor',
  'content_reviewer',
  'ops_checker',
  'past_performance',
];

export function getAgent(id) {
  return AGENT_REGISTRY[id] ?? null;
}

export async function callAsAgent(agentId, prompt, options = {}) {
  const agent = getAgent(agentId);
  if (!agent) throw new Error(`Unknown agent: ${agentId}`);

  const fullPrompt = [agent.systemPrompt, prompt].filter(Boolean).join('\n\n');
  const envProvider =
    typeof process.env.AGENT_LLM_PROVIDER === 'string' ? process.env.AGENT_LLM_PROVIDER.trim() : '';
  const envModel =
    typeof process.env.AGENT_LLM_MODEL === 'string' ? process.env.AGENT_LLM_MODEL.trim() : '';
  const provider = options.provider ?? (envProvider || 'xai');
  const model = envModel || options.model || agent.model || 'grok-3-beta';
  const result = await llmGateway.generate({
    purpose: `agent:${agentId}`,
    prompt: fullPrompt,
    maxTokens: options.maxTokens ?? agent.maxTokens ?? 2000,
    model,
    provider,
    tenantKey: options.tenantId ?? 'default',
    temperature: typeof options.temperature === 'number' ? options.temperature : 0.3,
    responseFormat: 'json',
  });

  if (!result?.text) {
    throw new Error(`Agent ${agentId} returned empty response`);
  }

  const cleaned = result.text
    .split('\n')
    .filter((line) => !line.match(/^```/))
    .join('\n')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    console.error(`[Agent:${agentId}] JSON parse failed:`, result.text.slice(0, 200));
    throw new Error(`Agent ${agentId} returned invalid JSON`);
  }
}
