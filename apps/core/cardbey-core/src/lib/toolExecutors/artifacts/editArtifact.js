/**
 * edit_artifact — LLM-assisted edits to durable copy (Promotion, Business, DraftStore preview).
 *
 * Extensibility: add new artifact kinds only in ARTIFACT_HANDLERS + ARTIFACT_KEYWORDS.
 */

import { getPrismaClient } from '../../../lib/prisma.js';
import { llmGateway } from '../../llm/llmGateway.ts';
import { syncMiniWebsiteHeroSectionInPreview } from '../../../services/storeContentPatchService.js';
import { searchPexelsImages, isPexelsAvailable } from '../../../services/menuVisualAgent/pexelsService.ts';

/** @typedef {'promotion' | 'store' | 'website' | 'hero' | 'sweep'} ArtifactKind */

const SWEEP_KINDS = /** @type {const} */ (['promotion', 'website', 'store', 'hero']);

/**
 * Keyword hints → artifact kind (first match wins). Order matters for overlaps.
 * @type {Array<{ kind: ArtifactKind, words: RegExp }>}
 */
const ARTIFACT_KEYWORDS = [
  { kind: 'promotion', words: /\b(promotion|promo|campaign\s+copy|banner\s+copy|cta\s+text|badge)\b/i },
  { kind: 'website', words: /\b(mini[\s-]?website|website\s+sections?|landing\s+page\s+copy|site\s+copy)\b/i },
  {
    kind: 'hero',
    words:
      /\b(hero\s+image|hero\s+photo|banner\s+image|change\s+.*\b(image|photo|picture)\b|swap\s+.*\b(photo|image|picture)\b|background\s+image|stock\s+photo|from\s+pexels)\b/i,
  },
  { kind: 'hero', words: /\b(hero\s+text|storefront\s+hero|hero\s+headline)\b/i },
  { kind: 'store', words: /\b(store\s+name|business\s+name|tagline|store\s+description|about\s+us)\b/i },
];

/**
 * True when the instruction is about changing an image, not hero copy text.
 */
function isImageEditIntent(editIntent = '') {
  return /image|photo|picture|banner|background|visual|graphic|illustration|shot/i.test(
    String(editIntent ?? ''),
  );
}

/**
 * Strip action words; keep subject/style for Pexels.
 */
function buildImageSearchQuery(editIntent = '', storeCategory = '') {
  const cleaned = String(editIntent ?? '')
    .replace(/change|update|swap|replace|use|set|make|add|new|hero|image|photo|banner|to|the|a|an/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || String(storeCategory ?? '').trim() || 'business lifestyle';
}

async function commitHeroImageUrl({ prisma, storeId, userId, selectedImageUrl }) {
  const url = String(selectedImageUrl ?? '').trim();
  if (!url) return { ok: false, reason: 'missing_url' };
  const row = await prisma.business.findFirst({
    where: { id: storeId, userId },
    select: { id: true },
  });
  if (!row) return { ok: false, reason: 'not_found' };
  await prisma.business.update({
    where: { id: row.id },
    data: { heroImageUrl: url },
  });
  return { ok: true, artifactId: row.id };
}

function parseJsonObjectFromLlm(text) {
  const t = String(text ?? '').trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(t.slice(start, end + 1));
  } catch {
    return null;
  }
}

function mergeHeroCtaLabel(preview, ctaText) {
  const t = ctaText != null ? String(ctaText).trim() : '';
  if (!t) return preview;
  const w = preview.website;
  if (!w || typeof w !== 'object' || Array.isArray(w) || !Array.isArray(w.sections)) return preview;
  const nextSections = w.sections.map((sec) => {
    if (!sec || typeof sec !== 'object' || sec.type !== 'hero') return sec;
    const rawC = sec.content;
    const c =
      rawC && typeof rawC === 'object' && !Array.isArray(rawC) ? { ...rawC } : {};
    c.ctaLabel = t;
    return { ...sec, content: c };
  });
  return { ...preview, website: { ...w, sections: nextSections } };
}

