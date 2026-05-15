/**
 * Build Smart Document — CC-3
 *
 * Full pipeline for creating a SmartDocument from intent data:
 *   1. Validate input + apply preset
 *   2. Resolve size
 *   3. Generate content (slogan / tagline)
 *   4. Assemble designJson
 *   5. Persist SmartDocument record
 *   6. Generate QR code
 *   7. Render HTML + emit context
 *
 * Never throws — each step is individually guarded.
 *
 * @param {string | null} missionId
 * @param {{
 *   type: string,
 *   subtype?: string | null,
 *   title?: string | null,
 *   businessName?: string,
 *   businessType?: string,
 *   colorPrimary?: string | null,
 *   logoUrl?: string | null,
 *   eventDate?: string | null,
 *   eventVenue?: string | null,
 *   stampThreshold?: number | null,
 *   offer?: string | null,
 *   artifactUrl?: string | null,
 *   artifactText?: string | null,
 *   sizeVariant?: string | null,
 * }} docData
 * @param {{
 *   emitContextUpdate?: Function,
 *   userId: string,
 *   tenantId?: string,
 * }} options
 * @returns {Promise<{ documentId?: string, liveUrl?: string, error?: string, partial?: boolean }>}
 */

import cuid from 'cuid';
import { getPrismaClient } from '../prisma.js';
import { emitHealthProbe } from '../telemetry/healthProbes.js';
import { writeStepOutput } from '../missionContextBus.js';
import { getDocSize } from './documentSizeStandards.js';
import { getPreset } from './presets/index.js';
import { buildPhaseConfig } from './phaseEngine.js';
import { serializeCapabilities } from './capabilityRegistry.js';
import { resolveContent } from '../contentResolution/contentResolver.js';

const BUILD_SMART_DOCUMENT_TOOL = 'build_smart_document';

/**
 * Emits structured step_output on MissionBlackboard for progressive artifact UI (best-effort).
 * @param {string | null | undefined} missionId
 * @param {number} stepIndex 1–7
 * @param {string} stepTitle
 * @param {Record<string, unknown>} output
 */
