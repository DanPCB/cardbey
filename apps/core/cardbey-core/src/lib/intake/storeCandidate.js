/**
 * StoreCandidate — canonical structured extraction from uploaded business documents.
 * Vision runs once; Runtime Kernel / store mission consumes the artifact.
 */

import { randomUUID } from 'node:crypto';
import { parseBusinessCardOCR } from '../businessCardParser.js';
import { inferStoreCategoryFromHint } from './storeCreationDraft.js';
import { mapVerticalSlugToCategory } from './storeCreationDraftAssetBridge.js';

/** @typedef {'business_card'|'menu'|'flyer'|'brochure'|'poster'|'storefront_photo'|'logo'|'invoice'|'receipt'|'unknown'} DocumentType */

/**
 * @typedef {Object} StoreCandidateField
 * @property {string} value
 * @property {number} confidence
 * @property {string} [source]
 * @property {string} [provenance]
 */

/**
 * @typedef {Object} StoreCandidate
 * @property {string} [businessName]
 * @property {string} [category]
 * @property {string} [phone]
 * @property {string} [email]
 * @property {string} [website]
 * @property {string} [address]
 * @property {string} [suburb]
 * @property {string} [city]
 * @property {string} [state]
 * @property {string} [postcode]
 * @property {string} [country]
 * @property {string} [description]
 * @property {{ uri?: string; mimeType?: string } | null} [logoCandidate]
 * @property {Array<{ type: string; url: string }>} [socialLinks]
 * @property {number} confidence
 * @property {Record<string, StoreCandidateField>} extractedFields
 * @property {DocumentType} [documentType]
 * @property {string} [rawOcrText]
 * @property {string} [imageDataUrl]
 * @property {string} [artifactId]
 * @property {string} [sourceAssetId]
 */

/**
 * @typedef {Object} DocumentExtractionArtifact
 * @property {string} id
 * @property {'document_extraction'} artifactType
 * @property {string} [missionId]
 * @property {string} createdAt
 * @property {string} [updatedAt]
 * @property {DocumentType} documentType
 * @property {StoreCandidate} storeCandidate
 * @property {string} [imageDataUrl]
 * @property {string} [rawOcrText]
 * @property {number} confidence
 * @property {Record<string, unknown>} [provenance]
 */

/** @type {Map<string, DocumentExtractionArtifact>} */
const pendingBySession = new Map();

