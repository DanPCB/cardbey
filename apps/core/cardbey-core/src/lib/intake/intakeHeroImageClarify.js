/**
 * Hero / banner image change — deterministic detection + clarify chips (Intake V2).
 * Client-only tools __client_hero_* are handled in the dashboard without registry execution.
 */

/**
 * @param {string} userMessage
 */
export function isHeroImageChangeMessage(userMessage) {
  const raw = String(userMessage ?? '').trim();
  if (!raw) return false;
  const lower = raw.toLowerCase();

  if (/\b(hero|banner)\s+image\b/i.test(raw)) return true;
  if (/\bupdate\s+(the\s+)?hero\b/i.test(raw)) return true;
  if (/\breplace\s+(the\s+)?banner\b/i.test(raw)) return true;
  if (/\bchange\s+(the\s+)?(hero|banner)\b/i.test(raw)) return true;

  if (/\bchange\s+(the\s+)?(photo|picture)\b/i.test(raw)) {
    if (/\b(hero|banner|homepage|home\s*page|store\s*front|main\s+image|header)\b/i.test(lower)) return true;
  }

  if (/\b(different|another|other)\s+photo\b/i.test(lower) && /\b(hero|banner|image)\b/i.test(lower)) return true;

  return false;
}

/**
 * Prior user turns in `history` already established a hero/banner image edit (current message is separate).
 * @param {Array<{ role?: string, content?: string }>} history
 */
export function historyImpliesPriorHeroImageIntent(history) {
  const h = Array.isArray(history) ? history : [];
  for (let i = h.length - 1; i >= 0; i--) {
    const role = String(h[i]?.role ?? '').toLowerCase();
    if (role !== 'user') continue;
    const c = String(h[i]?.content ?? '').trim();
    if (c && isHeroImageChangeMessage(c)) return true;
  }
  return false;
}

/**
 * Follow-up refinements after a hero-image intent (visual constraints, style, negation).
 * Only reliable when combined with {@link historyImpliesPriorHeroImageIntent} or prior subtype.
 * @param {string} userMessage
 */
export function isHeroImageVisualFollowUpMessage(userMessage) {
  const raw = String(userMessage ?? '').trim();
  if (!raw) return false;
  const lower = raw.toLowerCase();

  if (isHeroImageChangeMessage(raw)) return true;

  if (/\bhero\s+photo\b/i.test(raw)) return true;
  if (/\b(cover|background)\s+image\b/i.test(raw)) return true;
  if (/\breplace\s+(the\s+)?(hero\s+)?(image|photo|picture)\b/i.test(raw)) return true;
  if (/\b(fashion|food|lifestyle|editorial)\s+photo\b/i.test(raw)) return true;
  if (/\bnot\s+(a\s+)?food\b/i.test(lower) || /\bno(t)?\s+food\s+photo\b/i.test(lower)) return true;
  if (/\bmatch\s+(the\s+)?store\s+context\b/i.test(lower)) return true;
  if (/\bstore\s+context\b/i.test(lower) && /\b(photo|image|picture|visual|hero|banner)\b/i.test(lower)) return true;
  if (/\b(make|makes?)\s+it\s+(more|less)\b/i.test(lower)) return true;
  if (/\bmore\s+modern\b/i.test(lower) || /\blighter\b/i.test(lower) || /\bdarker\b/i.test(lower)) return true;
  if (/\bwrong\s+(image|photo|picture)\b/i.test(lower)) return true;
  if (/\bdifferent\s+(style|look|vibe|aesthetic)\b/i.test(lower)) return true;

  return false;
}

/**
 * @param {unknown} body
 */
export function hasIntakeImageAttachment(body) {
  const raw = body && typeof body === 'object' && !Array.isArray(body) ? body.attachments : null;
  if (!Array.isArray(raw)) return false;
  return raw.some((a) => {
    if (!a || typeof a !== 'object') return false;
    const type = String(a.type || '').toLowerCase();
    const uri = String(a.uri || a.url || '').trim();
    return (type === 'image' || type === 'photo') && uri.length > 8;
  });
}

/**
 * @param {string | undefined} message
 */
export function isHeroUiInstructionFallback(message) {
  const s = String(message ?? '');
  if (!s.trim()) return false;
  return /change\s+hero\s+image/i.test(s) && /(button|control|preview\s+panel|website\s+preview)/i.test(s);
}

/**
 * @param {string} locale
 * @param {string} [userMessage]
 * @returns {Array<{ label: string, tool: string, parameters?: Record<string, unknown> }>}
 */
