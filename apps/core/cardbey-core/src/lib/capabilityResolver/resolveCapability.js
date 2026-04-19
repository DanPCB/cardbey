/**
 * Phase 1 — Capability Resolution Layer for Performer / Intake.
 * Deterministic family + next-action hints; does not replace Intake V2 classification.
 *
 * @typedef {'store_setup' | 'website_build' | 'artifact_edit' | 'content_generation' | 'research' | 'campaign' | 'image_understanding' | 'document_understanding' | 'commerce_transaction' | 'service_request' | 'support_navigation' | 'general_question'} CapabilityFamily
 *
 * @typedef {'execute_direct' | 'start_mission' | 'clarify' | 'respond_only' | 'not_supported_yet'} CapabilityAction
 *
 * @typedef {{
 *   family: CapabilityFamily,
 *   action: CapabilityAction,
 *   target?: string | null,
 *   confidence?: number,
 *   reason?: string,
 *   clarificationPrompt?: string,
 *   suggestedToolHint?: string | null,
 * }} CapabilityResolution
 */

/** @type {Record<string, CapabilityFamily>} */
export const CAPABILITY_FAMILIES = {
  STORE_SETUP: 'store_setup',
  WEBSITE_BUILD: 'website_build',
  ARTIFACT_EDIT: 'artifact_edit',
  CONTENT_GENERATION: 'content_generation',
  RESEARCH: 'research',
  CAMPAIGN: 'campaign',
  IMAGE_UNDERSTANDING: 'image_understanding',
  DOCUMENT_UNDERSTANDING: 'document_understanding',
  COMMERCE_TRANSACTION: 'commerce_transaction',
  SUPPORT_NAVIGATION: 'support_navigation',
  SERVICE_REQUEST: 'service_request',
  GENERAL_QUESTION: 'general_question',
};

const RE_STORE =
  /\b(create|open|start|set\s*up|build)\s+(a\s+)?(my\s+)?(new\s+)?store\b|\bcreate\s+store\b|\bmini\s*website\b|\bmicrosite\b|\bweb\s*presence\b/i;
const RE_WEBSITE = /\b(website|mini[\s-]?site|web\s*site|homepage|landing\s*page)\b/i;
const RE_CAMPAIGN =
  /\b(campaign|promotion|promo|launch\s+campaign|marketing\s+campaign|loyalty\s+campaign|social\s+content\s+plan)\b/i;
