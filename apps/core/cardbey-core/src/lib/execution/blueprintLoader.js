/**
 * Declarative workflow blueprint loader (Phase 5).
 * Loads versioned JSON blueprints, validates, caches, and materializes MissionPipelineStep rows.
 *
 * Override directory (no code deploy for workflow edits):
 *   BLUEPRINT_DIR=/path/to/blueprints  → reads {missionType}.v1.json from disk first
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeLocale } from '../localePrompt.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BUNDLED_BLUEPRINT_DIR = join(__dirname, 'blueprints');

/** @type {Record<string, { defaultVersion: string, fileVersion: string }>} */
export const BLUEPRINT_REGISTRY = Object.freeze({
  store: { defaultVersion: '1.0.0', fileVersion: 'v1' },
  launch_campaign: { defaultVersion: '1.0.0', fileVersion: 'v1' },
});

const VALID_STEP_KINDS = new Set(['action', 'checkpoint', 'conditional', 'parallel']);

/** @type {Map<string, object>} */
const documentCache = new Map();

/** @type {Map<string, import('./workflowBlueprint.types.ts').MaterializedBlueprintStep[]>} */
const materializedCache = new Map();

/**
 * @param {unknown} v
 * @returns {v is Record<string, unknown>}
 */
function isObject(v) {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * @param {string} missionType
 * @returns {string}
 */
function normalizeMissionType(missionType) {
  return String(missionType ?? '').trim().toLowerCase();
}

/**
 * @param {string} version
 * @returns {string}
 */
function normalizeSemver(version) {
  return String(version ?? '').trim() || '1.0.0';
}

/**
 * @param {Record<string, unknown>} labels
 * @param {string} locale
 * @returns {string}
 */
function pickLocalized(labels, locale) {
  if (!isObject(labels)) return '';
  const loc = normalizeLocale(locale);
  const picked = labels[loc] ?? labels.en;
  return typeof picked === 'string' ? picked : '';
}

/**
 * @param {Array<{ value: string, displayLabel?: Record<string, string> }>} items
 * @returns {string[]}
 */
export function checkpointOptionValuesFromItems(items) {
  if (!Array.isArray(items)) return [];
  return items.map((o) => (typeof o?.value === 'string' ? o.value : '')).filter(Boolean);
}

/**
 * @param {Array<{ value: string, displayLabel?: Record<string, string> }>} items
 * @param {unknown} locale
 */
export function resolveCheckpointOptionsForLocale(items, locale) {
  const loc = normalizeLocale(locale);
  if (!Array.isArray(items)) return [];
  return items.map((o) => ({
    value: o.value,
    label: o.displayLabel?.[loc] ?? o.displayLabel?.en ?? o.value,
  }));
}

/**
 * @param {object} doc
 * @returns {{ ok: true, blueprint: object } | { ok: false, errors: string[] }}
 */
export function validateBlueprint(doc) {
  const errors = [];
  if (!isObject(doc)) {
    return { ok: false, errors: ['Blueprint must be an object'] };
  }
  for (const field of ['id', 'name', 'version', 'missionType']) {
    if (typeof doc[field] !== 'string' || !String(doc[field]).trim()) {
      errors.push(`Missing or invalid field: ${field}`);
    }
  }
  if (!Array.isArray(doc.steps) || doc.steps.length === 0) {
    errors.push('Blueprint must include a non-empty steps array');
  } else {
    doc.steps.forEach((step, index) => {
      if (!isObject(step)) {
        errors.push(`steps[${index}] must be an object`);
        return;
      }
      if (typeof step.id !== 'string' || !step.id.trim()) {
        errors.push(`steps[${index}].id is required`);
      }
      if (typeof step.toolName !== 'string' || !step.toolName.trim()) {
        errors.push(`steps[${index}].toolName is required`);
      }
      if (!VALID_STEP_KINDS.has(String(step.stepKind ?? ''))) {
        errors.push(`steps[${index}].stepKind is invalid`);
      }
      if (typeof step.orderIndex !== 'number' || !Number.isFinite(step.orderIndex)) {
        errors.push(`steps[${index}].orderIndex must be a number`);
      }
      if (!isObject(step.labels) || typeof step.labels.en !== 'string') {
        errors.push(`steps[${index}].labels.en is required`);
      }
      const cfg = step.config;
      if (cfg && isObject(cfg)) {
        if (cfg.type === 'checkpoint') {
          if (typeof cfg.outputKey !== 'string' || !cfg.outputKey.trim()) {
            errors.push(`steps[${index}].config.outputKey is required for checkpoint`);
          }
          if (!isObject(cfg.prompts) || typeof cfg.prompts.en !== 'string') {
            errors.push(`steps[${index}].config.prompts.en is required for checkpoint`);
          }
          if (!Array.isArray(cfg.optionItems) || cfg.optionItems.length === 0) {
            errors.push(`steps[${index}].config.optionItems is required for checkpoint`);
          }
        }
        if (cfg.type === 'conditional') {
          for (const key of ['condition', 'ifTrueTool', 'ifFalseTool']) {
            if (typeof cfg[key] !== 'string' || !String(cfg[key]).trim()) {
              errors.push(`steps[${index}].config.${key} is required for conditional`);
            }
          }
        }
      } else if (step.stepKind === 'checkpoint') {
        errors.push(`steps[${index}] checkpoint requires config`);
      }
    });
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, blueprint: doc };
}

/**
 * Future migration hook — identity for v1.0.0.
 * @param {object} doc
 * @returns {object}
 */
export function migrateBlueprint(doc) {
  const version = normalizeSemver(doc.version);
  if (version === '1.0.0' || version.startsWith('1.')) {
    return doc;
  }
  return doc;
}

/**
 * @param {string} missionType
 * @param {string} fileVersion
 * @returns {string | null}
 */
function resolveBlueprintPath(missionType, fileVersion) {
  const externalDir = typeof process.env.BLUEPRINT_DIR === 'string' ? process.env.BLUEPRINT_DIR.trim() : '';
  const fileName = `${missionType}.${fileVersion}.json`;
  if (externalDir) {
    const externalPath = join(externalDir, fileName);
    if (existsSync(externalPath)) return externalPath;
  }
  const bundledPath = join(BUNDLED_BLUEPRINT_DIR, fileName);
  if (existsSync(bundledPath)) return bundledPath;
  return null;
}

/**
 * @param {string} filePath
 * @returns {object}
 */
function readBlueprintFile(filePath) {
  const raw = readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  const migrated = migrateBlueprint(parsed);
  const validation = validateBlueprint(migrated);
  if (!validation.ok) {
    throw new Error(`Invalid blueprint ${filePath}: ${validation.errors.join('; ')}`);
  }
  return validation.blueprint;
}

/**
 * @returns {string[]}
 */
export function listBlueprintMissionTypes() {
  return Object.keys(BLUEPRINT_REGISTRY);
}

/**
 * Load raw blueprint document (cached).
 *
 * @param {string} missionType
 * @param {{ version?: string }} [opts]
 * @returns {object | null}
 */
export function loadBlueprintDocument(missionType, opts = {}) {
  const type = normalizeMissionType(missionType);
  const registry = BLUEPRINT_REGISTRY[type];
  if (!registry) return null;

  const version = normalizeSemver(opts.version ?? registry.defaultVersion);
  const cacheKey = `${type}:${version}`;
  if (documentCache.has(cacheKey)) {
    return documentCache.get(cacheKey);
  }

  const filePath = resolveBlueprintPath(type, registry.fileVersion);
  if (!filePath) return null;

  const doc = readBlueprintFile(filePath);
  if (normalizeSemver(doc.version) !== version && !version.startsWith('1.')) {
    console.warn(
      `[blueprintLoader] version mismatch for ${type}: file=${doc.version} requested=${version}`,
    );
  }
  documentCache.set(cacheKey, doc);
  return doc;
}

/**
 * @param {object} step
 * @param {string} locale
 * @returns {import('./workflowBlueprint.types.ts').MaterializedBlueprintStep}
 */
function materializeStep(step, locale) {
  const label = pickLocalized(step.labels, locale) || step.labels?.en || step.id;
  const base = {
    orderIndex: step.orderIndex,
    toolName: step.toolName,
    label,
    stepKind: step.stepKind === 'parallel' ? 'action' : step.stepKind,
    ...(step.inputJson && isObject(step.inputJson) ? { inputJson: step.inputJson } : {}),
  };

  const cfg = step.config;
  if (!cfg || !isObject(cfg)) {
    return base;
  }

  if (cfg.type === 'checkpoint') {
    const optionItems = Array.isArray(cfg.optionItems) ? cfg.optionItems : [];
    const prompt = pickLocalized(cfg.prompts, locale) || cfg.prompts?.en || '';
    return {
      ...base,
      configJson: {
        prompt,
        options: checkpointOptionValuesFromItems(optionItems),
        optionItems,
        outputKey: cfg.outputKey,
        ...(typeof cfg.dynamicOptions === 'string' ? { dynamicOptions: cfg.dynamicOptions } : {}),
      },
    };
  }

  if (cfg.type === 'conditional') {
    return {
      ...base,
      configJson: {
        condition: cfg.condition,
        ifTrueTool: cfg.ifTrueTool,
        ifFalseTool: cfg.ifFalseTool,
        ...(isObject(cfg.ifTrueInput) ? { ifTrueInput: cfg.ifTrueInput } : {}),
        ...(isObject(cfg.ifFalseInput) ? { ifFalseInput: cfg.ifFalseInput } : {}),
      },
    };
  }

  return {
    ...base,
    configJson: { ...cfg },
  };
}

/**
 * Materialize blueprint steps for MissionPipelineStep insertion (locale-aware).
 *
 * @param {string} missionType
 * @param {string} [locale]
 * @param {{ version?: string }} [opts]
 * @returns {import('./workflowBlueprint.types.ts').MaterializedBlueprintStep[]}
 */
export function materializeBlueprintSteps(missionType, locale = 'en', opts = {}) {
  const type = normalizeMissionType(missionType);
  const loc = normalizeLocale(locale);
  const registry = BLUEPRINT_REGISTRY[type];
  const version = normalizeSemver(opts.version ?? registry?.defaultVersion ?? '1.0.0');
  const cacheKey = `${type}:${version}:${loc}`;
  if (materializedCache.has(cacheKey)) {
    return materializedCache.get(cacheKey);
  }

  const doc = loadBlueprintDocument(type, { version });
  if (!doc || !Array.isArray(doc.steps)) return [];

  const steps = [...doc.steps]
    .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0))
    .map((step) => materializeStep(step, loc));

  materializedCache.set(cacheKey, steps);
  return steps;
}