export function buildHeroImageClarifyOptions(locale, userMessage = '') {
  const isVi = String(locale || '').toLowerCase().startsWith('vi');
  const hint = String(userMessage || '').slice(0, 120).trim();
  const promptBase = hint
    ? isVi
      ? `Ảnh hero cửa hàng, phong cách chuyên nghiệp: ${hint}`
      : `Professional retail storefront hero image: ${hint}`
    : isVi
      ? 'Ảnh hero cửa hàng, phong cách chuyên nghiệp, ánh sáng tốt'
      : 'Professional storefront hero image, clean lighting, retail';

  return [
    {
      label: isVi ? 'Tải ảnh mới' : 'Upload a new image',
      tool: '__client_hero_upload__',
      parameters: {},
    },
    {
      label: isVi ? 'Tạo ảnh bằng AI' : 'Generate an image',
      tool: 'edit_artifact',
      parameters: {
        artifactType: 'hero',
        instruction: isVi
          ? `Đổi ảnh hero — gợi ý ảnh stock phù hợp: ${promptBase}`
          : `Change hero image to a different professional photo. Style: ${promptBase}`,
      },
    },
    {
      label: isVi ? 'Chọn từ ảnh có sẵn / stock' : 'Use stock or draft images',
      tool: '__client_hero_stock__',
      parameters: {},
    },
  ];
}

/** Style / subject cues strong enough to build a generation prompt (heuristic). */
const HERO_VISUAL_STYLE_LEX =
  /\b(fashion|luxury|minimalist|minimal|modern|elegant|editorial|aesthetic|moody|sleek|premium|boutique|clothing|apparel|lifestyle|professional|cinematic|vintage|rustic|contemporary|sophisticated|upscale|streetwear|runway|banner\s+style)\b/i;

/**
 * User gave negation or swap away from an unwanted visual theme (e.g. food).
 * @param {string} lower
 */
function heroVisualNegationOrSwap(lower) {
  return (
    /\bnot\s+a\s+food\b/i.test(lower) ||
    /\bno(t)?\s+food\b/i.test(lower) ||
    /\bwithout\s+food\b/i.test(lower) ||
    /\binstead\s+of\b.+\bfood\b/i.test(lower) ||
    (/\breplace\b[\s\S]{0,120}\bfood\b[\s\S]{0,120}\bwith\b/i.test(lower)) ||
    (/\bswap\b[\s\S]{0,80}\bfood\b/i.test(lower))
  );
}

/**
 * True when the message carries enough visual/style direction to auto-generate a hero image.
 * @param {string} userMessage
 */
export function hasHeroImageVisualStyleDirection(userMessage) {
  const raw = String(userMessage ?? '').trim();
  if (!raw) return false;
  const lower = raw.toLowerCase();

  if (/\b(make\s+it|make\s+the)\s+better\b/i.test(lower) && !HERO_VISUAL_STYLE_LEX.test(raw)) return false;
  if (/\b(use|try)\s+another\s+(picture|photo|image)\b/i.test(lower) && !HERO_VISUAL_STYLE_LEX.test(raw)) return false;

  if (heroVisualNegationOrSwap(lower)) return true;

  const useTry = lower.match(/\b(use|try)\s+a\s+(.+)/i);
  if (useTry && /\b(photo|image|picture|banner|visual)\b/i.test(useTry[2])) {
    const stem = useTry[2].replace(/\b(photo|image|picture|banner|visual)\b[\s\S]*$/i, '').trim();
    if (stem.length >= 3) return true;
  }

  if (HERO_VISUAL_STYLE_LEX.test(raw) && /\b(photo|image|picture|banner|visual|photography)\b/i.test(raw)) return true;
  if (HERO_VISUAL_STYLE_LEX.test(raw) && /\b(hero|banner|homepage)\b/i.test(raw)) return true;

  if (/\b(more|less)\s+(modern|elegant|minimal|minimalist|clean|sleek|luxurious)\b/i.test(lower)) return true;
  if (/\bdifferent\s+(style|look|vibe|aesthetic)\b/i.test(lower)) return true;

  if (/\b(change|replace|update)\s+.+\bto\b/i.test(lower) && (HERO_VISUAL_STYLE_LEX.test(raw) || /\b(style|look|vibe)\b/i.test(lower)))
    return true;

  return false;
}

/**
 * Enough visual direction for auto hero generation, given hero lane context.
 * @param {string} userMessage
 * @param {{ conversationHistory?: Array<{ role?: string, content?: string }>, persistedHeroSubtype?: string | null }} [context]
 */
export function isGenerationReadyHeroImageRequest(userMessage, context = {}) {
  const msg = String(userMessage ?? '').trim();
  if (!msg) return false;
  const hist = Array.isArray(context.conversationHistory) ? context.conversationHistory : [];
  const persisted = context.persistedHeroSubtype ?? null;

  const inHeroLane =
    isHeroImageChangeMessage(msg) ||
    (historyImpliesPriorHeroImageIntent(hist) &&
      (isHeroImageVisualFollowUpMessage(msg) || hasHeroImageVisualStyleDirection(msg))) ||
    (persisted === 'change_hero_image' &&
      (isHeroImageVisualFollowUpMessage(msg) || hasHeroImageVisualStyleDirection(msg)));

  if (!inHeroLane) return false;
  return hasHeroImageVisualStyleDirection(msg);
}