function previewToWebsiteFields(preview) {
  const p = preview && typeof preview === 'object' && !Array.isArray(preview) ? preview : {};
  let headline = '';
  let subheadline = '';
  let ctaText = '';
  const w = p.website;
  if (w && typeof w === 'object' && !Array.isArray(w) && Array.isArray(w.sections)) {
    const hero = w.sections.find((s) => s && typeof s === 'object' && s.type === 'hero');
    const c =
      hero?.content && typeof hero.content === 'object' && !Array.isArray(hero.content)
        ? hero.content
        : {};
    headline = String(c.headline || p.storeName || '').trim();
    subheadline = String(c.subheadline || p.slogan || p.tagline || '').trim();
    ctaText = String(c.ctaLabel || c.ctaText || '').trim();
  }
  return {
    storeName: String(p.storeName ?? '').trim(),
    slogan: String(p.slogan ?? p.tagline ?? '').trim(),
    headline,
    subheadline,
    ctaText,
  };
}

async function findDraftForEdit(prisma, storeId, userId, preferredDraftId) {
  const pref = typeof preferredDraftId === 'string' ? preferredDraftId.trim() : '';
  const storeIdTrim = typeof storeId === 'string' ? storeId.trim() : '';

  let draft = null;
  if (pref && userId) {
    const orAccess = [{ ownerUserId: userId }];
    if (storeIdTrim) orAccess.push({ committedStoreId: storeIdTrim });
    draft = await prisma.draftStore
      .findFirst({
        where: {
          id: pref,
          status: { not: 'archived' },
          OR: orAccess,
        },
        select: { id: true, preview: true },
      })
      .catch(() => null);
  }

  if (!draft && userId) {
    draft = await prisma.draftStore
      .findFirst({
        where: { ownerUserId: userId, status: { not: 'archived' } },
        orderBy: { updatedAt: 'desc' },
        select: { id: true, preview: true },
      })
      .catch(() => null);
  }

  if (!draft && storeIdTrim) {
    draft = await prisma.draftStore
      .findFirst({
        where: { committedStoreId: storeIdTrim, status: { not: 'archived' } },
        orderBy: { updatedAt: 'desc' },
        select: { id: true, preview: true },
      })
      .catch(() => null);
  }

  return draft;
}

function inferArtifactKind(instruction) {
  const msg = String(instruction ?? '').trim();
  if (!msg) return null;
  for (const { kind, words } of ARTIFACT_KEYWORDS) {
    if (words.test(msg)) return kind;
  }
  return null;
}

async function buildLlmPatch({
  kind,
  currentFields,
  instruction,
  priorStepsContext,
  allowedKeys,
}) {
  const prior = String(priorStepsContext ?? '').trim().slice(0, 6000);
  const prompt = `You revise marketing copy for a live commerce product. Return ONLY valid JSON (no markdown).

Artifact type: ${kind}
Allowed JSON keys (include only keys you change): ${allowedKeys.join(', ')}

Current fields:
${JSON.stringify(currentFields, null, 2)}

User instruction:
${String(instruction ?? '').trim()}

Prior mission context (may be empty):
${prior || '(none)'}

Rules:
- Preserve meaning unless the user asks to change it.
- Keep tone appropriate for a small business storefront.
- Strings only; no null placeholders for unchanged fields — omit keys you do not change.`;

  const { text } = await llmGateway.generate({
    purpose: `edit_artifact:${kind}`,
    prompt,
    tenantKey: 'edit-artifact',
    maxTokens: 900,
    temperature: 0.25,
    responseFormat: 'json',
  });

  const patch = parseJsonObjectFromLlm(text);
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    return { patch: null, rawText: text };
  }
  const cleaned = {};
  for (const k of allowedKeys) {
    if (Object.prototype.hasOwnProperty.call(patch, k) && patch[k] != null) {
      cleaned[k] = String(patch[k]).trim();
    }
  }
  return { patch: Object.keys(cleaned).length ? cleaned : null, rawText: text };
}

/**
 * @type {Record<string, {
 *   allowedKeys: string[],
 *   load: (ctx: object) => Promise<{ id: string, record: object } | null>,
 *   currentFields: (record: object) => Record<string, string>,
 *   apply: (ctx: object, record: object, patch: Record<string, string>) => Promise<void>,
 * }>}
 */