/**
 * Build WorkflowBlueprintView-shaped object from declarative blueprint.
 *
 * @param {string} missionType
 * @param {string} [locale]
 * @param {{ version?: string }} [opts]
 * @returns {import('./executionTypes.js').WorkflowBlueprintView | null}
 */
export function loadBlueprint(missionType, locale = 'en', opts = {}) {
  const doc = loadBlueprintDocument(missionType, opts);
  if (!doc) return null;

  const materialized = materializeBlueprintSteps(missionType, locale, opts);
  const steps = materialized.map((s, i) => ({
    id: doc.steps[i]?.id ?? `step_${i}`,
    name: s.toolName ?? s.label ?? `step_${i}`,
    kind: s.stepKind ?? 'action',
    toolName: s.toolName,
    label: s.label,
    orderIndex: s.orderIndex ?? i,
    source: 'registry',
    ...(s.configJson ? { config: s.configJson } : {}),
    requiresConfirmation: s.stepKind === 'checkpoint',
  }));

  const checkpoints = steps
    .filter((s) => s.kind === 'checkpoint')
    .map((s) => ({
      step_id: s.id,
      type: 'input',
      prompt: typeof s.config?.prompt === 'string' ? s.config.prompt : s.label ?? s.name,
      options: Array.isArray(s.config?.options) ? s.config.options : undefined,
      outputKey: typeof s.config?.outputKey === 'string' ? s.config.outputKey : undefined,
      required: false,
    }));

  const dependencies = [];
  for (let i = 1; i < steps.length; i++) {
    const prev = steps[i - 1];
    const cur = steps[i];
    if (prev?.id && cur?.id) {
      dependencies.push({ step_id: cur.id, depends_on: [prev.id] });
    }
  }

  return {
    id: doc.id,
    name: doc.name,
    version: normalizeSemver(doc.version),
    steps,
    checkpoints,
    dependencies,
    metadata: {
      missionType: doc.missionType,
      ...(isObject(doc.metadata) ? doc.metadata : {}),
    },
  };
}

/**
 * Clear in-memory blueprint caches (tests / BLUEPRINT_DIR hot reload).
 */
export function invalidateBlueprintCache() {
  documentCache.clear();
  materializedCache.clear();
}

/**
 * List bundled blueprint files (diagnostics).
 * @returns {string[]}
 */
export function listBundledBlueprintFiles() {
  try {
    return readdirSync(BUNDLED_BLUEPRINT_DIR).filter((f) => f.endsWith('.json'));
  } catch {
    return [];
  }
}
