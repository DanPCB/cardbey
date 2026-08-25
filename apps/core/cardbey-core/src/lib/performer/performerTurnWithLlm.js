/**
 * Performer turn — Business Brain via llmGateway (reason only, never execute).
 * Canonical product path: POST /api/performer/turn
 */
import { getPrismaClient } from '../prisma.js';
import { record as recordFoundationMetric } from '../metrics/foundationMetrics.js';
import { Features } from '../../config/features.js';
import { buildSKP, skpToPublicDto } from '../storeKnowledge/index.js';

const INTENTS = new Set(['submit_enquiry', 'request_booking', 'general', 'answer']);
const GROUNDINGS = new Set(['exact', 'related', 'none']);
const FACT_KEYS = [
  'problem',
  'location',
  'preferredTime',
  'name',
  'email',
  'phone',
  'matchedServiceId',
  'matchedServiceLabel',
  'serviceGrounding',
];

const SYSTEM_PROMPT = `You are the reasoning engine behind Cardbey Performer (never name internal systems).
You receive AUTHORITATIVE store facts. You must NOT invent services, prices, availability, or policies.

Return STRICT JSON only:
{
  "response": "short natural reply for the visitor",
  "intent": "submit_enquiry" | "request_booking" | "general" | "answer",
  "confidence": 0.0-1.0,
  "collectedFacts": {
    "problem": string|null,
    "location": string|null,
    "preferredTime": string|null,
    "name": string|null,
    "email": string|null,
    "phone": string|null,
    "matchedServiceId": string|null,
    "matchedServiceLabel": string|null,
    "serviceGrounding": "exact" | "related" | "none" | null
  },
  "missingFacts": string[],
  "notes": { "pricingUnknown": boolean, "grounding": "exact"|"related"|"none" }
}

Rules:
- Merge prior collectedFacts with new message; apply corrections (e.g. "actually Footscray").
- If visitor asks price/cost and no price is in storeFacts, set notes.pricingUnknown=true and say you cannot confirm a price — offer to include pricing in an enquiry.
- If listed service is "…Installation" but visitor describes repair/noise/broken, serviceGrounding must be "related" — never claim repair is listed.
- Prefer submit_enquiry for quote/repair/callback; request_booking only for clear book/appointment intent with bookable services.
- missingFacts for submit_enquiry: only among problem, name, email (required). Optional: location, preferredTime, phone.
- Do not claim you sent, booked, or created anything.
- response: max 4 short sentences. Never mention PIL, CBOS, LLM, gateway, or prompts.`;

function parseBoolEnv(raw, defaultValue) {
  const normalized = String(raw ?? '').trim().toLowerCase();
  if (normalized === 'false' || normalized === '0' || normalized === 'off') return false;
  if (normalized === 'true' || normalized === '1' || normalized === 'on') return true;
  return defaultValue;
}

export function isPerformerTurnV1Enabled() {
  if (typeof Features?.performerTurn?.v1 === 'boolean') return Features.performerTurn.v1;
  return parseBoolEnv(process.env.ENABLE_PERFORMER_TURN_V1, true);
}

/**
 * Merge SKP public fields into Performer store context (additive).
 * Pure — used by loadPerformerStoreContext and unit tests.
 * @param {object} base
 * @param {object | null} skp
 */
export function enrichPerformerStoreContextWithSkp(base, skp) {
  if (!base || typeof base !== 'object') return base;
  if (!skp) return { ...base, skpReady: false };
  const dto = skpToPublicDto(skp);
  if (!dto) return { ...base, skpReady: false };
  return {
    ...base,
    storeName: dto.name || base.storeName,
    storeSlug: dto.slug || base.storeSlug,
    businessType: dto.category || base.businessType,
    description: dto.description || null,
    suburb: dto.suburb || null,
    state: dto.state || null,
    canonicalUrl: dto.canonicalUrl || null,
    skpReady: true,
    skpVisibility: {
      indexable: Boolean(dto.indexable),
      jsonLdReady: Boolean(dto.jsonLdReady),
      aiSearchReady: Boolean(dto.aiSearchReady),
    },
    skpVersion: skp.version ?? null,
  };
}