const ARTIFACT_HANDLERS = {
  promotion: {
    allowedKeys: ['headline', 'description', 'ctaText', 'badgeText'],
    async load({ prisma, storeId, userId, artifactId }) {
      const biz = await prisma.business.findFirst({
        where: { id: storeId, userId },
        select: { id: true },
      });
      if (!biz) return null;
      const idTrim = typeof artifactId === 'string' ? artifactId.trim() : '';
      let row = null;
      if (idTrim) {
        row = await prisma.promotion.findFirst({
          where: { id: idTrim, storeId },
        });
      } else {
        row = await prisma.promotion.findFirst({
          where: { storeId },
          orderBy: { updatedAt: 'desc' },
        });
      }
      if (!row) return null;
      return { id: row.id, record: row };
    },
    currentFields(row) {
      const meta =
        row.metadataJson && typeof row.metadataJson === 'object' && !Array.isArray(row.metadataJson)
          ? row.metadataJson
          : {};
      const badge =
        typeof meta.badgeText === 'string'
          ? meta.badgeText
          : typeof meta.badge === 'string'
            ? meta.badge
            : '';
      return {
        headline: String(row.title ?? '').trim(),
        description: String(row.message ?? '').trim(),
        ctaText: String(row.ctaLabel ?? '').trim(),
        badgeText: String(badge).trim(),
      };
    },
    async apply({ prisma }, row, patch) {
      const data = {};
      if (patch.headline) data.title = patch.headline;
      if (patch.description) data.message = patch.description;
      if (patch.ctaText) data.ctaLabel = patch.ctaText;
      if (patch.badgeText) {
        const prev =
          row.metadataJson && typeof row.metadataJson === 'object' && !Array.isArray(row.metadataJson)
            ? row.metadataJson
            : {};
        data.metadataJson = { ...prev, badgeText: patch.badgeText };
      }
      if (Object.keys(data).length === 0) return;
      await prisma.promotion.update({ where: { id: row.id }, data });
    },
  },

  store: {
    allowedKeys: ['storeName', 'description', 'tagline'],
    async load({ prisma, storeId, userId }) {
      const row = await prisma.business.findFirst({
        where: { id: storeId, userId },
      });
      if (!row) return null;
      return { id: row.id, record: row };
    },
    currentFields(row) {
      return {
        storeName: String(row.name ?? '').trim(),
        description: String(row.description ?? '').trim(),
        tagline: String(row.tagline ?? '').trim(),
      };
    },
    async apply({ prisma }, row, patch) {
      const data = {};
      if (patch.storeName) data.name = patch.storeName;
      if (patch.description) data.description = patch.description;
      if (patch.tagline) data.tagline = patch.tagline;
      if (Object.keys(data).length === 0) return;
      await prisma.business.update({ where: { id: row.id }, data });
    },
  },

  hero: {
    allowedKeys: ['headline', 'subheadline'],
    async load({ prisma, storeId, userId }) {
      const row = await prisma.business.findFirst({
        where: { id: storeId, userId },
      });
      if (!row) return null;
      return { id: row.id, record: row };
    },
    currentFields(row) {
      return {
        headline: String(row.heroText ?? '').trim(),
        subheadline: String(row.tagline ?? '').trim(),
      };
    },
    async apply({ prisma }, row, patch) {
      const data = {};
      if (patch.headline) data.heroText = patch.headline;
      if (patch.subheadline) data.tagline = patch.subheadline;
      if (Object.keys(data).length === 0) return;
      await prisma.business.update({ where: { id: row.id }, data });
    },
  },

  website: {
    allowedKeys: ['storeName', 'slogan', 'headline', 'subheadline', 'ctaText'],
    async load(ctx) {
      const { prisma, storeId, userId, draftId } = ctx;
      const draft = await findDraftForEdit(prisma, storeId, userId, draftId);
      if (!draft) return null;
      return { id: draft.id, record: draft };
    },
    currentFields(row) {
      const preview =
        row.preview && typeof row.preview === 'object' && !Array.isArray(row.preview)
          ? row.preview
          : {};
      return previewToWebsiteFields(preview);
    },
    async apply({ prisma }, row, patch) {
      const preview =
        row.preview && typeof row.preview === 'object' && !Array.isArray(row.preview)
          ? row.preview
          : {};
      let next = { ...preview };
      if (patch.storeName) next.storeName = patch.storeName;
      if (patch.slogan) {
        next.slogan = patch.slogan;
        next.tagline = patch.slogan;
      }
      if (patch.headline || patch.subheadline) {
        next = syncMiniWebsiteHeroSectionInPreview(next, {
          headline: patch.headline,
          subheadline: patch.subheadline,
        });
      }
      if (patch.ctaText) {
        next = mergeHeroCtaLabel(next, patch.ctaText);
      }
      await prisma.draftStore.update({
        where: { id: row.id },
        data: { preview: next },
      });
    },
  },
};

