/**
 * In-process planner executor (MISSION_PLANNER_INPROCESS=true).
 * Produces plan_update (title, steps with id/label/status) or approval_required when essentials missing.
 * Uses OCR research_result (Image summary) to fill Mission.context.businessProfile and tailor plan.
 */

import { getPrismaClient } from '../lib/prisma.js';
import { createAgentMessage } from '../orchestrator/lib/agentMessage.js';
import { mergeMissionContext } from './mission.js';

const MAX_STEPS = 10;
const MAX_TITLE_LEN = 120;
const MESSAGES_LOAD = 30;

/**
 * From recent messages, find the latest research_result with "Image summary" or extractedEntities.
 * Returns a businessProfile shape: { name, address, phones, email, website, social } for merging.
 */
function extractBusinessProfileFromOcrMessages(messages) {
  if (!Array.isArray(messages)) return {};
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.messageType !== 'research_result' || !m.payload || typeof m.payload !== 'object') continue;
    const title = m.payload.title;
    const entities = m.payload.extractedEntities;
    if (!entities && (!title || !String(title).includes('Image summary'))) continue;
    const e = entities || {};
    const profile = {};
    if (e.businessName && String(e.businessName).trim()) profile.name = String(e.businessName).trim();
    if (e.address && String(e.address).trim()) profile.address = String(e.address).trim();
    if (Array.isArray(e.phones) && e.phones.length) profile.phones = e.phones.map((p) => String(p).trim()).filter(Boolean);
    if (e.email && String(e.email).trim()) profile.email = String(e.email).trim();
    if (e.website && String(e.website).trim()) profile.website = String(e.website).trim();
    if (e.social && typeof e.social === 'object') profile.social = e.social;
    if (Object.keys(profile).length) return profile;
  }
  return {};
}

/**
 * Deep-merge source into target (non-destructive: only set missing keys).
 */
function deepMergeNonDestructive(target, source) {
  const out = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] == null) continue;
    if (typeof source[key] === 'object' && !Array.isArray(source[key]) && source[key] !== null) {
      out[key] = deepMergeNonDestructive(out[key] && typeof out[key] === 'object' && !Array.isArray(out[key]) ? out[key] : {}, source[key]);
    } else if (out[key] === undefined || out[key] === '' || (Array.isArray(out[key]) && out[key].length === 0)) {
      out[key] = source[key];
    }
  }
  return out;
}

/**
 * Build a minimal plan from last messages and mission context.
 * Uses context.businessProfile (from OCR) first; only asks for missing: target customers, budget, hero products.
 * Returns { type: 'plan_update', payload } or { type: 'approval_required', payload }.
 */
