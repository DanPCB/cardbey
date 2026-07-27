/**
 * Post-mission LLM summary + follow-up suggestions, written to MissionBlackboard.
 */

import { llmGateway } from '../llm/llmGateway.ts';
import { appendEvent as missionBlackboardAppendEvent } from '../missionBlackboard.js';
import { getPrismaClient } from '../prisma.js';
import { planNextSteps } from './nextStepPlanner.js';

/** Normalized slugs that count as store / mini-website / create-store completions. */
const ALLOWED_MISSION_KINDS = new Set([
  'store',
  'create_store',
  'mini_website',
  'miniwebsite',
  'create_mini_website',
]);

const FALLBACK = {
  summary: "Your store is ready. Here's what you can do next:",
  suggestions: [
    { label: 'Upload logo & avatar →', prompt: 'I want to upload a logo and avatar for my store' },
    { label: 'Upload hero video →', prompt: 'I want to upload or change my store hero background video' },
    { label: 'Change headline →', prompt: 'I want to change my store headline and tagline' },
  ],
};

function normalizeMissionKind(raw) {
  if (raw == null) return '';
  let s = String(raw).trim();
  s = s.replace(/([a-z0-9])([A-Z])/g, '$1_$2');
  s = s
    .toLowerCase()
    .replace(/[-\s]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  return s;
}

/**
 * @param {string|null|undefined} missionType
 * @param {object|null|undefined} outputsJson
 * @param {object|null|undefined} metadataJson
 * @returns {'store'|'mini_website'|'create_store'|null}
 */
function resolveEligibleMissionType(missionType, outputsJson, metadataJson) {
  const o = outputsJson && typeof outputsJson === 'object' && !Array.isArray(outputsJson) ? outputsJson : {};
  const meta =
    metadataJson && typeof metadataJson === 'object' && !Array.isArray(metadataJson) ? metadataJson : {};

  const candidates = [
    missionType,
    o.missionType,
    meta.missionType,
    o.mode,
    meta.mode,
  ];

  for (const raw of candidates) {
    const n = normalizeMissionKind(raw);
    if (!n || !ALLOWED_MISSION_KINDS.has(n)) continue;
    if (n === 'miniwebsite' || n === 'create_mini_website') return 'mini_website';
    return /** @type {'store'|'mini_website'|'create_store'} */ (n);
  }
  return null;
}

function buildContextString(outputsJson) {
  const o = outputsJson && typeof outputsJson === 'object' && !Array.isArray(outputsJson) ? outputsJson : {};
  const pick = (k) => {
    const v = o[k];
    return typeof v === 'string' && v.trim() ? v.trim() : null;
  };
  const parts = [];
  const storeName = pick('storeName') || pick('businessName') || pick('name');
  const storeType = pick('storeType') || pick('businessType') || pick('vertical');
  const draftId = pick('draftId');
  const generationRunId = pick('generationRunId');
  if (storeName) parts.push(`storeName: ${storeName}`);
  if (storeType) parts.push(`storeType: ${storeType}`);
  if (draftId) parts.push(`draftId: ${draftId}`);
  if (generationRunId) parts.push(`generationRunId: ${generationRunId}`);
  return parts.length ? parts.join('; ') : 'minimal context';
}

function stripJsonFences(text) {
  return String(text ?? '')
    .replace(/^```json\s*/im, '')
    .replace(/^```\s*/im, '')
    .replace(/```\s*$/im, '')
    .trim();
}

function parseSummaryOnly(text) {
  try {
    const cleaned = stripJsonFences(text);
    const parsed = cleaned ? JSON.parse(cleaned) : null;
    if (!parsed || typeof parsed !== 'object') return null;
    const summary =
      typeof parsed.summary === 'string' && parsed.summary.trim() ? parsed.summary.trim() : null;
    return summary;
  } catch {
    return null;
  }
}

function parseSummaryPayload(text) {
  try {
    const cleaned = stripJsonFences(text);
    const parsed = cleaned ? JSON.parse(cleaned) : null;
    if (!parsed || typeof parsed !== 'object') return null;
    const summary =
      typeof parsed.summary === 'string' && parsed.summary.trim() ? parsed.summary.trim() : null;
    const rawSug = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];
    const suggestions = rawSug
      .filter(
        (s) =>
          s &&
          typeof s === 'object' &&
          typeof s.label === 'string' &&
          s.label.trim() &&
          typeof s.prompt === 'string' &&
          s.prompt.trim(),
      )
      .slice(0, 3)
      .map((s) => ({ label: s.label.trim(), prompt: s.prompt.trim() }));
    if (!summary || suggestions.length < 3) return null;
    return { summary, suggestions };
  } catch {
    return null;
  }
}
/**
 * @param {string} label
 * @returns {string}
 */
function resolveSuggestedTool(label) {
  const l = String(label ?? '').toLowerCase();
  if (l.includes('logo') || l.includes('avatar')) return 'upload_store_asset';
  if (l.includes('headline') || l.includes('tagline') || l.includes('title')) return 'change_hero_headline';
  if (l.includes('hero') || l.includes('banner') || l.includes('video')) return 'update_store_hero';
  if (l.includes('menu') || l.includes('product') || l.includes('catalog')) return 'replace_store_catalog';
  if (l.includes('publish')) return 'publish_store';
  if (l.includes('campaign') || l.includes('market')) return 'market_research';
  return 'general_chat';
}

async function appendNextActionHints(missionId, blackboard, result) {
  const mid = typeof missionId === 'string' ? missionId.trim() : '';
  if (!mid || !result?.suggestions?.length) return;

  const hintsPayload = {
    hints: result.suggestions.map((s) => ({
      label: s.label,
      prompt: s.prompt,
      suggestedTool: s.tool ?? resolveSuggestedTool(s.label),
      ...(s.actionId ? { actionId: s.actionId } : {}),
    })),
  };

  if (blackboard && typeof blackboard.appendEvent === 'function') {
    try {
      await blackboard.appendEvent({
        eventType: 'next_action_hints',
        payload: hintsPayload,
      });
      return;
    } catch (e) {
      console.warn('[postMissionSummary] next_action_hints blackboard.appendEvent failed:', e?.message || e);
    }
  }

  try {
    const res = await missionBlackboardAppendEvent(mid, 'next_action_hints', hintsPayload);
    if (!res?.ok) {
      console.warn('[postMissionSummary] missionBlackboard.appendEvent next_action_hints:', res?.error || 'not ok');
    }
  } catch (e) {
    console.warn('[postMissionSummary] next_action_hints append failed:', e?.message || e);
  }
}

async function appendCompletionEvent(missionId, blackboard, payload) {
  const mid = typeof missionId === 'string' ? missionId.trim() : '';
  if (!mid) return;

  if (blackboard && typeof blackboard.appendEvent === 'function') {
    try {
      await blackboard.appendEvent({
        eventType: 'completion_summary',
        payload: { summary: payload.summary, suggestions: payload.suggestions },
      });
      return;
    } catch (e) {
      console.warn('[postMissionSummary] blackboard.appendEvent failed:', e?.message || e);
    }
  }

  try {
    const res = await missionBlackboardAppendEvent(mid, 'completion_summary', {
      summary: payload.summary,
      suggestions: payload.suggestions,
    });
    if (!res?.ok) {
      console.warn('[postMissionSummary] missionBlackboard.appendEvent:', res?.error || 'not ok');
    }
  } catch (e) {
    console.warn('[postMissionSummary] missionBlackboard.appendEvent failed:', e?.message || e);
  }
}

/**
 * @param {object} opts
 * @param {string|null} opts.missionId
 * @param {string|null|undefined} opts.missionType
 * @param {object|null|undefined} opts.outputsJson
 * @param {object|null|undefined} [opts.metadataJson] — e.g. missionType / mode from pipeline metadata
 * @param {{ appendEvent?: (o: { eventType: string, payload: object }) => Promise<unknown> }|null|undefined} [opts.blackboard]
 */
export async function runPostMissionCompletionSummary({
  missionId,
  missionType,
  outputsJson,
  metadataJson,
  blackboard,
}) {
  // eslint-disable-next-line no-console
  console.log('[postMissionSummary] entered', { missionId, missionType });
  try {
    const mid = typeof missionId === 'string' ? missionId.trim() : '';
    if (!mid) return;

    const prisma = getPrismaClient();
    if (prisma?.missionBlackboard?.count) {
      const existing = await prisma.missionBlackboard
        .count({
          where: { missionId: mid, eventType: 'completion_summary' },
        })
        .catch(() => 0);
      if (existing > 0) {
        // eslint-disable-next-line no-console
        console.log('[postMissionSummary] skip duplicate — completion_summary already exists', { missionId: mid });
        return;
      }
    }

    const kind = resolveEligibleMissionType(missionType, outputsJson, metadataJson);
    console.log('[postMissionSummary] called', {
      missionId,
      missionType,
      resolvedKind: kind,
      outputsJsonKeys: Object.keys(outputsJson || {}),
    });
    if (!kind) {
      if (process.env.NODE_ENV !== 'production') {
        const meta =
          metadataJson && typeof metadataJson === 'object' && !Array.isArray(metadataJson) ? metadataJson : {};
        const o = outputsJson && typeof outputsJson === 'object' && !Array.isArray(outputsJson) ? outputsJson : {};
        console.warn('[postMissionSummary] skipped — type not in allowed set after normalize', {
          missionType,
          normalizedMission: normalizeMissionKind(missionType),
          outputsMissionType: o.missionType,
          metadataMissionType: meta.missionType,
          outputsMode: o.mode,
          metadataMode: meta.mode,
        });
      }
      return;
    }

    const contextString = buildContextString(outputsJson);

    let plannedSteps;
    try {
      plannedSteps = await planNextSteps({ missionId: mid, outputsJson, metadataJson });
    } catch (e) {
      console.warn('[postMissionSummary] planNextSteps failed:', e?.message || e);
      plannedSteps = FALLBACK.suggestions.map((s) => ({
        label: s.label,
        prompt: s.prompt,
        tool: resolveSuggestedTool(s.label),
      }));
    }

    const o = outputsJson && typeof outputsJson === 'object' && !Array.isArray(outputsJson) ? outputsJson : {};
    const tenantKey =
      (typeof o.tenantId === 'string' && o.tenantId.trim()) ||
      (typeof o.createdBy === 'string' && o.createdBy.trim()) ||
      `mission_completion:${mid}`;

    let summaryText = FALLBACK.summary;
    try {
      const { text } = await llmGateway.generate({
        purpose: 'mission_completion_summary',
        prompt: `You are Cardbey AI. A store mission just completed successfully.
Context: ${contextString}
Return ONLY JSON: {"summary":"One friendly sentence (max 22 words). No other keys."}`,
        tenantKey,
        responseFormat: 'json',
        maxTokens: 260,
        temperature: 0.35,
      });
      const s = parseSummaryOnly(text);
      if (s) summaryText = s;
    } catch (e) {
      console.warn('[postMissionSummary] summary llm failed:', e?.message || e);
    }

    const result = {
      summary: summaryText,
      suggestions: plannedSteps.map((s) => ({
        label: s.label,
        prompt: s.prompt,
        ...(s.tool ? { tool: s.tool } : {}),
        ...(s.actionId ? { actionId: s.actionId } : {}),
      })),
    };

    await appendCompletionEvent(mid, blackboard, result);
    await appendNextActionHints(mid, blackboard, result);
  } catch (e) {
    console.warn('[postMissionSummary] runPostMissionCompletionSummary failed:', e?.message || e);
  }
}