const RE_IMAGE =
  /\b(what'?s?\s+in\s+(this|the)\s+(photo|image|picture|screenshot)|what\s+is\s+in\s+the\s+image|read\s+(this\s+)?image|describe\s+(this\s+)?(photo|image|screenshot)|understand\s+(this\s+)?(photo|image)|extract\s+text\s+from|ocr|inside\s+the\s+photo|see\s+(what|this))\b/i;
/** Legacy narrow doc hint (superseded by signalsDocumentUnderstanding for attachment flows). */
const RE_DOC = /\b(pdf|document|flyer|scan|invoice|quote|contract|menu\s+pdf)\b/i;
const RE_COMMERCE =
  /\b(book|booking|reserve|reservation|purchase|buy|place\s+an?\s+order|checkout|add\s+to\s+cart|pay\s+for|ordering|buying)\b/i;
const RE_RESEARCH =
  /\b(supplier|suppliers|vendor|vendors|rfq|find\s+options|compare\s+options|market\s+research|who\s+sells|source\s+)\b/i;
const RE_QUOTE_INVOICE = /\b(quote|invoice|estimate|proposal)\b.*\b(help|create|make|prepare|draft)\b|\b(help|create|make)\b.*\b(quote|invoice)\b/i;
const RE_SUPPORT = /\b(how\s+do\s+i|where\s+do\s+i|how\s+to\s+|where\s+to\s+find|navigate|settings|account)\b/i;
const RE_ARTIFACT = /\b(hero|headline|tagline|artifact|draft|copy|translate|edit\s+(the\s+)?(promo|store|page))\b/i;
const RE_CONTENT_GEN = /\b(generate|write|draft)\s+.{0,40}\b(post|caption|email|blog|description)\b/i;

const CLARIFY = {
  commerce: {
    en: 'I can help you toward a booking or purchase in Cardbey. What product or service, and do you already have a store set up here?',
    vi: 'Mình có thể hướng dẫn bạn đặt hàng hoặc đặt chỗ trong Cardbey. Bạn cần sản phẩm/dịch vụ gì, và bạn đã có cửa hàng trên Cardbey chưa?',
  },
  image: {
    en: 'I can work with your image in Cardbey. Do you want text extracted, a short description of what’s shown, or to use it for a store or campaign?',
    vi: 'Mình có thể xử lý ảnh của bạn trên Cardbey. Bạn muốn trích chữ, mô tả nhanh nội dung, hay dùng cho cửa hàng/chiến dịch?',
  },
  research: {
    en: 'I can help you research suppliers or options. What industry, product, or location should we focus on?',
    vi: 'Mình có thể hỗ trợ tìm nhà cung cấp hoặc so sánh lựa chọn. Bạn quan tâm ngành, sản phẩm, hay khu vực nào?',
  },
  support: {
    en: 'I can point you to the right place in Cardbey. Are you trying to change store settings, publish content, or manage missions?',
    vi: 'Mình có thể chỉ hướng trong Cardbey. Bạn muốn cài đặt cửa hàng, xuất bản nội dung, hay quản lý mission?',
  },
  store: {
    en: 'I can help you set up a Cardbey store or mini website. Do you have a business name and category in mind?',
    vi: 'Mình có thể giúp tạo cửa hàng hoặc mini website trên Cardbey. Bạn đã có tên và ngành kinh doanh chưa?',
  },
  service_request: {
    en: 'I can help you capture a local service request in Cardbey (no automated booking yet). What service type, area, and timing do you need?',
    vi: 'Mình có thể giúp ghi nhận yêu cầu dịch vụ trong Cardbey (chưa đặt chỗ tự động). Bạn cần loại dịch vụ, khu vực và thời gian nào?',
  },
};

/**
 * Local / professional service booking — not Cardbey store product checkout.
 * Evaluated before broad RE_COMMERCE so "book a nails service" maps here.
 * @param {string} blob
 */
export function signalsServiceRequest(blob) {
  const b = String(blob ?? '').toLowerCase();
  if (/\b(add to cart|checkout|buy this product|order from my store|gift card from)\b/.test(b)) return false;

  const localProf =
    /\b(plumber|plumbing|electricians?|electrician|cleaners?|cleaning\s+service|tutor|tutors|tutoring|nails?|nail\s+technician|manicure|pedicure|hairdresser|hair\s+stylist|massages?|massage\s+therapist|handyman|handymen|locksmiths?|painters?|roofer|hvac|babysitter|pet\s*sit|landscapers?|facial|waxing)\b/.test(
      b,
    );

  const bookOrFind =
    /\b(help\s+me\s+)?(book|schedule|arrange|find|hire|get|need)\b/.test(b) ||
    /\bfind\s+me\s+(a|an)?\s*\w+/.test(b) ||
    /\bi\s+need\s+(a|an)?\s*\w+/.test(b) ||
    /\blooking\s+for\s+(a|an)?\s*\w+/.test(b);

  const explicitService =
    /\bbook\s+(a|an)\s+\w+\s+service\b/.test(b) ||
    /\b(hire|book)\s+(a|an)\s+(local\s+)?(professional|contractor|provider)\b/.test(b) ||
    (/\bservice\b/.test(b) && /\b(nails|hair|beauty|spa|massage|clean|plumb|tutor|electric)/.test(b));

  if (localProf && bookOrFind) return true;
  if (explicitService && localProf) return true;
  if (/\bbook\s+(a|an)\s+.+service\b/.test(b) && /\b(nails|beauty|massage|cleaning|plumb|tutor)/.test(b)) return true;
  return false;
}

/**
 * Document / OCR / text-from-image intent (requires an image attachment in intake).
 * Checked before broad image_understanding so "extract text from this image" maps here.
 *
 * @param {string} blob lowercased classifier + user text
 * @param {boolean} hasImage
 */
export function signalsDocumentUnderstanding(blob, hasImage) {
  if (!hasImage) return false;
  const b = String(blob ?? '').toLowerCase();

  const docNoun =
    /\b(pdfs?|documents?|flyers?|scans?|invoices?|receipts?|quotes?|contracts?|menus?|pdf|flyer|scan|invoice|quote|contract|waybill|packing\s*slips?|bank\s*statements?|purchase\s+orders?|p\.?\s*o\.?|business\s*cards?|id\s*cards?|passports?|licen[sc]es?|driver'?s?\s*licen[sc]es?|forms?|tickets?|labels?|posters?|memos?|letterheads?|prescriptions?|vouchers?|warrants?)\b/i;

  const ocrVerb =
    /\b(read|reads|reading|extract|extracts|extracting|parse|parses|parsing|transcribe|transcribes|ocr|pull|pulls|grab|grabs|capture|captures|summarize|summarises|summarization|bullet|bullets?|key\s*info|important\s+details|transcription|type\s*out|copy\s*out)\b/i;

  const imageOrAttachment =
    /\b(image|images|photo|photos|picture|pictures|screenshot|screenshots|attach(?:ed|ment)?|upload(?:ed)?|files?|snap|pic|pics|cards?|shot)\b/i;

  const textCentric =
    /\b(text|words?|writing|written|typed|printed)\s+(in|on|from|here|there|below|above)\b|\bwhat\s+does\b[\s\S]{0,56}\bsay\b|\bwhat\s+is\s+written\b|\bwhat'?s\s+written\b|\btell\s+me\s+what\b[\s\S]{0,40}\bsays\b|\btext\s+in\s+(this|the|that)\b|\bread\s+what\b[\s\S]{0,48}\b(inside|here|says)\b/i;

  const viSignals =
    /\b(đọc|trích\s*chữ|chữ\s+trong|văn\s*bản|hóa\s*đơn|biên\s*lai|giấy\s*tờ|ảnh\s+chụp|tóm\s*tắt\s+nội\s+dung)\b/i;

  if (docNoun.test(b)) return true;
  if (RE_DOC.test(b)) return true;
  if (viSignals.test(b)) return true;
  if (ocrVerb.test(b) && imageOrAttachment.test(b)) return true;
  if (textCentric.test(b)) return true;

  if (
    /\b(understand|summarize|summarise)\s+(this|the|my)\s+/.test(b) &&
    (docNoun.test(b) || imageOrAttachment.test(b))
  ) {
    return true;
  }

  return false;
}

/**
 * Strong visual / scene description (keep image_understanding when user is not asking for OCR/text).
 * @param {string} blob
 */
export function signalsVisualImageDescription(blob) {
  const b = String(blob ?? '').toLowerCase();
  return /\b(what\s+is\s+this\s+photo\s+about|what'?s?\s+this\s+photo\s+about|what\s+is\s+this\s+image\s+about|what'?s?\s+in\s+(this|the)\s+(photo|image|picture)(?!\s+say)|what\s+do\s+you\s+see|describe\s+the\s+scene|what'?s\s+happening|how\s+does\s+it\s+look|colors?|colour|style|cartoon|aesthetic|mood|atmosphere)\b/i.test(
    b,
  );
}

/**
 * @param {string} text
 * @param {string} locale
 */
export function isGenericIntakeFallback(text, locale) {
  const t = String(text ?? '').trim();
  if (!t) return true;
  if (locale === 'vi') {
    return /không chắc.*giúp|mô tả thêm|chi tiết hơn/i.test(t);
  }
  return /not sure how to help|give me more details|could you give me more details/i.test(t);
}

/**
 * Typical assistant refusals for out-of-domain requests (we upgrade these when a capability family matches).
 * @param {string} text
 */
export function isAssistantRefusal(text) {
  const t = String(text ?? '').toLowerCase();
  if (!t) return false;
  return (
    t.includes('cannot help') ||
    t.includes("can't help") ||
    t.includes('unable to help') ||
    t.includes('unable to assist') ||
    t.includes('cannot assist') ||
    t.includes("can't assist") ||
    t.includes('do not have the ability') ||
    t.includes("don't have the ability") ||
    t.includes('not able to') ||
    (t.includes('cannot') && t.includes('directly')) ||
    (t.includes("can't") && t.includes('directly'))
  );
}

/**
 * Layered capability resolution (deterministic + context).
 * Input may include userMessage, enrichedMessage, locale, hasImage, imageOcrHasText,
 * storeId, draftId, missionId, classification (tool, executionPath, …), serviceRequestThreadBlob.
 * @param {Record<string, unknown>} input
 * @returns {CapabilityResolution}
 */
export function resolveCapability(input) {
  const userMessage = String(input.userMessage ?? '').trim();
  const enriched = String(input.enrichedMessage ?? userMessage).trim();
  const threadBlob = String(input.serviceRequestThreadBlob ?? '').trim();
  const blob = `${enriched} ${userMessage} ${threadBlob}`.trim().toLowerCase();
  const locale = input.locale === 'vi' ? 'vi' : 'en';
  const hasImage = Boolean(input.hasImage);
  const imgText = Boolean(input.imageOcrHasText);
  const tool = String(input.classification?.tool ?? '');
  const path = String(input.classification?.executionPath ?? '');

  /** @type {CapabilityResolution} */
  const base = {
    family: CAPABILITY_FAMILIES.GENERAL_QUESTION,
    action: 'respond_only',
    confidence: 0.45,
    reason: 'default',
    target: null,
    clarificationPrompt: undefined,
    suggestedToolHint: null,
  };

  // Layer 1 — align with existing classifier tool (preserve missions)
  if (tool === 'create_store' || RE_STORE.test(blob)) {
    return {
      ...base,
      family: CAPABILITY_FAMILIES.STORE_SETUP,
      action: path === 'direct_action' ? 'execute_direct' : 'clarify',
      confidence: 0.9,
      reason: 'store_setup_signal',
      clarificationPrompt: CLARIFY.store[locale],
      suggestedToolHint: 'create_store',
    };
  }
  if (tool === 'market_research' || tool === 'create_promotion' || tool === 'launch_campaign' || RE_CAMPAIGN.test(blob)) {
    return {
      ...base,
      family: CAPABILITY_FAMILIES.CAMPAIGN,
      action: 'start_mission',
      confidence: 0.88,
      reason: 'campaign_signal',
      suggestedToolHint: tool || 'market_research',
    };
  }
  if (RE_WEBSITE.test(blob) && /create|build|make|set\s*up/i.test(blob)) {
    return {
      ...base,
      family: CAPABILITY_FAMILIES.WEBSITE_BUILD,
      action: 'clarify',
      confidence: 0.82,
      reason: 'website_build_signal',
      clarificationPrompt: CLARIFY.store[locale],
      suggestedToolHint: 'create_store',
    };
  }
  if (RE_ARTIFACT.test(blob) || tool === 'edit_artifact' || tool === 'code_fix') {
    return {
      ...base,
      family: CAPABILITY_FAMILIES.ARTIFACT_EDIT,
      action: 'execute_direct',
      confidence: 0.8,
      reason: 'artifact_signal',
      suggestedToolHint: tool || 'edit_artifact',
    };
  }
  if (RE_CONTENT_GEN.test(blob) || tool === 'smart_visual') {
    return {
      ...base,
      family: CAPABILITY_FAMILIES.CONTENT_GENERATION,
      action: 'execute_direct',
      confidence: 0.75,
      reason: 'content_generation_signal',
    };
  }

  // Layer 2 — document / OCR vs visual image (attachments + phrasing)
  if (hasImage && signalsDocumentUnderstanding(blob, hasImage)) {
    const visualOnly = signalsVisualImageDescription(blob) && !/\b(extract|read|parse|transcribe|ocr|text|written|say|says|receipt|invoice|document|pdf|scan)\b/i.test(blob);
    if (!visualOnly) {
      return {
        ...base,
        family: CAPABILITY_FAMILIES.DOCUMENT_UNDERSTANDING,
        action: imgText ? 'execute_direct' : 'clarify',
        confidence: imgText ? 0.87 : 0.82,
        reason: 'document_or_ocr_intent_with_attachment',
        clarificationPrompt: CLARIFY.image[locale],
        suggestedToolHint: imgText ? 'general_chat' : 'analyze_content',
      };
    }
  }

  if (hasImage && (RE_IMAGE.test(blob) || /photo|image|picture|screenshot|attached/.test(blob))) {
    return {
      ...base,
      family: CAPABILITY_FAMILIES.IMAGE_UNDERSTANDING,
      action: imgText ? 'execute_direct' : 'clarify',
      confidence: imgText ? 0.85 : 0.78,
      reason: 'image_attachment_and_intent',
      clarificationPrompt: CLARIFY.image[locale],
      suggestedToolHint: imgText ? 'general_chat' : 'analyze_content',
    };
  }
  if (RE_DOC.test(blob) && hasImage) {
    return {
      ...base,
      family: CAPABILITY_FAMILIES.DOCUMENT_UNDERSTANDING,
      action: imgText ? 'execute_direct' : 'clarify',
      confidence: 0.81,
      reason: 'document_attachment_signal',
      clarificationPrompt: CLARIFY.image[locale],
      suggestedToolHint: imgText ? 'general_chat' : 'analyze_content',
    };
  }

  // Layer 3 — local service request (before broad commerce "book")
  if (signalsServiceRequest(blob)) {
    return {
      ...base,
      family: CAPABILITY_FAMILIES.SERVICE_REQUEST,
      action: 'clarify',
      confidence: 0.84,
      reason: 'local_service_request_signal',
      clarificationPrompt: CLARIFY.service_request[locale],
      suggestedToolHint: 'general_chat',
    };
  }

  // Layer 3 — commerce / research / support
  if (RE_COMMERCE.test(blob)) {
    return {
      ...base,
      family: CAPABILITY_FAMILIES.COMMERCE_TRANSACTION,
      action: 'clarify',
      confidence: 0.8,
      reason: 'commerce_keywords',
      clarificationPrompt: CLARIFY.commerce[locale],
    };
  }
  if (RE_RESEARCH.test(blob) || RE_QUOTE_INVOICE.test(blob)) {
    return {
      ...base,
      family: CAPABILITY_FAMILIES.RESEARCH,
      action: 'clarify',
      confidence: 0.78,
      reason: 'research_or_quote_signal',
      clarificationPrompt: CLARIFY.research[locale],
      suggestedToolHint: 'market_research',
    };
  }
  if (RE_SUPPORT.test(blob)) {
    return {
      ...base,
      family: CAPABILITY_FAMILIES.SUPPORT_NAVIGATION,
      action: 'respond_only',
      confidence: 0.7,
      reason: 'support_navigation',
      clarificationPrompt: CLARIFY.support[locale],
    };
  }

  return {
    ...base,
    family: CAPABILITY_FAMILIES.GENERAL_QUESTION,
    action: 'respond_only',
    confidence: 0.4,
    reason: 'general_fallback',
  };
}

/**
 * When Intake would return a generic chat fallback or an assistant refusal, replace with capability-aware text.
 * @param {{
 *   resolution: CapabilityResolution,
 *   responseOut: string,
 *   classification: { tool?: string, executionPath?: string },
 *   locale?: string,
 * }} opts
 * @returns {{ response: string, applied: boolean }}
 */
export function maybeEnhanceGeneralChatResponse(opts) {
  const { resolution, responseOut, classification, locale } = opts;
  const loc = locale === 'vi' ? 'vi' : 'en';
  const tool = String(classification?.tool ?? '');
  const path = String(classification?.executionPath ?? '');

  if (path !== 'chat' || tool !== 'general_chat') {
    return { response: responseOut, applied: false };
  }

  const generic = isGenericIntakeFallback(responseOut, loc);
  const refusal = isAssistantRefusal(responseOut);
  if (!generic && !refusal) {
    return { response: responseOut, applied: false };
  }

  const f = resolution.family;
  if (
    f === CAPABILITY_FAMILIES.COMMERCE_TRANSACTION ||
    f === CAPABILITY_FAMILIES.IMAGE_UNDERSTANDING ||
    f === CAPABILITY_FAMILIES.DOCUMENT_UNDERSTANDING ||
    f === CAPABILITY_FAMILIES.RESEARCH ||
    f === CAPABILITY_FAMILIES.SERVICE_REQUEST ||
    f === CAPABILITY_FAMILIES.SUPPORT_NAVIGATION ||
    f === CAPABILITY_FAMILIES.STORE_SETUP ||
    f === CAPABILITY_FAMILIES.WEBSITE_BUILD
  ) {
    const prompt =
      f === CAPABILITY_FAMILIES.COMMERCE_TRANSACTION
        ? CLARIFY.commerce[loc]
        : f === CAPABILITY_FAMILIES.IMAGE_UNDERSTANDING || f === CAPABILITY_FAMILIES.DOCUMENT_UNDERSTANDING
          ? CLARIFY.image[loc]
          : f === CAPABILITY_FAMILIES.RESEARCH
            ? CLARIFY.research[loc]
            : f === CAPABILITY_FAMILIES.SERVICE_REQUEST
              ? CLARIFY.service_request[loc]
              : f === CAPABILITY_FAMILIES.SUPPORT_NAVIGATION
                ? CLARIFY.support[loc]
                : CLARIFY.store[loc];
    return { response: prompt, applied: true };
  }

  return { response: responseOut, applied: false };
}