/** Keys registered for LLM edit-artifact flows (ReAct planner allowlist). */
export function getArtifactHandlerKinds() {
  return Object.keys(ARTIFACT_HANDLERS);
}

async function runOneKind(kind, basePayload) {
  const handler = ARTIFACT_HANDLERS[kind];
  if (!handler) {
    return { ok: false, artifactType: kind, reason: 'unknown_kind' };
  }

  const prisma = getPrismaClient();
  const ctx = { ...basePayload, prisma };
  let loaded;
  try {
    loaded = await handler.load(ctx);
  } catch (e) {
    return {
      ok: false,
      artifactType: kind,
      reason: 'load_failed',
      message: e?.message || String(e),
    };
  }

  if (!loaded) {
    return { ok: false, artifactType: kind, reason: 'not_found' };
  }

  const current = handler.currentFields(loaded.record);
  const { patch, rawText } = await buildLlmPatch({
    kind,
    currentFields: current,
    instruction: basePayload.instruction,
    priorStepsContext: basePayload.priorStepsContext,
    allowedKeys: handler.allowedKeys,
  });

  if (!patch) {
    return {
      ok: false,
      artifactType: kind,
      reason: 'no_llm_patch',
      debug: process.env.NODE_ENV !== 'production' ? String(rawText ?? '').slice(0, 400) : undefined,
    };
  }

  try {
    await handler.apply(ctx, loaded.record, patch);
  } catch (e) {
    return {
      ok: false,
      artifactType: kind,
      reason: 'apply_failed',
      message: e?.message || String(e),
    };
  }

  return {
    ok: true,
    artifactType: kind,
    artifactId: loaded.id,
    before: current,
    patch,
  };
}

/**
 * @param {object} input
 * @param {object} [context]
 */
