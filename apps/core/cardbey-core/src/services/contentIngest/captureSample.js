/**
 * Content ingest sample capture (dev-gated, PII-safe).
 * Only runs when ENABLE_CONTENT_INGEST_LOGS=true. Best-effort; never fails the main job.
 * Retention, daily cap, and sampling are gated by env; all optional. Wipe websiteUrl is in orchestraBuildStore.
 */

import { PrismaClient } from '@prisma/client';
import { scrubText } from './piiScrub.js';

const prisma = new PrismaClient();

const RAW_INPUT_MAX = 800;
const OCR_TEXT_MAX = 1200;

export function shouldCapture() {
  const v = process.env.ENABLE_CONTENT_INGEST_LOGS;
  return v === 'true' || v === '1';
}

function getEnvInt(name, defaultValue) {
  const v = process.env[name];
  if (v == null || v === '') return defaultValue;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? defaultValue : n;
}

function getEnvFloat(name, defaultValue) {
  const v = process.env[name];
  if (v == null || v === '') return defaultValue;
  const n = parseFloat(v);
  return Number.isNaN(n) ? defaultValue : n;
}

/** Start of UTC day for the given date (for daily cap). */
function startOfUtcDay(date) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/** Random sample: true with probability sampleRate (0..1). */
function shouldSample(sampleRate) {
  if (sampleRate >= 1) return true;
  if (sampleRate <= 0) return false;
  return Math.random() < sampleRate;
}

/**
 * Enforce retention (delete old), daily cap, and sampling. Only call when shouldCapture() is true.
 * Best-effort: on failure, returns { allowed: true } so capture can proceed (or catch and skip — we skip on throw).
 * @param {import('@prisma/client').PrismaClient} prismaClient
 * @returns {{ allowed: boolean, reason?: string }}
 */
export async function enforceCaptureLimits(prismaClient) {
  const retentionDays = getEnvInt('CONTENT_INGEST_RETENTION_DAYS', 14);
  const maxRowsPerDay = getEnvInt('CONTENT_INGEST_MAX_ROWS_PER_DAY', 200);
  const sampleRate = getEnvFloat('CONTENT_INGEST_SAMPLE_RATE', 1.0);

  if (sampleRate < 1 && !shouldSample(sampleRate)) {
    return { allowed: false, reason: 'SAMPLED_OUT' };
  }

  try {
    if (retentionDays > 0) {
      const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
      await prismaClient.contentIngestSample.deleteMany({
        where: { createdAt: { lt: cutoff } },
      });
    }

    if (maxRowsPerDay > 0) {
      const startOfDay = startOfUtcDay(new Date());
      const count = await prismaClient.contentIngestSample.count({
        where: { createdAt: { gte: startOfDay } },
      });
      if (count >= maxRowsPerDay) {
        return { allowed: false, reason: 'DAILY_CAP' };
      }
    }
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[contentIngest] enforceCaptureLimits failed (non-fatal, skipping capture):', err?.message || err);
    }
    return { allowed: false, reason: 'LIMITS_CHECK_FAILED' };
  }

  return { allowed: true };
}

/**
 * Extract domain from URL. Never throws. Returns null if invalid.
 * @param {string} url
 * @returns {string | null} e.g. "example.com"
 */
