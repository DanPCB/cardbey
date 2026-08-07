/**
 * Durable translation quality metadata in LI business block.
 *
 * Path: stylePreferences.languageIntelligence.translationMeta
 * Key: `${entityType}:${entityId|store}:${lang}:${field}`
 *
 * Does not store translated text — only approval / fingerprint metadata.
 */

import { createHash } from 'node:crypto';
import { getPrismaClient } from '../../prisma.js';
import { readBusinessLanguageBlock } from '../preferences/businessPreferenceStore.js';
import { isTranslationQualityStatus } from './translationQualityStatus.js';

/**
 * @param {unknown} sourceText
 * @returns {string}
 */
export function fingerprintSourceText(sourceText) {
  return createHash('sha256').update(String(sourceText ?? '')).digest('hex').slice(0, 24);
}

/**
 * @param {{ entityType: string, entityId?: string|null, lang: string, field: string }} parts
 */
export function translationMetaKey(parts) {
  const entityId = parts.entityId != null ? String(parts.entityId) : 'store';
  return `${parts.entityType}:${entityId}:${parts.lang}:${parts.field}`;
}

/**
 * @param {Record<string, unknown>} block
 * @returns {Record<string, object>}
 */
export function readTranslationMetaMap(block) {
  const raw = block?.translationMeta;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return /** @type {Record<string, object>} */ (raw);
}

/**
 * @param {string} storeId
 */
export async function getTranslationMetaMap(storeId) {
  const prisma = getPrismaClient();
  const store = await prisma.business.findUnique({
    where: { id: storeId },
    select: { stylePreferences: true },
  });
  if (!store) return {};
  const { block } = readBusinessLanguageBlock(store.stylePreferences);
  return readTranslationMetaMap(block);
}

/**
 * Upsert one field meta entry.
 * @param {string} storeId
 * @param {string} key
 * @param {object} patch
 * @param {{ actorUserId?: string|null }} [opts]
 */
export async function upsertTranslationMeta(storeId, key, patch, opts = {}) {
  const prisma = getPrismaClient();
  const store = await prisma.business.findUnique({
    where: { id: storeId },
    select: { id: true, stylePreferences: true },
  });
  if (!store) throw new Error('[languageIntelligence] store_not_found');

  const { stylePreferences, block } = readBusinessLanguageBlock(store.stylePreferences);
  const map = { ...readTranslationMetaMap(block) };
  const prev = map[key] && typeof map[key] === 'object' ? { ...map[key] } : {};
  const now = new Date().toISOString();
  const next = {
    ...prev,
    ...patch,
    updatedAt: now,
  };
  if (patch.status && !isTranslationQualityStatus(patch.status)) {
    throw new Error(`[languageIntelligence] invalid_quality_status:${patch.status}`);
  }
  if (patch.status === 'approved') {
    next.approvedAt = now;
    next.approvedByUserId = opts.actorUserId || null;
    next.rejectedAt = null;
    next.rejectionReason = null;
  }
  if (patch.status === 'rejected') {
    next.rejectedAt = now;
    next.rejectedByUserId = opts.actorUserId || null;
  }
  if (patch.status === 'needs_review' || patch.status === 'generated') {
    next.reviewedAt = now;
    next.reviewedByUserId = opts.actorUserId || null;
  }
  map[key] = next;

  const nextPrefs = {
    ...stylePreferences,
    languageIntelligence: {
      ...block,
      translationMeta: map,
    },
  };
  await prisma.business.update({
    where: { id: storeId },
    data: { stylePreferences: nextPrefs },
  });
  return next;
}

/**
 * Recalculate stale flags for all meta entries against current source texts.
 * @param {string} storeId
 * @param {Array<{ key: string, sourceText: string }>} sources
 */
export async function refreshStaleTranslationMeta(storeId, sources) {
  const prisma = getPrismaClient();
  const store = await prisma.business.findUnique({
    where: { id: storeId },
    select: { id: true, stylePreferences: true },
  });
  if (!store) throw new Error('[languageIntelligence] store_not_found');
  const { stylePreferences, block } = readBusinessLanguageBlock(store.stylePreferences);
  const map = { ...readTranslationMetaMap(block) };
  let changed = 0;
  for (const s of sources) {
    const entry = map[s.key];
    if (!entry || typeof entry !== 'object') continue;
    const fp = fingerprintSourceText(s.sourceText);
    if (entry.sourceFingerprint && entry.sourceFingerprint !== fp) {
      if (entry.status === 'approved' || entry.status === 'needs_review' || entry.status === 'generated') {
        map[s.key] = {
          ...entry,
          status: 'stale',
          staleReason: 'TRANSLATION_SOURCE_CHANGED',
          updatedAt: new Date().toISOString(),
        };
        changed += 1;
      }
    }
  }
  if (changed > 0) {
    await prisma.business.update({
      where: { id: storeId },
      data: {
        stylePreferences: {
          ...stylePreferences,
          languageIntelligence: { ...block, translationMeta: map },
        },
      },
    });
  }
  return { changed, map };
}
