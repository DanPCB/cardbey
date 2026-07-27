/**
 * LLM: current mini-website sections + user intent → minimal patch list.
 */

import { llmGateway } from './llm/llmGateway.ts';

const SYSTEM_SECTION = `You are a mini website editor.
Given the current website sections as JSON and a user's edit request,
return ONLY the sections that need to change and ONLY the content fields that change.

Output format (JSON only, no prose):
{
  "patches": [
    { "type": "hero", "content": { "headline": "New headline" } }
  ],
  "theme": { "templateId": "bold" }
}

Use "theme": null if the theme is unchanged.

Rules:
- Minimal changes only — do not rewrite unchanged sections
- Preserve all existing content fields not mentioned in the request
- Valid section types: hero, usp_bar, featured, catalog, social_proof, about, contact
- Valid templateIds: minimal, bold, editorial, warm, dark_luxury`;

function stripJsonFences(raw) {
  let t = String(raw ?? '').trim();
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  return t;
}

/**
 * @param {{
 *   currentSections: unknown;
 *   userIntent: string;
 *   tenantKey?: string;
 * }} args
 * @returns {Promise<{ patches: Array<{ type: string, content: object }>, theme: object | null }>}
 */
export async function generateSectionPatches({ currentSections, userIntent, tenantKey = 'default' }) {
  const intent = String(userIntent ?? '').trim();
  if (!intent) {
    throw new Error('generateSectionPatches: userIntent is required');
  }

  const userBlock = `Current sections:
${JSON.stringify(currentSections ?? [], null, 2)}

User request: ${intent}`;

  const prompt = `${SYSTEM_SECTION}

${userBlock}`;

  const model = process.env.MINI_WEBSITE_PATCH_MODEL?.trim() || process.env.AGENT_LLM_MODEL?.trim() || 'grok-3-beta';
  const provider = process.env.MINI_WEBSITE_PATCH_PROVIDER?.trim() || process.env.AGENT_LLM_PROVIDER?.trim() || 'xai';

  const result = await llmGateway.generate({
    purpose: 'mini_website_section_patch',
    prompt,
    model,
    provider,
    tenantKey,
    maxTokens: 2000,
    temperature: 0.25,
    responseFormat: 'json',
  });

  const raw = stripJsonFences(result?.text ?? '');
  let parsed;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    throw new Error('generateSectionPatches: LLM returned invalid JSON');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('generateSectionPatches: LLM returned invalid payload');
  }

  const patchesRaw = Array.isArray(parsed.patches) ? parsed.patches : [];
  const patches = patchesRaw
    .filter((p) => p && typeof p === 'object' && String(p.type || '').trim())
    .map((p) => ({
      type: String(p.type).trim(),
      content: p.content && typeof p.content === 'object' && !Array.isArray(p.content) ? p.content : {},
    }));

  const theme = parsed.theme === null || parsed.theme === undefined ? null : parsed.theme;

  return { patches, theme };
}

const SECTION_LABEL_DEFAULTS = {
  hero: 'Hero',
  usp_bar: 'Value props',
  featured: 'Featured',
  catalog: 'Catalog',
  social_proof: 'Social proof',
  about: 'About',
  contact: 'Contact',
};

/**
 * Build a WebsitePatchProposal-shaped payload for the performer UI (before/after per section).
 * @param {{
 *   storeId: string;
 *   storeName: string;
 *   slug: string;
 *   currentSections: unknown;
 *   currentTheme: unknown;
 *   patches: Array<{ type: string; content: object }>;
 *   theme: object | null;
 *   missionId: string;
 * }} args
 */
export function buildPatchProposal({
  storeId,
  storeName,
  slug,
  currentSections,
  currentTheme,
  patches,
  theme,
  missionId,
}) {
  const list = Array.isArray(currentSections) ? currentSections : [];
  const byType = new Map();
  for (const s of list) {
    if (s && typeof s === 'object' && s.type != null) {
      byType.set(String(s.type).trim(), s);
    }
  }

  const patchList = Array.isArray(patches) ? patches : [];
  const outPatches = [];
  for (const p of patchList) {
    if (!p || typeof p !== 'object') continue;
    const st = String(p.type || '').trim();
    if (!st) continue;
    const existing = byType.get(st);
    const beforeContent =
      existing && existing.content && typeof existing.content === 'object' && !Array.isArray(existing.content)
        ? { ...existing.content }
        : {};
    const delta = p.content && typeof p.content === 'object' && !Array.isArray(p.content) ? p.content : {};
    const afterContent = { ...beforeContent, ...delta };
    outPatches.push({
      sectionType: st,
      label: SECTION_LABEL_DEFAULTS[st] ?? st,
      before: beforeContent,
      after: afterContent,
      isNew: !existing,
    });
  }

  return {
    type: 'website_patch_proposal',
    storeId: String(storeId ?? '').trim(),
    storeName: String(storeName ?? '').trim(),
    slug: String(slug ?? '').trim(),
    patches: outPatches,
    theme: theme === undefined ? null : theme,
    previousTheme: currentTheme === undefined ? null : currentTheme,
    missionId: String(missionId ?? '').trim(),
  };
}
