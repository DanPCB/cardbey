function trim(x) {
  return typeof x === 'string' ? x.trim() : '';
}

function lower(x) {
  return trim(x).toLowerCase();
}

/**
 * Best-effort hints for Phase 1 capture (no structured LLM extraction).
 * @param {string} blob
 * @returns {{ serviceType?: string, location?: string, timeWindow?: string }}
 */
export function inferServiceRequestHintsFromText(blob) {
  const raw = String(blob ?? '').trim();
  const b = lower(raw);
  /** @type {{ serviceType?: string, location?: string, timeWindow?: string }} */
  const out = {};
  if (/\b(barber|barbers?)\b/.test(b)) out.serviceType = 'a barber';
  else if (/\b(hair\s*cut|haircut|hair\s+stylist|hairdresser)\b/.test(b)) out.serviceType = 'a haircut';
  else if (/\b(nails?|nail\s+salon|manicure|pedicure)\b/.test(b)) out.serviceType = 'nail care';
  else if (/\b(massages?|massage\s+therapist|spa)\b/.test(b)) out.serviceType = 'a massage';
  else if (/\b(physio|physiotherapist)\b/.test(b)) out.serviceType = 'physiotherapy';
  else if (/\b(cleaners?|cleaning\s+service)\b/.test(b)) out.serviceType = 'cleaning';
  else if (/\b(plumber|plumbing)\b/.test(b)) out.serviceType = 'plumbing';

  const cityMatch = raw.match(
    /\b(Melbourne|Sydney|Brisbane|Perth|Adelaide|Canberra|Hanoi|Ho\s+Chi\s+Minh|Da\s+Nang|HCM|SGP|Singapore)\b/i,
  );
  if (cityMatch) out.location = cityMatch[1];

  const timeMatch = raw.match(
    /\b(tomorrow|today|tonight|this\s+morning|this\s+afternoon|this\s+evening|this\s+week|next\s+week|this\s+(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)|next\s+(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)|(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday))\b/i,
  );
  if (timeMatch) out.timeWindow = timeMatch[1];
  return out;
}

/**
 * Honest Phase 1 reply: capture intent, set expectations, ask clarifying questions.
 * @param {string} userMessage
 * @param {string} locale 'en' | 'vi'
 * @param {Record<string, unknown>} [parameters] classifier-passed hints
 */
export function buildServiceRequestCaptureResponse(userMessage, locale, parameters = {}) {
  const loc = locale === 'vi' ? 'vi' : 'en';
  const blob = trim(userMessage);
  const p =
    parameters && typeof parameters === 'object' && !Array.isArray(parameters) ? parameters : {};
  const hints = {
    ...inferServiceRequestHintsFromText(blob),
    ...(trim(p.serviceType) ? { serviceType: trim(p.serviceType) } : {}),
    ...(trim(p.location) ? { location: trim(p.location) } : {}),
    ...(trim(p.timeWindow) ? { timeWindow: trim(p.timeWindow) } : {}),
  };

  const svc = trim(hints.serviceType);
  const locHint = trim(hints.location);
  const tw = trim(hints.timeWindow);

  if (loc === 'vi') {
    const intro =
      'Mình có thể ghi nhận yêu cầu dịch vụ địa phương của bạn trong Cardbey và hỗ trợ tìm nhà cung cấp phù hợp. Đặt chỗ tự động hoàn toàn có thể chưa khả dụng với mọi nơi — mình sẽ thu thập thông tin trước.';
    const bits = [];
    if (svc) bits.push(`Mình ghi nhận bạn đang tìm: ${svc}.`);
    if (tw) bits.push(`Thời gian mong muốn: ${tw}.`);
    if (locHint) bits.push(`Khu vực: ${locHint}.`);
    const ask =
      'Bạn muốn mình tập trung khu vực nào, khung giờ ưu tiên, và ngân sách dự kiến (nếu có)?';
    return [intro, ...bits, ask].filter(Boolean).join('\n\n');
  }

  const intro =
    "I can capture your local service request in Cardbey and help find matching providers. Fully automated booking isn't available with every provider yet — I'll gather a few details first.";
  const bits = [];
  if (svc) bits.push(`I'm noting you're looking for ${svc}.`);
  if (tw) bits.push(`You mentioned timing: ${tw}.`);
  if (locHint) bits.push(`Location focus: ${locHint}.`);
  const ask = 'What area should I focus on, your preferred time window, and an approximate budget (if any)?';
  return [intro, ...bits, ask].filter(Boolean).join('\n\n');
}

