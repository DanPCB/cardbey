/**
 * Creative Factory V2 — built-in stage handlers (research → script → asset search → video plan).
 */

import { dispatchTool } from '../toolDispatcher.js';
import { getPrismaClient } from '../prisma.js';
import { llmGateway } from '../llm/llmGateway.ts';
import {
  emitCreativeFactoryAssetSearchCompleted,
  emitCreativeFactoryResearchCompleted,
  emitCreativeFactoryScriptCompleted,
  emitCreativeFactoryVideoPlanReady,
} from './factoryTelemetry.js';

/**
 * @param {object} stage
 * @param {object} state
 * @param {object} definition
 * @param {object} [ownedCtx]
 */
export async function runCreativeFactoryV2BuiltinStage(stage, state, definition, ownedCtx) {
  switch (stage.stageId) {
    case 'research':
      return runResearchStage(state, ownedCtx);
    case 'script':
      return runScriptStage(state, ownedCtx);
    case 'asset_search':
      return runAssetSearchStage(state, ownedCtx);
    case 'video_plan':
      return runVideoPlanStage(state, ownedCtx);
    default:
      return { ok: false, error: { code: 'unknown_builtin_stage', message: `Unknown V2 stage: ${stage.stageId}` } };
  }
}

/**
 * @param {object} state
 * @param {object} ctx
 */
async function loadStoreContext(state, ctx) {
  const storeId =
    (typeof state.context?.storeId === 'string' && state.context.storeId.trim()) ||
    (typeof ctx?.storeId === 'string' && ctx.storeId.trim()) ||
    null;
  if (!storeId) {
    return {
      storeId: null,
      storeName: String(state.context?.storeName ?? 'Your store').trim() || 'Your store',
      category: String(state.context?.category ?? '').trim(),
      heroImageUrl: null,
      products: [],
    };
  }
  try {
    const prisma = getPrismaClient();
    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: {
        id: true,
        name: true,
        category: true,
        heroImageUrl: true,
        products: { take: 8, select: { id: true, name: true, category: true, imageUrl: true } },
      },
    });
    return {
      storeId,
      storeName: store?.name?.trim() || 'Your store',
      category: store?.category?.trim() || '',
      heroImageUrl: store?.heroImageUrl?.trim() || null,
      products: Array.isArray(store?.products) ? store.products : [],
    };
  } catch {
    return {
      storeId,
      storeName: String(state.context?.storeName ?? 'Your store').trim() || 'Your store',
      category: '',
      heroImageUrl: null,
      products: [],
    };
  }
}

/**
 * @param {string} intent
 */
function inferSeasonalHook(intent) {
  const q = String(intent ?? '').toLowerCase();
  if (/\b(christmas|holiday|festive|winter)\b/.test(q)) return 'Holiday season warmth and gifting';
  if (/\b(summer|beach|sun)\b/.test(q)) return 'Summer energy and seasonal refresh';
  if (/\b(spring|easter)\b/.test(q)) return 'Spring renewal and fresh starts';
  if (/\b(fall|autumn|back to school)\b/.test(q)) return 'Autumn comfort and back-to-routine';
  const month = new Date().getMonth();
  if (month === 11 || month === 0) return 'Year-end celebration and fresh starts';
  if (month >= 5 && month <= 7) return 'Mid-year momentum and seasonal appeal';
  return 'Timely local promotion for your community';
}

/**
 * @param {object} state
 * @param {object} ctx
 */
export async function runResearchStage(state, ctx) {
  const store = await loadStoreContext(state, ctx);
  const intent = String(state.intent ?? '').trim();
  let researchBrief = null;
  let source = 'fallback';

  if (store.storeId) {
    try {
      const result = await dispatchTool(
        'market_research',
        { storeId: store.storeId, focus: intent || 'promotional video' },
        ctx,
      );
      if (result?.status === 'ok') {
        const mr = result.output?.marketReport ?? result.output ?? {};
        researchBrief = mapMarketReportToResearchBrief(mr, store, intent);
        source = 'market_research';
      }
    } catch {
      /* fallback below */
    }
  }

  if (!researchBrief) {
    researchBrief = buildDeterministicResearchBrief(store, intent);
    source = 'deterministic_fallback';
  }

  emitCreativeFactoryResearchCompleted({
    factoryId: state.factoryId,
    missionId: state.missionId,
    userId: state.userId,
    source,
    executionId: state.executionId,
  });

  return { ok: true, output: { researchBrief, source } };
}

/**
 * @param {object} mr
 * @param {object} store
 * @param {string} intent
 */