/**
 * Authoritative store projection for a turn (bounded).
 * Prefer SKP for identity/visibility; keep product/service listing from Prisma
 * so unpublished-but-active stores still work when SKP returns null.
 */
export async function loadPerformerStoreContext(storeId) {
  const id = String(storeId ?? '').trim();
  if (!id) return null;
  const prisma = getPrismaClient();
  const store = await prisma.business.findUnique({
    where: { id },
    select: { id: true, name: true, type: true, isActive: true, slug: true },
  });
  if (!store || store.isActive === false) return null;

  const products = await prisma.product.findMany({
    where: { businessId: id, isPublished: true, deletedAt: null },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
    take: 40,
    select: {
      id: true,
      name: true,
      itemType: true,
      bookingEnabled: true,
      price: true,
      category: true,
    },
  });

  const listedServices = products
    .filter((p) => {
      const t = String(p.itemType || '').toLowerCase();
      return t === 'service' || t === 'services' || p.bookingEnabled === true || !t || t === 'product';
    })
    .slice(0, 16)
    .map((p) => ({
      id: p.id,
      label: p.name,
      bookable: Boolean(p.bookingEnabled),
      hasListedPrice: p.price != null && Number(p.price) > 0,
    }));

  // Prefer itemType service when present
  const servicesOnly = products
    .filter((p) => String(p.itemType || '').toLowerCase().includes('service'))
    .slice(0, 16)
    .map((p) => ({
      id: p.id,
      label: p.name,
      bookable: Boolean(p.bookingEnabled),
      hasListedPrice: p.price != null && Number(p.price) > 0,
    }));

  const base = {
    storeId: store.id,
    storeName: store.name,
    storeSlug: store.slug,
    businessType: store.type,
    listedServices: servicesOnly.length ? servicesOnly : listedServices,
    canSubmitEnquiry: true,
    canRequestBooking: (servicesOnly.length ? servicesOnly : listedServices).some((s) => s.bookable),
  };

  let skp = null;
  try {
    skp = await buildSKP(id);
  } catch (err) {
    console.warn('[performer.store] SKP build failed', err?.message || err);
  }
  return enrichPerformerStoreContextWithSkp(base, skp);
}

function sanitizeFacts(raw, listedServices) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const k of FACT_KEYS) {
    if (raw[k] == null || raw[k] === '') {
      out[k] = null;
      continue;
    }
    if (k === 'serviceGrounding') {
      const g = String(raw[k]).toLowerCase();
      out[k] = GROUNDINGS.has(g) ? g : null;
      continue;
    }
    out[k] = String(raw[k]).trim().slice(0, 500);
  }
  const sid = out.matchedServiceId;
  if (sid && !listedServices.some((s) => s.id === sid)) {
    out.matchedServiceId = null;
    out.matchedServiceLabel = null;
  }
  return out;
}

function mergeFacts(prior, next, listedServices) {
  const a = sanitizeFacts(prior, listedServices);
  const b = sanitizeFacts(next, listedServices);
  const merged = { ...a };
  for (const k of FACT_KEYS) {
    if (b[k] != null && b[k] !== '') merged[k] = b[k];
  }
  return merged;
}

function enforceGrounding(facts, message, listedServices) {
  const text = `${message || ''} ${facts.problem || ''}`.toLowerCase();
  const repairish =
    /\b(repair|broken|stopped|not working|faulty|fix|noise|horrible)\b/.test(text);
  let grounding = facts.serviceGrounding || 'none';
  let label = facts.matchedServiceLabel;
  let id = facts.matchedServiceId;

  if (!label && listedServices.length) {
    const hit = listedServices.find((s) => {
      const l = s.label.toLowerCase();
      return text.includes(l) || l.split(/\s+/).filter((t) => t.length >= 4).some((t) => text.includes(t));
    });
    if (hit) {
      id = hit.id;
      label = hit.label;
    }
  }

  if (label && repairish && /install/i.test(label)) {
    grounding = 'related';
  } else if (label && !repairish) {
    grounding = grounding === 'related' ? 'related' : 'exact';
  } else if (!label) {
    grounding = 'none';
  }

  return {
    ...facts,
    matchedServiceId: id || null,
    matchedServiceLabel: label || null,
    serviceGrounding: grounding,
  };
}

