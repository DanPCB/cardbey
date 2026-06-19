/**
 * Read-only i18n.js reader — extracts translation + dashboard namespaces (no writes).
 * Uses brace-block extraction (same strategy as diff-i18n-keys.mjs).
 */
import fs from 'node:fs';
import path from 'node:path';
import { getDashboardPackageRoot } from '../../lib/intake/i18nMaintenanceTools.js';

const TARGET_NAMESPACES = ['translation', 'dashboard'];

function resolveI18nPath(customPath) {
  if (customPath) return path.resolve(customPath);
  return path.join(getDashboardPackageRoot(), 'src/i18n.js');
}

function extractBraceBlock(source, openBraceIndex) {
  let depth = 0;
  for (let i = openBraceIndex; i < source.length; i += 1) {
    const c = source[i];
    if (c === '{') depth += 1;
    else if (c === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(openBraceIndex, i + 1);
    }
  }
  throw new Error('Unclosed brace block in i18n.js');
}

function extractNamespaceObject(source, lang, namespace) {
  const localeNeedle = lang === 'en' ? '  en:' : '  vi:';
  const pos = source.indexOf(localeNeedle);
  if (pos < 0) throw new Error(`Missing locale block: ${lang}`);

  const nsNeedle = namespace === 'dashboard' ? '\n    dashboard:' : 'translation:';
  const nsPos = source.indexOf(nsNeedle, pos);
  if (nsPos < 0) return null;

  const openBrace = source.indexOf('{', nsPos);
  if (openBrace < 0) return null;

  const block = extractBraceBlock(source, openBrace);
  return parseObjectLiteral(block);
}

function parseObjectLiteral(block) {
  // Read-only parse of static object literal extracted from i18n.js (no module side effects).
  // eslint-disable-next-line no-new-func
  return new Function(`return (${block});`)();
}

function flattenLeaves(obj, prefix = '') {
  /** @type {Record<string, string>} */
  const out = {};
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return out;

  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(out, flattenLeaves(value, fullKey));
    } else if (typeof value === 'string') {
      out[fullKey] = value;
    }
  }
  return out;
}

/**
 * @param {{ i18nPath?: string }} [opts]
 */
export function loadI18nCatalog(opts = {}) {
  const i18nPath = resolveI18nPath(opts.i18nPath);
  if (!fs.existsSync(i18nPath)) {
    throw new Error(`i18n file not found: ${i18nPath}`);
  }

  const source = fs.readFileSync(i18nPath, 'utf8');
  /** @type {Record<string, Record<string, string>>} */
  const en = {};
  /** @type {Record<string, Record<string, string>>} */
  const vi = {};
  const namespaces = [];

  for (const ns of TARGET_NAMESPACES) {
    const enObj = extractNamespaceObject(source, 'en', ns);
    const viObj = extractNamespaceObject(source, 'vi', ns);
    if (!enObj && !viObj) continue;

    namespaces.push(ns);
    en[ns] = enObj ? flattenLeaves(enObj) : {};
    vi[ns] = viObj ? flattenLeaves(viObj) : {};
  }

  if (!namespaces.length) {
    throw new Error('Could not extract translation/dashboard namespaces from i18n.js');
  }

  return { en, vi, i18nPath, namespaces };
}

export function mergeNamespaces(catalog, locale) {
  const bucket = catalog[locale] ?? {};
  const merged = {};
  for (const ns of catalog.namespaces ?? TARGET_NAMESPACES) {
    for (const [k, v] of Object.entries(bucket[ns] ?? {})) {
      merged[`${ns}.${k}`] = v;
    }
  }
  return merged;
}

export function listAllKeys(catalog) {
  const enKeys = new Set();
  const viKeys = new Set();
  for (const ns of catalog.namespaces ?? TARGET_NAMESPACES) {
    for (const k of Object.keys(catalog.en[ns] ?? {})) enKeys.add(`${ns}.${k}`);
    for (const k of Object.keys(catalog.vi[ns] ?? {})) viKeys.add(`${ns}.${k}`);
  }
  return {
    en: [...enKeys].sort(),
    vi: [...viKeys].sort(),
  };
}