export function mapMarketReportToResearchBrief(mr, store, intent) {
  const audience =
    String(mr?.targetAudience ?? mr?.audienceProfile?.primarySegment ?? '').trim() ||
    'Local customers who value quality and convenience';
  const offerAngle =
    String(mr?.marketContext?.recommendedCampaignAngle ?? '').trim() ||
    String(mr?.recommendations?.[0] ?? '').trim() ||
    `Highlight what makes ${store.storeName} stand out`;
  const topProduct = Array.isArray(mr?.topProductsToPromote) ? mr.topProductsToPromote[0] : null;
  const productFocus =
    String(topProduct?.productName ?? store.products?.[0]?.name ?? store.category ?? store.storeName).trim() ||
    store.storeName;

  return {
    audience,
    offerAngle,
    seasonalHook:
      String(mr?.marketContext?.seasonalOpportunity ?? '').trim() || inferSeasonalHook(intent),
    productServiceFocus: productFocus,
    recommendedTone: String(mr?.audienceProfile?.buyingMotivation ?? 'warm and trustworthy').trim() || 'warm and trustworthy',
    visualDirection:
      String(mr?.marketContext?.categoryTrend ?? '').trim() ||
      'Clean storefront shots, hero product close-ups, inviting warm lighting',
    summary: String(mr?.summary ?? offerAngle).trim() || offerAngle,
    source: 'market_research',
  };
}

/**
 * @param {object} store
 * @param {string} intent
 */
export function buildDeterministicResearchBrief(store, intent) {
  const productFocus =
    store.products?.[0]?.name?.trim() || store.category?.trim() || store.storeName;
  return {
    audience: 'Local shoppers and returning customers in your area',
    offerAngle: intent.trim()
      ? `Promote: ${intent.slice(0, 120)}`
      : `Show why ${store.storeName} is worth a visit today`,
    seasonalHook: inferSeasonalHook(intent),
    productServiceFocus: productFocus,
    recommendedTone: 'friendly, confident, and welcoming',
    visualDirection: 'Storefront hero, product highlights, warm natural lighting',
    summary: `Research brief for ${store.storeName} — ${productFocus}`,
    source: 'deterministic_fallback',
  };
}

/**
 * @param {object} state
 * @param {object} ctx
 */
export async function runScriptStage(state, ctx) {
  const store = await loadStoreContext(state, ctx);
  const researchBrief = state.stageOutputs?.research?.researchBrief ?? {};
  const intent = String(state.intent ?? '').trim();
  let scriptDraft = null;
  let source = 'template_fallback';

  try {
    const llmResult = await llmGateway.generate({
      purpose: 'creative_factory_v2_script',
      tenantKey: ctx?.userId ?? state.userId ?? 'system',
      responseFormat: 'json',
      maxTokens: 1200,
      temperature: 0.6,
      prompt: [
        'You are a promotional video scriptwriter. Return raw JSON only with keys:',
        'hook, scenes (array of 3 with id, shot, durationSec, narration), voiceoverCopy, cta, onScreenText (array of strings).',
        JSON.stringify({
          storeName: store.storeName,
          intent,
          audience: researchBrief.audience,
          offerAngle: researchBrief.offerAngle,
          tone: researchBrief.recommendedTone,
          productFocus: researchBrief.productServiceFocus,
        }),
      ].join('\n'),
    });
    const parsed = parseJsonSafe(llmResult?.text ?? '');
    if (parsed?.hook && Array.isArray(parsed.scenes) && parsed.scenes.length >= 3) {
      scriptDraft = normalizeScriptDraft(parsed, store.storeName);
      source = 'llm_gateway';
    }
  } catch {
    /* template fallback */
  }

  if (!scriptDraft) {
    try {
      const toolResult = await dispatchTool(
        'generate_video_script',
        {
          style: 'promotional',
          duration: 30,
          mood: researchBrief.recommendedTone ?? 'warm',
          storeName: store.storeName,
          brandTone: researchBrief.recommendedTone ?? 'friendly',
        },
        ctx,
      );
      if (toolResult?.status === 'ok') {
        scriptDraft = mapToolScriptToDraft(toolResult.output ?? {}, store.storeName, researchBrief);
        source = 'generate_video_script';
      }
    } catch {
      /* template fallback */
    }
  }

  if (!scriptDraft) {
    scriptDraft = buildTemplateScriptDraft(store, researchBrief, intent);
    source = 'template_fallback';
  }

  emitCreativeFactoryScriptCompleted({
    factoryId: state.factoryId,
    missionId: state.missionId,
    userId: state.userId,
    source,
    executionId: state.executionId,
  });

  return { ok: true, output: { scriptDraft, source } };
}