function buildPlanFromContext(messages, missionContext) {
  const ctx = missionContext && typeof missionContext === 'object' ? missionContext : {};
  const businessProfile = ctx.businessProfile && typeof ctx.businessProfile === 'object' ? ctx.businessProfile : {};
  const name = (businessProfile.name || businessProfile.businessName || '').toString().trim();
  const address = (businessProfile.address || '').toString().trim();
  const hasFacebook = businessProfile.social && (businessProfile.social.facebook === true || !!businessProfile.social.facebook);
  const hasWebsite = !!(businessProfile.website && String(businessProfile.website).trim());
  const hasAddress = !!address.trim();
  const hasBusinessInfo = !!(name || hasAddress || hasWebsite || (Array.isArray(businessProfile.phones) && businessProfile.phones.length));

  const useDefaults = ctx.useDefaults === true;
  const hasBudget =
    useDefaults ||
    ctx.budget != null ||
    ctx.budgetWeekly != null ||
    ctx.budgetRange != null ||
    (typeof ctx.budget === 'string' && ctx.budget.trim() !== '') ||
    (typeof ctx.budgetWeekly === 'string' && ctx.budgetWeekly.trim() !== '');
  const hasTarget = useDefaults || ctx.targetCustomers != null || ctx.targetAudience != null || (typeof ctx.targetCustomers === 'string' && ctx.targetCustomers.trim() !== '');
  const hasHeroProducts =
    useDefaults ||
    (Array.isArray(ctx.heroProducts) && ctx.heroProducts.length > 0) ||
    (typeof ctx.heroProducts === 'string' && ctx.heroProducts.trim() !== '');

  if (!hasBudget || !hasTarget || !hasHeroProducts) {
    const options = [
      { id: 'provide_budget', label: 'Provide budget' },
      { id: 'provide_target', label: 'Provide target customers' },
      { id: 'provide_hero', label: 'Provide hero products' },
      { id: 'use_defaults', label: 'Use defaults' },
    ];
    const missing = [];
    if (!hasBudget) missing.push('budget');
    if (!hasTarget) missing.push('target customers');
    if (!hasHeroProducts) missing.push('hero products');
    const prompt = hasBusinessInfo
      ? `To tailor your 2-week marketing plan${name ? ` for ${name}` : ''}, please provide: ${missing.join(', ')} (or choose Use defaults).`
      : `Missing essentials: ${missing.join(', ')}. Choose an option to continue.`;
    return {
      type: 'approval_required',
      payload: { prompt, options },
    };
  }

  const stepLabels = [
    'Week 1: Research market and competitors',
    'Define target customers',
    'Set budget and timeline',
    'Choose channels (e.g. social, email)',
    'Draft content plan',
    'Review and approve',
  ];
  if (hasFacebook) stepLabels.push('Facebook content plan and ads suggestion');
  if (hasWebsite) stepLabels.push('SEO and landing page suggestion');
  if (hasAddress) stepLabels.push('Google Business Profile and local maps');
  const steps = stepLabels.slice(0, MAX_STEPS).map((label, i) => ({
    id: `step-${i + 1}`,
    label: label.slice(0, 80),
    status: 'todo',
  }));

  let title = (ctx.planTitle && String(ctx.planTitle).slice(0, MAX_TITLE_LEN)) || '';
  if (!title && (name || address)) {
    title = [name, address].filter(Boolean).join(', ');
    if (title.length > MAX_TITLE_LEN) title = title.slice(0, MAX_TITLE_LEN - 3) + '…';
  }
  if (!title) title = 'Marketing plan v1';
  if (name && !title.toLowerCase().includes('2-week') && !title.toLowerCase().includes('plan')) {
    title = `2-week marketing plan: ${name}`.slice(0, MAX_TITLE_LEN);
  } else if (!title || title === 'Marketing plan v1') {
    title = '2-week marketing plan';
  }

  const assumptions = [];
  if (hasBudget) assumptions.push('Budget scope is set');
  if (hasTarget) assumptions.push('Target audience is set');
  if (name) assumptions.push(`Business: ${name}`);
  const risks = ['Timeline may shift if scope changes'];

  const executionSuggestions = [
    hasWebsite && 'Add website to all materials and Google Business',
    hasFacebook && 'Schedule 2–3 Facebook posts in the first week',
    hasAddress && 'Verify address on Google Maps and local directories',
  ].filter(Boolean);

  return {
    type: 'plan_update',
    payload: {
      title,
      steps,
      assumptions: assumptions.slice(0, 5),
      risks: risks.slice(0, 5),
      executionSuggestions: executionSuggestions.slice(0, 5),
    },
  };
}

/**
 * Run planner for a mission: load context, produce plan_update or approval_required, post via createAgentMessage.
 * Does not throw; returns { ok: true } or { ok: false, error }.
 */