/**
 * Very lightweight "draft" extractor. This is intentionally minimal:
 * - Keeps Intake route stable (no crashes)
 * - Allows the UI bridge to exist
 * - Avoids inventing provider data
 */
export function mergeServiceRequestDraftFromTurns(userMessage, conversationHistory, locale) {
  void locale;
  const blob = [userMessage, ...(Array.isArray(conversationHistory) ? conversationHistory.map((m) => m?.content ?? '') : [])]
    .map((x) => String(x ?? ''))
    .join('\n');

  const t = blob.trim();
  if (!t) return { rawUserText: '' };
  return { rawUserText: t, ...inferServiceRequestHintsFromText(t) };
}

export function isServiceRequestDraftComplete(draft) {
  const raw = trim(draft?.rawUserText);
  // Require some minimum content; real completeness logic can be added later.
  return raw.length >= 20;
}

export function buildServiceRequestMissingPrompt(draft, userMessage, locale) {
  void draft;
  const base = trim(userMessage);
  if (locale === 'vi') {
    return base
      ? 'Mình có thể giúp ghi nhận yêu cầu dịch vụ. Bạn cần dịch vụ gì, ở khu vực nào, thời gian nào và ngân sách dự kiến?'
      : 'Bạn cần dịch vụ gì, ở khu vực nào, thời gian nào và ngân sách dự kiến?';
  }
  return base
    ? 'I can help capture a service request. What service do you need, what area, when, and what’s your budget?'
    : 'What service do you need, what area, when, and what’s your budget?';
}

export function collectUserTextsForServiceDraft(userMessage, conversationHistory) {
  const out = [];
  const um = trim(userMessage);
  if (um) out.push(um);
  if (Array.isArray(conversationHistory)) {
    for (const m of conversationHistory) {
      const c = trim(m?.content);
      if (c) out.push(c);
    }
  }
  return out;
}

export function formatServiceRequestWithProviderSearch(serviceRequestDraft, locale, providerSearchResult) {
  const raw = trim(serviceRequestDraft?.rawUserText);
  const hasProviders = Boolean(providerSearchResult?.providers?.length);

  if (locale === 'vi') {
    if (hasProviders) {
      return `Mình đã tìm thấy một vài lựa chọn phù hợp. Bạn muốn chọn nhà cung cấp nào?\n\nYêu cầu của bạn:\n${raw}`;
    }
    return buildServiceRequestCaptureResponse(raw || '', 'vi', {
      serviceType: serviceRequestDraft?.serviceType,
      location: serviceRequestDraft?.location,
      timeWindow: serviceRequestDraft?.timeWindow,
    });
  }
  if (hasProviders) {
    return `I found a few options. Which provider would you like to choose?\n\nYour request:\n${raw}`;
  }
  return buildServiceRequestCaptureResponse(raw || '', 'en', {
    serviceType: serviceRequestDraft?.serviceType,
    location: serviceRequestDraft?.location,
    timeWindow: serviceRequestDraft?.timeWindow,
  });
}

export function formatSelectedServiceProviderBlock(selectedServiceProvider, locale) {
  const name = trim(selectedServiceProvider?.providerName) || 'Selected provider';
  const url = trim(selectedServiceProvider?.providerUrl);
  if (locale === 'vi') {
    return url ? `Bạn đã chọn: ${name}\n${url}` : `Bạn đã chọn: ${name}`;
  }
  return url ? `You selected: ${name}\n${url}` : `You selected: ${name}`;
}

/**
 * Matches the UI payload expectation (used only by server bridge right now).
 */
export function formatSelectedServiceProviderBlockForBridge(selectedServiceProvider) {
  const name = trim(selectedServiceProvider?.providerName);
  const url = trim(selectedServiceProvider?.providerUrl);
  return { name, url };
}