export async function execute(input = {}, context = {}) {
  const rawStore = input?.storeId ?? context?.storeId;
  const storeId =
    typeof rawStore === 'string' ? rawStore.trim() : rawStore != null ? String(rawStore).trim() : '';
  const userIdRaw = context?.userId ?? context?.user?.id;
  const userId =
    typeof userIdRaw === 'string' ? userIdRaw.trim() : userIdRaw != null ? String(userIdRaw).trim() : '';

  if (!storeId) {
    return {
      status: 'failed',
      error: { code: 'STORE_ID_REQUIRED', message: 'edit_artifact requires storeId' },
    };
  }
  if (!userId) {
    return {
      status: 'failed',
      error: { code: 'USER_ID_REQUIRED', message: 'edit_artifact requires an authenticated user context' },
    };
  }

  const prisma = getPrismaClient();
  const confirmImage =
    input?.confirmImageSelection === true ||
    input?.confirmImageSelection === 'true' ||
    String(input?.confirmImageSelection ?? '').toLowerCase() === 'true';
  const selectedUrlRaw = String(input?.selectedImageUrl ?? '').trim();

  if (confirmImage && selectedUrlRaw) {
    const committed = await commitHeroImageUrl({
      prisma,
      storeId,
      userId,
      selectedImageUrl: selectedUrlRaw,
    });
    if (!committed.ok) {
      return {
        status: 'failed',
        error: {
          code: 'HERO_IMAGE_COMMIT_FAILED',
          message:
            committed.reason === 'not_found'
              ? 'Store not found or access denied'
              : 'Could not save hero image',
          details: committed,
        },
        output: {
          tool: 'edit_artifact',
          phase: 'failed',
          artifactType: 'hero',
        },
      };
    }
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[editArtifact] hero image committed id=${committed.artifactId}`);
    }
    return {
      status: 'ok',
      output: {
        tool: 'edit_artifact',
        phase: 'done',
        artifactType: 'hero',
        artifactId: committed.artifactId,
        patchedFields: ['heroImageUrl'],
        message: 'Hero image updated successfully.',
        imageUrl: selectedUrlRaw,
        storeId,
      },
    };
  }

  const instruction = String(input?.instruction ?? input?.description ?? '').trim();
  if (!instruction) {
    return {
      status: 'failed',
      error: { code: 'INSTRUCTION_REQUIRED', message: 'edit_artifact requires instruction (or description)' },
    };
  }

  let artifactType = String(input?.artifactType ?? input?.targetScope ?? '').trim().toLowerCase();
  if (artifactType === 'business') {
    artifactType = 'store';
  }
  if (artifactType === 'sweep' || artifactType === 'all') {
    artifactType = 'sweep';
  } else if (!artifactType || artifactType === 'auto') {
    artifactType = inferArtifactKind(instruction) || 'sweep';
  }

  const priorStepsContext =
    typeof input?.priorStepsContext === 'string' && input.priorStepsContext.trim()
      ? input.priorStepsContext.trim()
      : typeof context?.priorStepsContext === 'string' && context.priorStepsContext.trim()
        ? context.priorStepsContext.trim()
        : '';

  const draftId = input?.draftId ?? input?.websiteDraftId ?? context?.draftId ?? null;
  const artifactId = input?.artifactId ?? input?.promotionId ?? null;

  const basePayload = {
    storeId,
    userId,
    instruction,
    priorStepsContext,
    draftId,
    artifactId,
  };

  const storeCategory = String(input?.storeCategory ?? '').trim();

  if (artifactType === 'hero' && isImageEditIntent(instruction)) {
    const query = buildImageSearchQuery(instruction, storeCategory);
    if (!isPexelsAvailable()) {
      return {
        status: 'failed',
        error: {
          code: 'PEXELS_UNAVAILABLE',
          message: 'Image search is not available right now. Please upload an image instead.',
        },
        output: {
          tool: 'edit_artifact',
          phase: 'image_search_failed',
          artifactType: 'hero',
          error: 'pexels_unavailable',
          searchQuery: query,
        },
      };
    }
    let results;
    try {
      results = await searchPexelsImages(query, 3);
    } catch (e) {
      return {
        status: 'failed',
        error: { code: 'PEXELS_SEARCH_ERROR', message: e?.message || String(e) },
        output: { tool: 'edit_artifact', phase: 'image_search_failed', artifactType: 'hero' },
      };
    }
    if (!results.length) {
      return {
        status: 'failed',
        error: {
          code: 'PEXELS_NO_RESULTS',
          message: `No photos found for "${query}". Try a different description.`,
        },
        output: {
          tool: 'edit_artifact',
          phase: 'image_search_failed',
          artifactType: 'hero',
          error: 'no_results',
          searchQuery: query,
        },
      };
    }
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[editArtifact] type=hero image search query="${query}" limit=3 count=${results.length}`);
    }
    return {
      status: 'ok',
      output: {
        tool: 'edit_artifact',
        phase: 'image_search_results',
        artifactType: 'hero',
        searchQuery: query,
        storeId,
        images: results.map((r) => ({
          url: r.url,
          thumb: r.thumbnailUrl || r.url,
          photographer: r.photographer ?? '',
          photographerUrl: r.photographerUrl ?? '',
          licenseNote: 'Free to use (Pexels)',
        })),
        message: `Found ${results.length} photos. Pick one to use as your hero image.`,
      },
    };
  }

  if (artifactType === 'sweep') {
    const settled = await Promise.allSettled(SWEEP_KINDS.map((k) => runOneKind(k, basePayload)));
    const summary = settled.map((r, i) =>
      r.status === 'fulfilled' ? r.value : { ok: false, artifactType: SWEEP_KINDS[i], reason: String(r.reason) },
    );
    const anyOk = summary.some((s) => s.ok);
    return {
      status: anyOk ? 'ok' : 'failed',
      ...(anyOk
        ? {}
        : {
            error: {
              code: 'EDIT_ARTIFACT_SWEEP_NONE',
              message: 'No artifact types could be updated for this sweep',
            },
          }),
      output: {
        mode: 'sweep',
        ok: anyOk,
        summary,
        appliedKinds: summary.filter((s) => s.ok).map((s) => s.artifactType),
      },
    };
  }

  if (!ARTIFACT_HANDLERS[artifactType]) {
    return {
      status: 'failed',
      error: {
        code: 'INVALID_ARTIFACT_TYPE',
        message: `Unknown artifactType: ${artifactType}. Use promotion|store|website|hero|sweep (business is treated as store).`,
      },
    };
  }

  const single = await runOneKind(artifactType, basePayload);
  if (!single.ok) {
    return {
      status: 'failed',
      error: {
        code: 'EDIT_ARTIFACT_FAILED',
        message: single.reason || 'edit failed',
        details: single,
      },
      output: single,
    };
  }

  return {
    status: 'ok',
    output: {
      mode: 'single',
      ...single,
    },
  };
}