/**
 * @param {object} parsed
 * @param {string} storeName
 */
export function normalizeScriptDraft(parsed, storeName) {
  const scenes = parsed.scenes.slice(0, 3).map((s, i) => ({
    id: s.id ?? i + 1,
    shot: String(s.shot ?? s.narration ?? `Scene ${i + 1}`).trim(),
    durationSec: Number(s.durationSec) || 5,
    narration: String(s.narration ?? s.shot ?? '').trim(),
  }));
  return {
    hook: String(parsed.hook ?? `Discover ${storeName}`).trim(),
    scenes,
    voiceoverCopy: String(parsed.voiceoverCopy ?? parsed.voiceover ?? parsed.hook ?? '').trim(),
    cta: String(parsed.cta ?? `Visit ${storeName} today`).trim(),
    onScreenText: Array.isArray(parsed.onScreenText)
      ? parsed.onScreenText.map((t) => String(t)).filter(Boolean).slice(0, 6)
      : [String(parsed.hook ?? storeName).trim(), `Visit ${storeName}`],
    source: 'llm_gateway',
  };
}

/**
 * @param {object} toolOut
 * @param {string} storeName
 * @param {object} researchBrief
 */
export function mapToolScriptToDraft(toolOut, storeName, researchBrief) {
  const script = String(toolOut.script ?? '').trim();
  const scenes = Array.isArray(toolOut.scenes)
    ? toolOut.scenes.slice(0, 3).map((s, i) => ({
        id: s.id ?? i + 1,
        shot: String(s.shot ?? '').trim(),
        durationSec: Number(s.durationSec) || 5,
        narration: script,
      }))
    : [];
  return {
    hook: script.split('.')[0]?.trim() || `Welcome to ${storeName}`,
    scenes,
    voiceoverCopy: String(toolOut.voiceover ?? script).trim(),
    cta: `Visit ${storeName} — ${researchBrief.offerAngle ?? 'see you soon'}`,
    onScreenText: [storeName, researchBrief.productServiceFocus ?? ''].filter(Boolean),
    source: 'generate_video_script',
  };
}

/**
 * @param {object} store
 * @param {object} researchBrief
 * @param {string} intent
 */
export function buildTemplateScriptDraft(store, researchBrief, intent) {
  const hook = `Meet ${store.storeName} — ${researchBrief.offerAngle ?? 'your next favorite stop'}`;
  const scenes = [
    { id: 1, shot: 'Storefront / logo reveal', durationSec: 4, narration: hook },
    {
      id: 2,
      shot: `Hero focus: ${researchBrief.productServiceFocus}`,
      durationSec: 12,
      narration: `${store.storeName} brings ${researchBrief.productServiceFocus} to the community.`,
    },
    {
      id: 3,
      shot: 'Call to action',
      durationSec: 5,
      narration: `Visit ${store.storeName} today.`,
    },
  ];
  return {
    hook,
    scenes,
    voiceoverCopy: [hook, scenes[1].narration, scenes[2].narration].join(' '),
    cta: `Visit ${store.storeName}`,
    onScreenText: [store.storeName, researchBrief.seasonalHook ?? '', 'Open now'].filter(Boolean),
    source: 'template_fallback',
    intentSnippet: intent.slice(0, 80),
  };
}

/**
 * @param {object} state
 * @param {object} ctx
 */