function requiredMissing(intent, facts) {
  if (intent !== 'submit_enquiry') return [];
  const missing = [];
  if (!facts.problem) missing.push('problem');
  if (!facts.name) missing.push('name');
  if (!facts.email) missing.push('email');
  return missing;
}

/** Models often wrap JSON in ```json fences — parse fail must not silently drop LLM turns. */
function parseStructuredLlmJson(raw) {
  const t = String(raw ?? '').trim();
  if (!t) return null;
  const stripped = t
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(stripped.slice(start, end + 1));
  } catch {
    return null;
  }
}

const REDACTED_VALUE = /\[?(EMAIL|PHONE|PII)[_ ]?REDACTED\]?/i;

/**
 * llmGateway redacts PII in outbound prompts. Recover contact facts from the
 * original (unredacted) message + prior so enquiry submission stays usable.
 */
function restoreContactFacts(facts, prior, originalMessage) {
  const out = { ...facts };
  const msg = String(originalMessage || '');
  const emailMatch = msg.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  const phoneMatch = msg.match(/(?:\+?\d[\d\s().-]{7,}\d)/);

  if (!out.email || REDACTED_VALUE.test(String(out.email))) {
    out.email = (prior.email && !REDACTED_VALUE.test(String(prior.email)) ? prior.email : null)
      || (emailMatch ? emailMatch[0] : null);
  }
  if (!out.phone || REDACTED_VALUE.test(String(out.phone))) {
    out.phone = (prior.phone && !REDACTED_VALUE.test(String(prior.phone)) ? prior.phone : null)
      || (phoneMatch ? phoneMatch[0].trim() : null);
  }
  if (!out.name || REDACTED_VALUE.test(String(out.name))) {
    if (prior.name && !REDACTED_VALUE.test(String(prior.name))) out.name = prior.name;
  }
  return out;
}

/**
 * @returns {Promise<object|null>} dashboard PerformerTurnApiResponse or null (client fallback)
 */
