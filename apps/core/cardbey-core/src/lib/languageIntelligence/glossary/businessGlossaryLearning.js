/**
 * Business glossary learning — propose terms, owner-approve, reuse in translation.
 */

import { randomUUID } from 'crypto';
import { assertGlossaryEntry, resolveGlossaryTerm } from '../contracts/glossaryEntry.js';
import {
  getBusinessLocalePreference,
  upsertBusinessGlossaryEntries,
} from '../preferences/businessPreferenceStore.js';
import { listGlossaryEntries, matchGlossaryInText } from '../registries/index.js';
import { isLanguageIntelligencePreferencesV1Enabled } from '../flags.js';

/** Simple proper-noun / multiword candidate heuristics */
const CANDIDATE_RE = /\b([A-Z][A-Za-zÀ-ỹ]{2,}(?:\s+[A-Z][A-Za-zÀ-ỹ]{2,}){0,3})\b/g;

/** Lowercase includes-match (avoid \\b issues with Vietnamese combining marks). */
const VI_FOOD_TERMS = Object.freeze([
  'bánh mì',
  'banh mi',
  'phở',
  'pho',
  'bún',
  'bun',
  'cà phê',
  'ca phe',
  'cơm',
  'com',
]);

/**
 * Propose glossary candidates from free text (does not persist).
 * @param {string} text
 * @param {{ storeId?: string, sourceLanguage?: string }} [opts]
 */
export function proposeGlossaryCandidates(text, opts = {}) {
  const raw = String(text ?? '');
  const lower = raw.toLowerCase();
  /** @type {Map<string, object>} */
  const found = new Map();

  let m;
  const re = new RegExp(CANDIDATE_RE.source, 'g');
  while ((m = re.exec(raw)) !== null) {
    const term = m[1].trim();
    if (term.length < 3 || term.length > 60) continue;
    if (/^(The|And|For|With|From|This|That|Your|Our)$/i.test(term)) continue;
    const id = `proposed-${term.toLowerCase().replace(/\s+/g, '-')}`;
    if (!found.has(id)) {
      found.set(id, {
        id,
        term,
        policy: 'never_translate',
        sourceLanguage: opts.sourceLanguage || null,
        scope: 'store',
        storeId: opts.storeId || null,
        ownerApproved: false,
        status: 'proposed',
        note: 'Heuristic proper-noun candidate',
      });
    }
  }

  for (const needle of VI_FOOD_TERMS) {
    const idx = lower.indexOf(needle);
    if (idx < 0) continue;
    const term = raw.slice(idx, idx + needle.length).replace(/\s+/g, ' ').trim();
    if (!term) continue;
    const id = `proposed-${term.toLowerCase().replace(/\s+/g, '-')}`;
    if (found.has(id)) continue;
    const isBanh = /bánh|banh/i.test(term);
    found.set(id, {
      id,
      term,
      policy: 'preferred_term',
      sourceLanguage: 'vi',
      scope: 'store',
      storeId: opts.storeId || null,
      ownerApproved: false,
      status: 'proposed',
      preferredByLanguage: { en: isBanh ? `Vietnamese ${term}` : term },
      note: 'Vietnamese food term candidate',
    });
  }

  return Object.freeze([...found.values()]);
}

/**
 * @param {string} storeId
 */
export async function listStoreGlossary(storeId) {
  const biz = await getBusinessLocalePreference(storeId);
  const platform = listGlossaryEntries();
  const storeEntries = (biz?.glossary || []).map((e) => ({ ...e, scope: e.scope || 'store' }));
  return Object.freeze({
    storeId,
    platform,
    store: storeEntries,
    approved: storeEntries.filter((e) => e.ownerApproved),
  });
}

/**
 * Owner approves a glossary entry (persists to business prefs).
 * @param {string} storeId
 * @param {object} entry
 */
export async function approveStoreGlossaryEntry(storeId, entry) {
  if (!isLanguageIntelligencePreferencesV1Enabled()) {
    throw new Error('[languageIntelligence] Preferences V1 disabled');
  }
  const normalized = assertGlossaryEntry({
    id: entry.id || `store-${randomUUID()}`,
    term: entry.term,
    policy: entry.policy || 'never_translate',
    sourceLanguage: entry.sourceLanguage,
    preferredByLanguage: entry.preferredByLanguage,
    scope: 'store',
    storeId,
    ownerApproved: true,
    note: entry.note,
  });
  await upsertBusinessGlossaryEntries(storeId, [normalized]);
  return normalized;
}

/**
 * Match platform + approved store glossary against text.
 * @param {string} storeId
 * @param {string} text
 * @param {string} targetLanguage
 */
export async function matchStoreGlossaryInText(storeId, text, targetLanguage) {
  const platformHits = matchGlossaryInText(text, targetLanguage);
  const { approved } = await listStoreGlossary(storeId);
  const hay = String(text ?? '').toLowerCase();
  const storeHits = [];
  for (const entry of approved) {
    if (!entry.term || !hay.includes(String(entry.term).toLowerCase())) continue;
    storeHits.push({
      entry,
      resolution: resolveGlossaryTerm(entry, targetLanguage),
    });
  }
  return Object.freeze({
    platform: platformHits,
    store: storeHits,
    all: Object.freeze([...platformHits, ...storeHits]),
  });
}