export async function runAssetSearchStage(state, ctx) {
  const store = await loadStoreContext(state, ctx);
  const researchBrief = state.stageOutputs?.research?.researchBrief ?? {};
  const query =
    `${store.storeName} ${researchBrief.productServiceFocus ?? ''} ${researchBrief.visualDirection ?? ''}`.trim();
  const candidates = [];

  if (store.heroImageUrl) {
    candidates.push({
      assetId: `store-hero:${store.storeId}`,
      url: store.heroImageUrl,
      type: 'image',
      provider: 'store',
      source: 'store_hero',
      relevanceReason: 'Current store hero image',
      usageRole: 'hero',
    });
  }

  for (const p of store.products ?? []) {
    if (!p?.imageUrl) continue;
    candidates.push({
      assetId: p.id ? `product:${p.id}` : undefined,
      url: p.imageUrl,
      type: 'image',
      provider: 'store_catalog',
      source: 'catalog',
      relevanceReason: `Catalog item: ${p.name}`,
      usageRole: 'product',
    });
    if (candidates.length >= 6) break;
  }

  try {
    const searchResult = await dispatchTool(
      'search_hero_media',
      { query, storeId: store.storeId, mediaType: 'photo', perPage: 6 },
      ctx,
    );
    if (searchResult?.status === 'ok') {
      const results = Array.isArray(searchResult.output?.results) ? searchResult.output.results : [];
      for (const r of results.slice(0, 4)) {
        const url = r?.url ?? r?.previewUrl ?? r?.src;
        if (!url) continue;
        candidates.push({
          assetId: r?.id ? `media:${r.id}` : undefined,
          url: String(url),
          type: String(r?.mediaType ?? 'image'),
          provider: String(r?.source ?? r?.provider ?? 'search_hero_media'),
          source: 'search_hero_media',
          relevanceReason: `Matched query: ${query.slice(0, 60)}`,
          usageRole: candidates.length === 0 ? 'hero' : 'supporting',
        });
      }
    }
  } catch {
    /* non-fatal */
  }

  const assetCandidates = dedupeAssetCandidates(candidates).slice(0, 8);

  emitCreativeFactoryAssetSearchCompleted({
    factoryId: state.factoryId,
    missionId: state.missionId,
    userId: state.userId,
    candidateCount: assetCandidates.length,
    executionId: state.executionId,
  });

  return { ok: true, output: { assetCandidates, query } };
}

/**
 * @param {Array<object>} list
 */
export function dedupeAssetCandidates(list) {
  const seen = new Set();
  const out = [];
  for (const c of list) {
    const key = `${c.url ?? ''}:${c.assetId ?? ''}`;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

/**
 * @param {object} state
 * @param {object} ctx
 */
export async function runVideoPlanStage(state, ctx) {
  const store = await loadStoreContext(state, ctx);
  const researchBrief = state.stageOutputs?.research?.researchBrief ?? buildDeterministicResearchBrief(store, state.intent);
  const scriptDraft = state.stageOutputs?.script?.scriptDraft ?? buildTemplateScriptDraft(store, researchBrief, state.intent);
  const assetCandidates = state.stageOutputs?.asset_search?.assetCandidates ?? [];
  const intent = String(state.intent ?? '').trim();

  const scenes = (scriptDraft.scenes ?? []).map((s, i) => ({
    id: s.id ?? i + 1,
    shot: s.shot,
    durationSec: s.durationSec ?? 5,
    narration: s.narration ?? '',
    suggestedAsset:
      assetCandidates.find((a) => a.usageRole === (i === 0 ? 'hero' : i === 1 ? 'product' : 'supporting')) ??
      assetCandidates[i] ??
      null,
  }));

  const durationSec = scenes.reduce((sum, s) => sum + (Number(s.durationSec) || 5), 0) || 30;
  const heroAsset = assetCandidates.find((a) => a.usageRole === 'hero') ?? assetCandidates[0] ?? null;

  const videoPlan = {
    schema: 'creative_factory_v2_video_plan',
    objective: researchBrief.offerAngle ?? `Promote ${store.storeName}`,
    audience: researchBrief.audience,
    scenePlan: scenes,
    selectedVisualDirection: researchBrief.visualDirection,
    script: scriptDraft.voiceoverCopy ?? scriptDraft.hook,
    hook: scriptDraft.hook,
    voiceoverCopy: scriptDraft.voiceoverCopy,
    cta: scriptDraft.cta,
    onScreenText: scriptDraft.onScreenText ?? [],
    estimatedDurationSec: durationSec,
    artifactType: 'generated_video',
    approvalSummary: [
      researchBrief.summary ?? researchBrief.offerAngle,
      `Audience: ${researchBrief.audience}`,
      `${scenes.length} scenes · ~${durationSec}s`,
      heroAsset ? `Hero visual: ${heroAsset.relevanceReason}` : 'AI-generated visuals',
    ]
      .filter(Boolean)
      .join(' · '),
    style: 'promotional',
    mood: researchBrief.recommendedTone ?? 'warm',
    duration: durationSec,
    scenes,
    storeName: store.storeName,
    storeId: store.storeId,
    assetCandidates,
    researchBrief,
    scriptDraft,
    userIntent: intent,
  };

  emitCreativeFactoryVideoPlanReady({
    factoryId: state.factoryId,
    missionId: state.missionId,
    userId: state.userId,
    executionId: state.executionId,
  });

  return { ok: true, output: { videoPlan, plan: videoPlan } };
}

/**
 * @param {string} raw
 */
function parseJsonSafe(raw) {
  try {
    let t = String(raw ?? '').trim();
    t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    return JSON.parse(t);
  } catch {
    return null;
  }
}