export async function runPlannerInProcess(missionId, runInput = {}) {
  const prisma = getPrismaClient();
  let messages = [];
  let missionContext = null;
  try {
    const msgs = await prisma.agentMessage.findMany({
      where: { missionId },
      orderBy: { createdAt: 'desc' },
      take: MESSAGES_LOAD,
      select: { id: true, senderType: true, senderId: true, content: true, messageType: true, payload: true, createdAt: true },
    });
    messages = msgs.reverse();
    const mission = await prisma.mission.findUnique({
      where: { id: missionId },
      select: { context: true },
    });
    missionContext = mission?.context ?? null;
  } catch (err) {
    console.warn('[plannerExecutor] load context failed:', err?.message || err);
    return { ok: false, error: err?.message || String(err) };
  }

  const existingProfile = (missionContext && missionContext.businessProfile && typeof missionContext.businessProfile === 'object') ? missionContext.businessProfile : {};
  const recentForOcr = messages.length > 10 ? messages.slice(-10) : messages;
  const ocrProfile = extractBusinessProfileFromOcrMessages(recentForOcr);
  if (Object.keys(ocrProfile).length > 0) {
    const merged = deepMergeNonDestructive(existingProfile, ocrProfile);
    missionContext = missionContext || {};
    missionContext = { ...missionContext, businessProfile: merged };
    mergeMissionContext(missionId, { businessProfile: merged }).catch((err) =>
      console.warn('[plannerExecutor] mergeMissionContext failed:', err?.message || err)
    );
  }

  const intent = runInput && typeof runInput === 'object' && runInput.intent ? String(runInput.intent) : '';
  const ctxForPlan = { ...missionContext, intent };

  let result;
  try {
    result = buildPlanFromContext(messages, ctxForPlan);
  } catch (err) {
    console.warn('[plannerExecutor] buildPlan failed:', err?.message || err);
    return { ok: false, error: err?.message || String(err) };
  }

  try {
    if (result.type === 'approval_required') {
      const { findOrCreateCheckpointFormMessage } = await import('../orchestrator/lib/agentMessage.js');
      const checkpointPayload = {
        title: 'Tailor your 2-week plan',
        description: 'Provide these to tailor your 2-week marketing plan.',
        fields: [
          { key: 'budgetWeekly', label: 'Weekly budget', type: 'number', placeholder: 'e.g. 100' },
          { key: 'targetCustomers', label: 'Target customers', type: 'text', placeholder: 'e.g. local families' },
          { key: 'heroProducts', label: 'Hero products', type: 'text', placeholder: 'e.g. sourdough, pastries' },
        ],
        actions: [
          { id: 'submit', label: 'Save & Continue' },
          { id: 'use_defaults', label: 'Use defaults' },
        ],
      };
      await findOrCreateCheckpointFormMessage({
        missionId,
        triggerMessageId: null,
        checkpointKey: 'tailor_plan_v1',
        payload: checkpointPayload,
        text: result.payload.prompt || 'Tailor your 2-week plan',
      });
      return { ok: true };
    }
    if (result.type === 'plan_update' && result.payload) {
      const payload = result.payload;
      const steps = Array.isArray(payload.steps) ? payload.steps.slice(0, MAX_STEPS) : [];
      const stepsForPayload = steps.map((s) =>
        s && typeof s === 'object' && s.label != null
          ? { id: s.id || `s${Math.random().toString(36).slice(2, 8)}`, label: String(s.label).slice(0, 80), status: s.status || 'todo' }
          : { id: `s${Math.random().toString(36).slice(2, 8)}`, label: String(s).slice(0, 80), status: 'todo' }
      );
      const triggerMessageId =
        runInput && typeof runInput.triggerMessageId === 'string' && runInput.triggerMessageId.trim()
          ? runInput.triggerMessageId.trim()
          : undefined;
      await createAgentMessage({
        missionId,
        senderId: 'planner',
        senderType: 'agent',
        channel: 'main',
        text: payload.title || 'Plan updated',
        messageType: 'plan_update',
        payload: {
          title: (payload.title && String(payload.title).slice(0, MAX_TITLE_LEN)) || '2-week marketing plan',
          steps: stepsForPayload,
          assumptions: payload.assumptions,
          risks: payload.risks,
          executionSuggestions: Array.isArray(payload.executionSuggestions) ? payload.executionSuggestions.slice(0, 5) : undefined,
          ...(triggerMessageId && { triggerMessageId }),
        },
        visibleToUser: true,
      });
      return { ok: true };
    }
  } catch (err) {
    console.warn('[plannerExecutor] createAgentMessage failed:', err?.message || err);
    return { ok: false, error: err?.message || String(err) };
  }
  return { ok: false, error: 'Unknown plan type' };
}