function writeStep(missionId, stepIndex, stepTitle, output) {
  const mid = typeof missionId === 'string' ? missionId.trim() : '';
  if (!mid || stepIndex < 1) return;
  writeStepOutput(mid, { stepIndex, toolName: BUILD_SMART_DOCUMENT_TOOL, stepTitle }, output)
    .then((r) => {
      if (process.env.NODE_ENV !== 'production') {
        console.log('[missionContextBus] writeStepOutput', {
          missionId: mid,
          stepIndex,
          toolName: BUILD_SMART_DOCUMENT_TOOL,
          ok: r?.ok !== false,
        });
      }
    })
    .catch(() => {});
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function emitLine(emitContextUpdate, line) {
  if (typeof emitContextUpdate !== 'function') return;
  await emitContextUpdate({ reasoning_line: { line, timestamp: Date.now() } }).catch(() => {});
}

function publicBaseUrl() {
  return (
    (typeof process.env.PUBLIC_BASE_URL === 'string' && process.env.PUBLIC_BASE_URL.trim()) ||
    'http://localhost:5174'
  );
}

async function generateQrCode(url) {
  try {
    const mod = await import('qrcode');
    const QRCode = mod.default ?? mod;
    const toDataURL = QRCode?.toDataURL ?? QRCode?.default?.toDataURL;
    if (typeof toDataURL !== 'function') return null;
    return await toDataURL(url);
  } catch (e) {
    console.warn('[buildSmartDocument] QR generation failed:', e?.message ?? e);
    return null;
  }
}

// ── Main pipeline ──────────────────────────────────────────────────────────

export async function buildSmartDocument(missionId, docData, options = {}) {
  const { emitContextUpdate, userId, tenantId } = options;
  const prisma = getPrismaClient();

  const docId = cuid();
  let documentId = null;
  let liveUrl = null;

  // ── STEP 1 — Validate + preset ─────────────────────────────────────────
  await emitLine(emitContextUpdate, '📄 Reading document specification...');
  let docType = 'card';
  let subtype = null;
  let preset = {};
  try {
    docType = typeof docData?.type === 'string' && docData.type.trim() ? docData.type.trim() : 'card';
    subtype = typeof docData?.subtype === 'string' && docData.subtype.trim() ? docData.subtype.trim() : null;
    preset = await getPreset(docType, subtype);
  } catch (e) {
    console.warn('[buildSmartDocument] Step 1 failed:', e?.message ?? e);
  }

  await writeStep(missionId, 1, 'Read document specification', {
    phase: 'preset',
    docType,
    subtype,
    presetTemplate: preset?.designJson?.template ?? null,
  });

  const businessName = typeof docData?.businessName === 'string' && docData.businessName.trim()
    ? docData.businessName.trim()
    : 'My Business';
  const businessType = typeof docData?.businessType === 'string' && docData.businessType.trim()
    ? docData.businessType.trim()
    : 'General';

  // ── STEP 2 — Size ──────────────────────────────────────────────────────
  await emitLine(emitContextUpdate, '📐 Resolving document dimensions...');
  let sizeW = preset.sizeW ?? 85.6;
  let sizeH = preset.sizeH ?? 54;
  let sizeUnit = 'mm';
  let sizeDpi = preset.sizeDpi ?? 300;
  try {
    const size = getDocSize(docType, docData?.sizeVariant ?? null);
    sizeW = size.w;
    sizeH = size.h;
    sizeUnit = size.unit;
    sizeDpi = size.dpi;
  } catch (e) {
    console.warn('[buildSmartDocument] Step 2 size failed:', e?.message ?? e);
  }

  await writeStep(missionId, 2, 'Resolve document dimensions', {
    phase: 'size',
    sizeW,
    sizeH,
    sizeUnit,
    sizeDpi,
  });

  // ── STEP 3 — Content ───────────────────────────────────────────────────
  await emitLine(emitContextUpdate, '✍️ Generating document content...');
  let slogan = { content: '', source: 'fallback' };
  let tagline = { content: '', source: 'fallback' };
  try {
    const contentOpts = { emitContextUpdate };
    const base = { businessName, businessType, verticalSlug: `${docType}.${subtype ?? 'generic'}`, tenantKey: tenantId ?? 'smart-doc' };
    [slogan, tagline] = await Promise.all([
      resolveContent(missionId, { ...base, type: 'slogan' }, contentOpts),
      resolveContent(missionId, { ...base, type: 'slogan', existingContent: docData?.offer ?? '' }, contentOpts),
    ]);
  } catch (e) {
    console.warn('[buildSmartDocument] Step 3 content failed:', e?.message ?? e);
  }

  await writeStep(missionId, 3, 'Generate document content', {
    phase: 'content',
    slogan: typeof slogan?.content === 'string' ? slogan.content.slice(0, 500) : '',
    tagline: typeof tagline?.content === 'string' ? tagline.content.slice(0, 500) : '',
    sloganSource: slogan?.source ?? null,
    taglineSource: tagline?.source ?? null,
  });

  // ── STEP 4 — Design JSON ───────────────────────────────────────────────
  await emitLine(emitContextUpdate, '🎨 Assembling document design...');
  const designJson = {
    template: preset.designJson?.template ?? `${docType}_${subtype ?? 'default'}`,
    theme: preset.designJson?.theme ?? 'modern',
    ...(docData?.colorPrimary ? { colorPrimary: docData.colorPrimary } : {}),
    ...(docData?.logoUrl ? { logoUrl: docData.logoUrl } : {}),
    tagline: tagline.content || slogan.content || businessName,
    ...(docData?.eventDate ? { eventDate: docData.eventDate } : {}),
    ...(docData?.eventVenue ? { venue: docData.eventVenue } : {}),
    ...(docData?.offer ? { offer: docData.offer } : {}),
    ...(docData?.artifactUrl ? { artifactUrl: docData.artifactUrl } : {}),
  };

  // Phase config
  let phaseConfig = preset.phaseConfig ?? {};
  try {
    if (docData?.stampThreshold && typeof docData.stampThreshold === 'number') {
      phaseConfig = buildPhaseConfig({ ...phaseConfig, maxStamps: docData.stampThreshold });
    }
  } catch (e) { /* non-fatal */ }

  await writeStep(missionId, 4, 'Assemble document design', {
    phase: 'design',
    template: designJson.template ?? null,
    theme: designJson.theme ?? null,
    title: typeof docData?.title === 'string' && docData.title.trim() ? docData.title.trim() : null,
  });

  // Capabilities
  const capabilities = preset.capabilities ?? ['chat'];

  // Title
  const title = typeof docData?.title === 'string' && docData.title.trim()
    ? docData.title.trim()
    : `${businessName} — ${subtype ?? docType}`;

  // ── STEP 5 — Persist ───────────────────────────────────────────────────
  await emitLine(emitContextUpdate, '💾 Saving document...');
  try {
    liveUrl = `${publicBaseUrl().replace(/\/+$/, '')}/doc/${docId}/view`;

    await prisma.smartDocument.create({
      data: {
        id: docId,
        userId,
        docType,
        subtype: subtype ?? null,
        title,
        status: 'active',
        phase: 'active',
        designJson,
        sizeW,
        sizeH,
        sizeUnit,
        sizeDpi,
        agentPersonality: preset.agentPersonality ?? null,
        knowledgeBase: null,
        capabilities: serializeCapabilities(capabilities),
        autoApprove: preset.autoApprove ?? true,
        phaseConfig: Object.keys(phaseConfig).length > 0 ? phaseConfig : null,
        liveUrl,
      },
    });

    documentId = docId;

    await writeStep(missionId, 5, 'Save document', {
      phase: 'persist',
      documentId: docId,
      liveUrl,
      title,
      docType,
      subtype,
    });
  } catch (stepErr) {
    console.error('[buildSmartDocument] Step 5 persist failed:', stepErr?.message ?? stepErr);
    emitHealthProbe('smart_document_created', {
      missionId: missionId ?? undefined,
      docType,
      subtype,
      ok: false,
    });
    return { error: stepErr?.message ?? String(stepErr), partial: true };
  }

  // ── STEP 6 — QR code ───────────────────────────────────────────────────
  await emitLine(emitContextUpdate, '🔗 Generating QR code...');
  try {
    const qrCodeUrl = await generateQrCode(liveUrl);
    if (qrCodeUrl) {
      await prisma.smartDocument.update({ where: { id: docId }, data: { qrCodeUrl } });
    }
    await writeStep(missionId, 6, 'Generate QR code', {
      phase: 'qr',
      documentId: docId,
      liveUrl,
      qrGenerated: Boolean(qrCodeUrl),
    });
  } catch (e) {
    console.warn('[buildSmartDocument] Step 6 QR failed:', e?.message ?? e);
    await writeStep(missionId, 6, 'Generate QR code', {
      phase: 'qr',
      documentId: docId,
      liveUrl,
      qrGenerated: false,
      warning: e?.message ?? String(e),
    });
  }

  // ── STEP 7 — Context + telemetry ───────────────────────────────────────
  await emitLine(emitContextUpdate, '✅ Smart document ready');
  try {
    if (typeof emitContextUpdate === 'function') {
      await emitContextUpdate({
        smart_document: {
          documentId,
          docType,
          subtype,
          title,
          liveUrl,
        },
      }).catch(() => {});
    }
  } catch { /* non-fatal */ }

  await writeStep(missionId, 7, 'Smart document ready', {
    phase: 'complete',
    documentId,
    liveUrl,
    docType,
    subtype,
    title,
  });

  emitHealthProbe('smart_document_created', {
    missionId: missionId ?? undefined,
    docType,
    subtype,
    documentId,
    ok: true,
  });

  return { documentId, liveUrl };
}