/**
 * @param {{ userMessage: string, conversationHistory?: Array<{ role?: string, content?: string }>, persistedHeroSubtype?: string | null }} input
 * @returns {{ ready: boolean, source: 'current_message' | 'history' | 'persisted_intent' | null }}
 */
export function shouldAutoGenerateHeroImage(input) {
  const userMessage = String(input?.userMessage ?? '').trim();
  const conversationHistory = Array.isArray(input?.conversationHistory) ? input.conversationHistory : [];
  const persistedHeroSubtype = input?.persistedHeroSubtype ?? null;

  if (!isGenerationReadyHeroImageRequest(userMessage, { conversationHistory, persistedHeroSubtype })) {
    return { ready: false, source: null };
  }

  if (persistedHeroSubtype === 'change_hero_image' && !isHeroImageChangeMessage(userMessage)) {
    return { ready: true, source: 'persisted_intent' };
  }
  if (historyImpliesPriorHeroImageIntent(conversationHistory) && !isHeroImageChangeMessage(userMessage)) {
    return { ready: true, source: 'history' };
  }
  return { ready: true, source: 'current_message' };
}

/**
 * @typedef {{ storeId?: string | null, draftId?: string | null, storeLabel?: string | null }} HeroStoreContext
 */

/**
 * Compose a concise image-generation prompt from user language + optional store context.
 * @param {{ userMessage: string, storeContext?: HeroStoreContext, brandContext?: string | null }} args
 */
export function buildHeroImageGenerationPrompt({ userMessage, storeContext = {}, brandContext = null }) {
  const raw = String(userMessage ?? '').trim();
  const lower = raw.toLowerCase();
  const parts = [];

  const label = brandContext ?? storeContext?.storeLabel ?? null;
  if (label && String(label).trim()) {
    parts.push(`Hero banner for the online store "${String(label).trim().slice(0, 100)}".`);
  } else if (storeContext?.storeId) {
    parts.push('Wide ecommerce homepage hero banner for the storefront.');
  } else {
    parts.push('Wide homepage hero banner for an online store.');
  }

  parts.push(`Visual direction from the owner: ${raw.slice(0, 240)}.`);

  if (heroVisualNegationOrSwap(lower) || /\b(not|no|without)\s+food\b/i.test(lower) || /\breplace\s+food\b/i.test(lower)) {
    parts.push('Exclude food imagery and food photography; favor the requested replacement style.');
  }

  parts.push('Premium retail web aesthetic, clean composition, suitable for a wide hero section; minimal overlaid text.');

  return parts.join(' ');
}

/**
 * @param {{ userMessage: string, missionId?: string | null, storeContext?: HeroStoreContext }} args
 */
export function buildHeroAutoVisualDirectClassification({ userMessage, missionId, storeContext = {} }) {
  const raw = String(userMessage ?? '').trim();
  const prompt = buildHeroImageGenerationPrompt({
    userMessage,
    storeContext,
    brandContext: storeContext?.storeLabel ?? null,
  });
  const instruction = raw.length
    ? `Change hero image — ${raw.slice(0, 400)}`
    : `Change hero image — ${prompt.slice(0, 400)}`;

  return {
    executionPath: 'direct_action',
    tool: 'edit_artifact',
    confidence: 0.9,
    parameters: {
      artifactType: 'hero',
      instruction,
      ...(storeContext.storeId ? { storeId: storeContext.storeId } : {}),
      ...(storeContext.storeLabel
        ? { storeCategory: String(storeContext.storeLabel).trim().slice(0, 120) }
        : {}),
      ...(missionId ? { missionId } : {}),
    },
    _intentResolution: {
      family: 'website_edit',
      subtype: 'change_hero_image',
      resolverReason: 'hero_auto_generate',
    },
  };
}

/**
 * If the request is hero-lane + generation-ready, return classification + telemetry for edit_artifact (Pexels hero search).
 * @param {{
 *   userMessage: string,
 *   conversationHistory?: Array<{ role?: string, content?: string }>,
 *   persistedHeroSubtype?: string | null,
 *   missionId?: string | null,
 *   storeContext?: HeroStoreContext,
 * }} input
 * @returns {{ classification: object, telemetry: object } | null}
 */
export function tryHeroAutoVisualDirectAction(input) {
  const gate = shouldAutoGenerateHeroImage({
    userMessage: input.userMessage,
    conversationHistory: input.conversationHistory,
    persistedHeroSubtype: input.persistedHeroSubtype ?? null,
  });
  if (!gate.ready) return null;

  const classification = buildHeroAutoVisualDirectClassification({
    userMessage: input.userMessage,
    missionId: input.missionId ?? null,
    storeContext: input.storeContext && typeof input.storeContext === 'object' ? input.storeContext : {},
  });

  return {
    classification,
    telemetry: {
      heroAutoGenerateTriggered: true,
      heroGenerationReady: true,
      heroGeneratedPrompt: classification.parameters.instruction,
      heroAutoGenerateSource: gate.source,
    },
  };
}
