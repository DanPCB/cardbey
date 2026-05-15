/**
 * Next-step planner: deterministic facts + policy; optional LLM for labels only.
 */

import { buildMissionFactSnapshot } from './buildMissionFactSnapshot.js';
import { evaluateNextStepPolicy } from './nextStepPolicy.js';
import { llmGateway } from '../llm/llmGateway.ts';

const FALLBACK_STEPS = [
  {
    tool: 'upload_store_asset',
    ui: 'logo_upload',
    label: 'Upload store logo →',
    prompt: 'I want to upload a logo for my store',
    rationale: 'Fallback suggestion',
  },
  {
    tool: 'replace_store_catalog',
    ui: 'product_import',
    label: 'Add real menu items →',
    prompt: 'I want to add my real products',
    rationale: 'Fallback suggestion',
  },
  {
    tool: 'update_store_hero',
    ui: 'hero_customizer',
    label: 'Change hero image →',
    prompt: 'I want to change my hero image',
    rationale: 'Fallback suggestion',
  },
];

/**
 * @param {import('./nextStepPolicy.js').NextStep[]} steps
 * @param {number} n
 */
function padSteps(steps, n = 3) {
  const out = steps.map((s) => ({ ...s }));
  const seen = new Set(out.map((s) => (s.actionId ? `${s.tool}:${s.actionId}` : s.tool)));
  for (const f of FALLBACK_STEPS) {
    if (out.length >= n) break;
    const k = f.tool;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ ...f });
  }
  return out.slice(0, n);
}

function stripJsonFences(text) {
  return String(text ?? '')
    .replace(/^```json\s*/im, '')
    .replace(/^```\s*/im, '')
    .replace(/```\s*$/im, '')
    .trim();
}

/**
 * @param {object} opts
 * @param {string|null|undefined} opts.missionId
 * @param {unknown} [opts.outputsJson]
 * @param {unknown} [opts.metadataJson]
 * @returns {Promise<Array<{ tool: string, ui: string | null, label: string, prompt: string, rationale?: string, actionId?: string }>>}
 */
export async function planNextSteps({ missionId, outputsJson, metadataJson }) {
  const mid = typeof missionId === 'string' ? missionId.trim() : '';
  if (!mid) return FALLBACK_STEPS.slice(0, 3);

  const facts = await buildMissionFactSnapshot({ missionId: mid, outputsJson, metadataJson });
  let policySteps = evaluateNextStepPolicy(facts, 3);
  if (policySteps.length === 0) {
    policySteps = [...FALLBACK_STEPS];
  }
  policySteps = padSteps(policySteps, 3);

  const o = outputsJson && typeof outputsJson === 'object' && !Array.isArray(outputsJson) ? outputsJson : {};
  const tenantKey =
    (typeof o.tenantId === 'string' && o.tenantId.trim()) ||
    (typeof o.createdBy === 'string' && o.createdBy.trim()) ||
    `mission_next_steps:${mid}`;

  try {
    const prompt = `You are Cardbey AI. Given store context and a fixed list of next actions, write a friendlier short label and user prompt for each.
Do NOT invent new tools or new actions. Keep the same order and length (${policySteps.length} items).

Store: ${facts.storeName ?? 'this store'} (${facts.storeType ?? 'business'})

Return ONLY a JSON array of ${policySteps.length} objects:
[{"label":"3-6 words ending with → where natural","prompt":"First-person user message"}, ...]

Actions (in order):
${JSON.stringify(
      policySteps.map((s) => ({ tool: s.tool, actionId: s.actionId ?? null, rationale: s.rationale ?? '' })),
      null,
      0,
    )}`;

    const { text } = await llmGateway.generate({
      purpose: 'next_step_label_writer',
      prompt,
      tenantKey,
      responseFormat: 'json',
      maxTokens: 220,
      temperature: 0.25,
    });
    const cleaned = stripJsonFences(text);
    const parsed = cleaned ? JSON.parse(cleaned) : null;
    if (Array.isArray(parsed) && parsed.length === policySteps.length) {
      return policySteps.map((s, i) => {
        const row = parsed[i] && typeof parsed[i] === 'object' ? parsed[i] : {};
        const label = typeof row.label === 'string' && row.label.trim() ? row.label.trim() : s.label;
        const userPrompt = typeof row.prompt === 'string' && row.prompt.trim() ? row.prompt.trim() : s.prompt;
        return { ...s, label, prompt: userPrompt };
      });
    }
  } catch {
    /* use policy copy */
  }

  return policySteps.slice(0, 3);
}