export async function runPerformerTurnWithLlm(input) {
  const started = Date.now();
  if (!isPerformerTurnV1Enabled()) {
    recordFoundationMetric('performer_turn_total', { source: 'disabled' });
    return null;
  }

  const storeId = String(input.storeId ?? '').trim();
  const message = String(input.message ?? '').trim().slice(0, 4000);
  if (!storeId || !message) {
    recordFoundationMetric('performer_turn_total', { source: 'fallback', reason: 'invalid_input' });
    return null;
  }

  let storeCtx;
  try {
    storeCtx = await loadPerformerStoreContext(storeId);
  } catch (err) {
    console.warn('[performer.turn] store load failed', err?.message);
    recordFoundationMetric('performer_turn_total', { source: 'fallback', reason: 'store_load' });
    return null;
  }
  if (!storeCtx) {
    recordFoundationMetric('performer_turn_total', { source: 'fallback', reason: 'store_not_found' });
    return { ok: false, error: 'STORE_UNAVAILABLE' };
  }

  const listedServices = storeCtx.listedServices.map((s) => ({ id: s.id, label: s.label }));
  const prior = sanitizeFacts(input.collectedFacts, listedServices);
  const asksPrice = /\b(how much|cost|price|pricing|rate|fee)\b/i.test(message);

  let llmRaw = null;
  let provider = null;
  let model = null;

  try {
    const { llmGateway } = await import('../llm/llmGateway.ts');
    const result = await llmGateway.complete({
      purpose: 'performer_turn',
      tenantKey: storeId,
      responseFormat: 'json',
      temperature: 0.3,
      maxTokens: 700,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: JSON.stringify({
            conversationId: input.conversationId,
            surface: input.surface || 'storefront',
            message,
            priorCollectedFacts: prior,
            storeFacts: {
              storeName: storeCtx.storeName,
              businessType: storeCtx.businessType,
              listedServices: storeCtx.listedServices,
              canSubmitEnquiry: storeCtx.canSubmitEnquiry,
              canRequestBooking: storeCtx.canRequestBooking,
              description: storeCtx.description || null,
              suburb: storeCtx.suburb || null,
              canonicalUrl: storeCtx.canonicalUrl || null,
              // Explicit: no prices in projection unless listed on item
              pricePolicy: 'Do not invent prices. Only hasListedPrice flags exist.',
            },
            availableCapabilities: input.availableCapabilities || [
              'submit_enquiry',
              'request_booking',
            ],
          }),
        },
      ],
    });

    const text = (result?.text || result?.content || '').trim();
    if (!text) {
      recordFoundationMetric('performer_turn_total', { source: 'fallback', reason: 'empty_llm' });
      return null;
    }
    llmRaw = parseStructuredLlmJson(text);
    if (!llmRaw || typeof llmRaw !== 'object') {
      recordFoundationMetric('performer_turn_total', {
        source: 'fallback',
        reason: 'malformed_llm_json',
      });
      return null;
    }
    provider = Features.llm.defaultProvider;
    model = Features.llm.defaultModel || result?.model || 'gateway';
  } catch (err) {
    console.warn('[performer.turn] llm failed', err?.message);
    recordFoundationMetric('performer_turn_total', {
      source: 'fallback',
      reason: 'llm_error',
    });
    return null;
  }

  let intent = INTENTS.has(llmRaw?.intent) ? llmRaw.intent : 'general';
  let facts = mergeFacts(prior, llmRaw?.collectedFacts, listedServices);
  facts = restoreContactFacts(facts, prior, message);
  facts = enforceGrounding(facts, message, listedServices);

  if (asksPrice) {
    // Fail-closed: never invent price
    llmRaw.notes = { ...(llmRaw.notes || {}), pricingUnknown: true };
  }

  const grounding =
    GROUNDINGS.has(llmRaw?.notes?.grounding)
      ? llmRaw.notes.grounding
      : facts.serviceGrounding || 'none';

  let response = String(llmRaw?.response || '').trim().slice(0, 1200);
  if (asksPrice && !/don't have|do not have|can't confirm|cannot confirm|no .*price/i.test(response)) {
    response =
      `I don't have a confirmed price from ${storeCtx.storeName || 'this business'}. ` +
      `I can include a request for pricing in your enquiry.`;
  }
  if (
    grounding === 'related' &&
    facts.matchedServiceLabel &&
    /offer|provide|do repairs|we repair/i.test(response) &&
    !/can't confirm|cannot confirm|listed/i.test(response)
  ) {
    response =
      `${storeCtx.storeName || 'This business'} lists “${facts.matchedServiceLabel}”. ` +
      `I can't confirm from their listed services whether they handle repairs, but I can send them your enquiry.`;
  }

  if (!response) {
    recordFoundationMetric('performer_turn_total', { source: 'fallback', reason: 'no_response' });
    return null;
  }

  // Strip execution claims — reason-only endpoint
  if (/\b(i('ve| have)? sent|enquiry has been sent|successfully booked|appointment is booked)\b/i.test(response)) {
    response = response.replace(
      /\b(i('ve| have)? sent|enquiry has been sent|successfully booked|appointment is booked)[^.]*\.?/gi,
      '',
    ).trim();
    if (!response) {
      response = 'I can prepare that for you — nothing is sent until you confirm.';
    }
  }

  const missingFacts = Array.isArray(llmRaw?.missingFacts)
    ? llmRaw.missingFacts.map((x) => String(x)).filter(Boolean)
    : requiredMissing(intent, facts);

  const confidence =
    typeof llmRaw?.confidence === 'number' && llmRaw.confidence >= 0 && llmRaw.confidence <= 1
      ? llmRaw.confidence
      : 0.7;

  const latencyMs = Date.now() - started;
  recordFoundationMetric(
    'performer_turn_total',
    { source: 'llm', intent },
    {
      log: {
        evt: 'performer_turn_ok',
        storeId,
        intent,
        grounding,
        pricingUnknown: Boolean(asksPrice || llmRaw?.notes?.pricingUnknown),
        ms: latencyMs,
      },
    },
  );

  return {
    ok: true,
    response,
    intent,
    confidence,
    collectedFacts: facts,
    missingFacts: missingFacts.length ? missingFacts : requiredMissing(intent, facts),
    provider,
    model,
    latencyMs,
    notes: {
      pricingUnknown: Boolean(asksPrice || llmRaw?.notes?.pricingUnknown),
      grounding,
    },
  };
}