export function extractDomain(url) {
  if (url == null || typeof url !== 'string') return null;
  const s = url.trim();
  if (!s) return null;
  try {
    let href = s;
    if (!/^https?:\/\//i.test(href)) href = `https://${href}`;
    const u = new URL(href);
    const host = u.hostname || null;
    if (host && host !== 'localhost') return host;
    return null;
  } catch {
    const m = s.match(/^(?:https?:\/\/)?([^/?#]+)/);
    return m ? m[1].trim() : null;
  }
}

/**
 * Build minimal output catalog: categories [{ name }], items [{ name, description?, categoryName? }].
 * Omits imageUrl, price, id from items for minimal storage.
 * @param {{ id?: string, name: string }[]} categories
 * @param {{ name?: string, description?: string, categoryId?: string, categoryName?: string }[]} items
 * @param {Record<string, string>} [categoryIdToName] - map categoryId -> name for items
 * @returns {{ categories: { name: string }[], items: { name: string, description?: string, categoryName?: string }[] }}
 */
export function buildOutputCatalog(categories, items, categoryIdToName = {}) {
  const catList = Array.isArray(categories) ? categories : [];
  const itemList = Array.isArray(items) ? items : [];
  const idToName = { ...categoryIdToName };
  catList.forEach((c) => {
    if (c && (c.id || c.name)) idToName[c.id] = c.name || c.label || '';
  });
  return {
    categories: catList
      .filter((c) => c && (c.name || c.label))
      .map((c) => ({ name: (c.name || c.label || '').trim() })),
    items: itemList
      .filter((i) => i && (i.name || i.description))
      .map((i) => {
        const name = (i.name || '').trim() || '(unnamed)';
        const description = i.description != null ? String(i.description).trim().slice(0, 500) : undefined;
        const categoryName = i.categoryName ?? (i.categoryId ? idToName[i.categoryId] : undefined);
        return { name, ...(description ? { description } : {}), ...(categoryName ? { categoryName } : {}) };
      }),
  };
}

/**
 * Derive costSource for meta: use draft.preview.meta.costSource if present, else map from mode.
 * @param {string} mode - 'template'|'ai'|'ocr'
 * @param {{ costSource?: string } | null} [previewMeta]
 * @returns {'template'|'free_api'|'paid_ai'}
 */
function resolveCostSource(mode, previewMeta) {
  const fromMeta = previewMeta?.costSource && ['template', 'free_api', 'paid_ai'].includes(String(previewMeta.costSource).trim());
  if (fromMeta) return String(previewMeta.costSource).trim();
  const m = (mode ?? 'ai').toString().toLowerCase().trim();
  if (m === 'template') return 'template';
  if (m === 'ocr') return 'free_api';
  return 'paid_ai';
}

/**
 * Capture one ingest sample. Best-effort: catches errors and logs; never throws.
 * Only writes when shouldCapture() is true. Respects retention, daily cap, and sample rate.
 * @param {{
 *   reqContext: { goal?: string, sourceType?: string, includeImages?: boolean, generationRunId?: string, templateKey?: string, websiteUrl?: string, rawInput?: string, ocrRawText?: string };
 *   draftId?: string;
 *   jobId?: string;
 *   catalog: { categories?: any[], items?: any[] };
 *   mode?: string;
 *   vertical?: string;
 *   previewMeta?: { costSource?: string } | null;
 * }} params
 */
export async function captureIngestSample({ reqContext, draftId, jobId, catalog, mode, vertical, previewMeta }) {
  if (!shouldCapture()) return;
  try {
    const limits = await enforceCaptureLimits(prisma);
    if (!limits.allowed) return;

    const goal = (reqContext?.goal ?? 'build_store').trim() || 'build_store';
    const sourceType = (reqContext?.sourceType ?? 'form').trim() || 'form';
    const includeImages = reqContext?.includeImages !== false;
    const generationRunId = reqContext?.generationRunId?.trim() || null;
    const templateKey = reqContext?.templateKey?.trim() || null;
    const websiteDomain = reqContext?.websiteUrl != null ? extractDomain(reqContext.websiteUrl) : null;
    const rawInputSanitized = scrubText(reqContext?.rawInput ?? '', { maxLen: RAW_INPUT_MAX }) || null;
    const ocrTextSanitized = scrubText(reqContext?.ocrRawText ?? '', { maxLen: OCR_TEXT_MAX }) || null;

    const categories = catalog?.categories ?? [];
    const items = catalog?.items ?? [];
    const outputCatalog = buildOutputCatalog(categories, items);
    const itemCount = outputCatalog.items.length;
    const categoryCount = outputCatalog.categories.length;
    const costSource = resolveCostSource(mode, previewMeta ?? null);
    const meta = { itemCount, categoryCount, costSource };

    await prisma.contentIngestSample.create({
      data: {
        generationRunId,
        jobId: jobId?.trim() || null,
        draftId: draftId?.trim() || null,
        sourceType,
        goal,
        mode: (mode ?? 'ai').trim() || 'ai',
        includeImages,
        templateKey,
        websiteDomain,
        vertical: vertical?.trim() || null,
        rawInputSanitized,
        ocrTextSanitized,
        outputCatalog,
        meta,
      },
    });
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[contentIngest] capture failed (non-fatal):', err?.message || err);
    }
  }
}