function strip(value) {
  return String(value ?? '')
    .replace(/^[\s"'`\u201c\u201d\u2018\u2019]+|[\s"'`\u201c\u201d\u2018\u2019]+$/g, '')
    .trim();
}

function field(value, confidence = 0.7, source = 'ocr', provenance = 'vision') {
  const v = strip(value);
  if (!v) return null;
  return { value: v, confidence: Math.min(Math.max(confidence, 0), 1), source, provenance };
}

function parseAuAddressParts(address) {
  const raw = strip(address);
  if (!raw) return {};
  const statePost = raw.match(/\b(VIC|NSW|QLD|SA|WA|TAS|NT|ACT)\s*(\d{4})\b/i);
  const out = { address: raw };
  if (statePost) {
    out.state = statePost[1].toUpperCase();
    out.postcode = statePost[2];
  }
  const commaParts = raw.split(',').map((p) => p.trim()).filter(Boolean);
  if (commaParts.length >= 2) {
    out.suburb = commaParts[commaParts.length - 2] ?? null;
    out.city = commaParts[commaParts.length - 2] ?? null;
  }
  out.country = 'AU';
  return out;
}

function overallConfidence(extractedFields) {
  const vals = Object.values(extractedFields ?? {}).filter((f) => f?.value);
  if (!vals.length) return 0;
  return vals.reduce((sum, f) => sum + (typeof f.confidence === 'number' ? f.confidence : 0.5), 0) / vals.length;
}

/**
 * @param {Record<string, StoreCandidateField>} extractedFields
 * @param {Partial<StoreCandidate>} [base]
 * @returns {StoreCandidate}
 */
export function assembleStoreCandidate(extractedFields, base = {}) {
  const get = (key) => extractedFields[key]?.value ?? base[key] ?? undefined;
  const addrParts = parseAuAddressParts(get('address'));
  const location =
    get('location') ||
    [addrParts.suburb, addrParts.state, addrParts.postcode].filter(Boolean).join(', ') ||
    undefined;

  /** @type {StoreCandidate} */
  const candidate = {
    businessName: get('businessName') ?? get('name'),
    category: get('category'),
    phone: get('phone'),
    email: get('email'),
    website: get('website'),
    address: addrParts.address ?? get('address'),
    suburb: addrParts.suburb ?? get('suburb'),
    city: addrParts.city ?? get('city'),
    state: addrParts.state ?? get('state'),
    postcode: addrParts.postcode ?? get('postcode'),
    country: addrParts.country ?? get('country'),
    description: get('description'),
    logoCandidate: base.logoCandidate ?? null,
    socialLinks: Array.isArray(base.socialLinks) ? base.socialLinks : [],
    confidence: overallConfidence(extractedFields),
    extractedFields,
    documentType: base.documentType ?? 'unknown',
    rawOcrText: base.rawOcrText ?? undefined,
    imageDataUrl: base.imageDataUrl ?? undefined,
    artifactId: base.artifactId ?? undefined,
    sourceAssetId: base.sourceAssetId ?? base.artifactId ?? undefined,
  };

  if (!candidate.category && candidate.businessName) {
    candidate.category = inferStoreCategoryFromHint(
      base.vertical ?? base.businessType,
      candidate.businessName,
      location ?? '',
    );
    if (candidate.category && candidate.category !== 'Other') {
      extractedFields.category = field(candidate.category, 0.65, 'inference', 'category_infer');
    }
  }

  candidate.confidence = overallConfidence(extractedFields);
  return candidate;
}

/**
 * @param {string} rawOcrText
 * @param {{ documentType?: DocumentType; imageDataUrl?: string | null; vertical?: string | null }} [meta]
 * @returns {StoreCandidate | null}
 */
export function buildStoreCandidateFromOcr(rawOcrText, meta = {}) {
  const text = strip(rawOcrText);
  if (!text) return null;

  const { extractedEntities, confidence: fieldConfidence = {} } = parseBusinessCardOCR(text, { country: 'AU' });
  const entities = extractedEntities && typeof extractedEntities === 'object' ? extractedEntities : {};

  /** @type {Record<string, StoreCandidateField>} */
  const extractedFields = {};
  const nameF = field(entities.businessName ?? entities.name, fieldConfidence.businessName ?? 0.85, 'ocr', 'business_card_parser');
  if (nameF) extractedFields.businessName = nameF;

  const phones = Array.isArray(entities.phones) ? entities.phones : [];
  const phoneF = field(phones[0], fieldConfidence.phones ?? 0.9, 'ocr', 'business_card_parser');
  if (phoneF) extractedFields.phone = phoneF;

  const emailF = field(entities.email, fieldConfidence.email ?? 0.92, 'ocr', 'business_card_parser');
  if (emailF) extractedFields.email = emailF;

  const webF = field(entities.website, fieldConfidence.website ?? 0.8, 'ocr', 'business_card_parser');
  if (webF) extractedFields.website = webF;

  const addrF = field(entities.address ?? entities.suburb ?? entities.city, fieldConfidence.address ?? 0.75, 'ocr', 'business_card_parser');
  if (addrF) extractedFields.address = addrF;

  const vertical = strip(meta.vertical ?? entities.vertical ?? entities.category ?? entities.businessType);
  const catLabel = mapVerticalSlugToCategory(vertical) ?? vertical;
  const catF = field(catLabel, 0.7, 'inference', 'category_hint');
  if (catF && catLabel) extractedFields.category = catF;

  if (!Object.keys(extractedFields).length) return null;

  return assembleStoreCandidate(extractedFields, {
    documentType: meta.documentType ?? 'business_card',
    rawOcrText: text,
    imageDataUrl: meta.imageDataUrl ?? undefined,
    vertical,
  });
}

/**
 * @param {Record<string, unknown> | null | undefined} cardExtraction
 */
export function buildStoreCandidateFromCardExtraction(cardExtraction) {
  if (!cardExtraction || typeof cardExtraction !== 'object') return null;
  /** @type {Record<string, StoreCandidateField>} */
  const extractedFields = {};
  const nameF = field(cardExtraction.businessName, 0.88, 'client_ocr', 'missions_extract_card');
  if (nameF) extractedFields.businessName = nameF;
  const locF = field(cardExtraction.location, 0.82, 'client_ocr', 'missions_extract_card');
  if (locF) extractedFields.address = locF;
  const catF = field(cardExtraction.vertical ?? cardExtraction.category, 0.75, 'client_ocr', 'missions_extract_card');
  if (catF) extractedFields.category = catF;
  if (!Object.keys(extractedFields).length) return null;
  return assembleStoreCandidate(extractedFields, {
    documentType: 'business_card',
    vertical: strip(cardExtraction.vertical ?? cardExtraction.category),
  });
}

/**
 * @param {Record<string, unknown> | null | undefined} ingestResult
 */
export function buildStoreCandidateFromIngest(ingestResult) {
  if (!ingestResult || typeof ingestResult !== 'object') return null;
  const rawOcrText = strip(ingestResult.rawOcrText ?? ingestResult.ocrHints?.rawText ?? '');
  const entityContext =
    ingestResult.entityContext && typeof ingestResult.entityContext === 'object'
      ? ingestResult.entityContext
      : {};
  const documentType = entityContext.documentType ?? entityContext.assetType ?? 'unknown';

  let candidate = rawOcrText
    ? buildStoreCandidateFromOcr(rawOcrText, {
        documentType,
        imageDataUrl: ingestResult.imageDataUrl ?? entityContext.imageDataUrl ?? null,
      })
    : null;

  if (!candidate && entityContext.detectedBusinessName) {
    /** @type {Record<string, StoreCandidateField>} */
    const extractedFields = {};
    const nameF = field(entityContext.detectedBusinessName, entityContext.confidence ?? 0.8, 'ingest', 'entity_context');
    if (nameF) extractedFields.businessName = nameF;
    const loc =
      Array.isArray(entityContext.detectedLocations) && entityContext.detectedLocations[0]
        ? entityContext.detectedLocations[0]
        : null;
    const locF = field(loc, 0.72, 'ingest', 'entity_context');
    if (locF) extractedFields.address = locF;
    candidate = assembleStoreCandidate(extractedFields, {
      documentType,
      imageDataUrl: ingestResult.imageDataUrl ?? entityContext.imageDataUrl ?? null,
    });
  }

  return candidate;
}

/**
 * @param {StoreCandidate | null | undefined} a
 * @param {StoreCandidate | null | undefined} b
 * @returns {StoreCandidate | null}
 */
export function mergeStoreCandidates(a, b) {
  if (!a) return b ?? null;
  if (!b) return a;

  /** @type {Record<string, StoreCandidateField>} */
  const merged = { ...a.extractedFields };
  for (const [key, fieldB] of Object.entries(b.extractedFields ?? {})) {
    const fieldA = merged[key];
    if (!fieldA || (fieldB.confidence ?? 0) > (fieldA.confidence ?? 0)) {
      merged[key] = fieldB;
    }
  }

  return assembleStoreCandidate(merged, {
    documentType: b.documentType !== 'unknown' ? b.documentType : a.documentType,
    rawOcrText: b.rawOcrText ?? a.rawOcrText,
    imageDataUrl: b.imageDataUrl ?? a.imageDataUrl,
    artifactId: b.artifactId ?? a.artifactId,
    socialLinks: [...(a.socialLinks ?? []), ...(b.socialLinks ?? [])],
  });
}

/**
 * @param {StoreCandidate} candidate
 * @param {{ missionId?: string | null; uploadRef?: string | null }} [opts]
 * @returns {DocumentExtractionArtifact}
 */
export function buildDocumentExtractionArtifact(candidate, opts = {}) {
  const id = candidate.artifactId ?? `doc_ext_${randomUUID()}`;
  const now = new Date().toISOString();
  candidate.artifactId = id;
  candidate.sourceAssetId = opts.sourceAssetId ?? candidate.sourceAssetId ?? id;
  return {
    id,
    artifactType: 'document_extraction',
    missionId: opts.missionId ?? undefined,
    createdAt: now,
    updatedAt: now,
    documentType: candidate.documentType ?? 'unknown',
    storeCandidate: candidate,
    imageDataUrl: candidate.imageDataUrl ?? undefined,
    rawOcrText: candidate.rawOcrText ?? undefined,
    confidence: candidate.confidence ?? 0,
    provenance: {
      uploadRef: opts.uploadRef ?? null,
      sources: Object.values(candidate.extractedFields ?? {}).map((f) => f.provenance).filter(Boolean),
    },
  };
}

/**
 * @param {StoreCandidate | null | undefined} candidate
 * @returns {Record<string, unknown> | null}
 */
export function storeCandidateToAssetExtraction(candidate) {
  if (!candidate) return null;
  const location =
    [candidate.suburb, candidate.city, candidate.state, candidate.postcode].filter(Boolean).join(', ') ||
    candidate.address ||
    null;
  return {
    name: candidate.businessName ?? null,
    location,
    category: candidate.category ?? null,
    phone: candidate.phone ?? null,
    email: candidate.email ?? null,
    website: candidate.website ?? null,
    source: candidate.documentType === 'business_card' ? 'business_card' : 'ocr',
    documentType: candidate.documentType ?? 'unknown',
    confidence: candidate.confidence ?? null,
    description: candidate.description ?? null,
  };
}

/**
 * @param {import('./storeCreationDraft.js').StoreCreationDraftBundle} bundle
 * @param {StoreCandidate | null | undefined} candidate
 * @param {{ documentType?: string }} [meta]
 */
export function formatStoreCandidateReviewResponse(bundle, candidate, meta = {}) {
  const draft = bundle?.draft ?? {};
  const dt = String(meta.documentType ?? candidate?.documentType ?? draft.source ?? '').trim();
  const isCard = dt === 'business_card';
  const intro = isCard
    ? 'I found these details from your card:'
    : dt === 'menu'
      ? 'From this menu, I found:'
      : dt === 'flyer' || dt === 'brochure' || dt === 'poster'
        ? 'From this document, I found:'
        : dt === 'storefront_photo'
          ? 'From this storefront photo, I found:'
          : 'I found these details:';

  const fields = candidate?.extractedFields ?? {};
  const lines = [];

  const pushField = (label, draftVal, key) => {
    const val = strip(draftVal) || fields[key]?.value;
    if (!val) return;
    const conf = fields[key]?.confidence;
    const confNote =
      typeof conf === 'number' && conf < 0.75 ? ' (please verify)' : '';
    lines.push(`${label}: ${val}${confNote}`);
  };

  pushField('Business name', draft.name, 'businessName');
  pushField('Category', draft.category, 'category');
  pushField('Phone', draft.phone, 'phone');
  pushField('Email', draft.email, 'email');
  pushField('Website', draft.website, 'website');
  pushField('Address', draft.location ?? candidate?.address, 'address');

  if (lines.length === 0) {
    if (meta.extractionPending || candidate?.imageDataUrl || meta.awaitingExtraction) {
      return "I'm reading the uploaded card now...";
    }
    return null;
  }

  const body = `${intro}\n\n${lines.join('\n')}\n\nPlease confirm or edit before I create your store.`;

  if (bundle?.isComplete) {
    return `${body}\n\nEverything looks complete.\n\nReady to create your store?`;
  }
  return `${body}\n\nI need a bit more detail before we can create your store.`;
}

/**
 * @param {string | null | undefined} sessionId
 * @param {DocumentExtractionArtifact} artifact
 */
export function stashPendingDocumentExtraction(sessionId, artifact) {
  const sid = strip(sessionId);
  if (!sid || !artifact?.id) return;
  pendingBySession.set(sid, artifact);
}

/**
 * @param {string | null | undefined} sessionId
 * @returns {DocumentExtractionArtifact | null}
 */
export function peekPendingDocumentExtraction(sessionId) {
  const sid = strip(sessionId);
  if (!sid) return null;
  return pendingBySession.get(sid) ?? null;
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} missionId
 * @param {DocumentExtractionArtifact} artifact
 */
export async function persistDocumentExtractionToMission(prisma, missionId, artifact) {
  const mid = strip(missionId);
  if (!mid || !prisma || !artifact?.storeCandidate) return false;

  try {
    const existing = await prisma.missionPipeline.findUnique({
      where: { id: mid },
      select: { metadataJson: true },
    });
    if (!existing) return false;

    const baseMeta =
      existing.metadataJson && typeof existing.metadataJson === 'object' && !Array.isArray(existing.metadataJson)
        ? { ...existing.metadataJson }
        : {};

    const priorOutputs =
      baseMeta.stepOutputs && typeof baseMeta.stepOutputs === 'object' && !Array.isArray(baseMeta.stepOutputs)
        ? baseMeta.stepOutputs
        : {};

    const missionArtifact = { ...artifact, missionId: mid, updatedAt: new Date().toISOString() };

    await prisma.missionPipeline.update({
      where: { id: mid },
      data: {
        metadataJson: {
          ...baseMeta,
          documentExtraction: missionArtifact,
          missionContext: {
            ...(baseMeta.missionContext && typeof baseMeta.missionContext === 'object'
              ? baseMeta.missionContext
              : {}),
            documentExtraction: missionArtifact.storeCandidate,
            uploadedAssets: [
              ...(Array.isArray(baseMeta.missionContext?.uploadedAssets)
                ? baseMeta.missionContext.uploadedAssets
                : []),
              ...(artifact.imageDataUrl ? [{ kind: 'image', uri: artifact.imageDataUrl }] : []),
            ],
          },
          assetIntentContext: baseMeta.assetIntentContext ?? artifact.storeCandidate,
          stepOutputs: {
            ...priorOutputs,
            document_extraction: missionArtifact,
          },
        },
      },
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {Record<string, unknown> | null | undefined} metadataJson
 * @returns {StoreCandidate | null}
 */
export function loadStoreCandidateFromMissionMetadata(metadataJson) {
  if (!metadataJson || typeof metadataJson !== 'object' || Array.isArray(metadataJson)) return null;

  const missionContext =
    metadataJson.missionContext && typeof metadataJson.missionContext === 'object'
      ? metadataJson.missionContext
      : null;
  if (missionContext?.documentExtraction && typeof missionContext.documentExtraction === 'object') {
    return /** @type {StoreCandidate} */ (missionContext.documentExtraction);
  }

  const docExt = metadataJson.documentExtraction;
  if (docExt && typeof docExt === 'object' && docExt.storeCandidate) {
    return /** @type {StoreCandidate} */ (docExt.storeCandidate);
  }

  const stepOutputs =
    metadataJson.stepOutputs && typeof metadataJson.stepOutputs === 'object' && !Array.isArray(metadataJson.stepOutputs)
      ? metadataJson.stepOutputs
      : {};
  const fromStep = stepOutputs.document_extraction;
  if (fromStep && typeof fromStep === 'object' && fromStep.storeCandidate) {
    return /** @type {StoreCandidate} */ (fromStep.storeCandidate);
  }

  return null;
}

/**
 * Resolve StoreCandidate from all available handoff sources (no re-OCR).
 * @param {{
 *   intentSourceContext?: Record<string, unknown> | null;
 *   metadataJson?: Record<string, unknown> | null;
 *   sessionId?: string | null;
 *   persistedIngest?: Record<string, unknown> | null;
 * }} input
 * @returns {StoreCandidate | null}
 */
export function resolveStoreCandidateForHandoff(input = {}) {
  const ctx =
    input.intentSourceContext && typeof input.intentSourceContext === 'object'
      ? input.intentSourceContext
      : null;

  /** @type {StoreCandidate | null} */
  let candidate = null;

  const fromCtx = ctx?.documentExtraction;
  if (fromCtx && typeof fromCtx === 'object') {
    candidate =
      fromCtx.storeCandidate && typeof fromCtx.storeCandidate === 'object'
        ? /** @type {StoreCandidate} */ (fromCtx.storeCandidate)
        : /** @type {StoreCandidate} */ (fromCtx);
  }

  const fromCard = buildStoreCandidateFromCardExtraction(ctx?.cardExtraction);
  candidate = mergeStoreCandidates(candidate, fromCard);

  const fromIngest = buildStoreCandidateFromIngest(
    ctx?.assetIngestResult ?? input.persistedIngest ?? null,
  );
  candidate = mergeStoreCandidates(candidate, fromIngest);

  const fromMeta = loadStoreCandidateFromMissionMetadata(input.metadataJson ?? null);
  candidate = mergeStoreCandidates(candidate, fromMeta);

  const pending = peekPendingDocumentExtraction(input.sessionId);
  if (pending?.storeCandidate) {
    candidate = mergeStoreCandidates(candidate, pending.storeCandidate);
  }

  return candidate;
}
