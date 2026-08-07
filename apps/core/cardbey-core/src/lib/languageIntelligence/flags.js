/**
 * Language Intelligence flags (Phases 1–5A + Auto Resolution Stage 0–2).
 *
 * isLanguageIntelligenceAuthoritative() remains false — no default public/chat cutover.
 * Auto-resolution flags fail closed (off in production when unset).
 */

function parseBoolEnv(raw, defaultValue) {
  const normalized = String(raw ?? '').trim().toLowerCase();
  if (normalized === 'false' || normalized === '0' || normalized === 'off' || normalized === 'no') {
    return false;
  }
  if (normalized === 'true' || normalized === '1' || normalized === 'on' || normalized === 'yes') {
    return true;
  }
  return defaultValue;
}

function isNonProductionDeploy() {
  const deployEnv = String(process.env.CARDEY_DEPLOY_ENV || process.env.RENDER_SERVICE_NAME || '')
    .trim()
    .toLowerCase();
  if (deployEnv.includes('staging') || deployEnv === 'development' || deployEnv === 'dev') {
    return true;
  }
  return process.env.NODE_ENV !== 'production';
}

/** Fail-closed: production off unless explicitly enabled. */
function failClosedFlag(envName) {
  const raw = process.env[envName];
  if (raw != null && String(raw).trim() !== '') {
    return parseBoolEnv(raw, false);
  }
  return false;
}

export function isLanguageIntelligenceV1Enabled() {
  const raw = process.env.ENABLE_LANGUAGE_INTELLIGENCE_V1;
  if (raw != null && String(raw).trim() !== '') {
    return parseBoolEnv(raw, false);
  }
  return isNonProductionDeploy();
}

export function isLanguageIntelligenceEngineV1Enabled() {
  if (!isLanguageIntelligenceV1Enabled()) return false;
  const raw = process.env.ENABLE_LANGUAGE_INTELLIGENCE_ENGINE_V1;
  if (raw != null && String(raw).trim() !== '') {
    return parseBoolEnv(raw, false);
  }
  return isNonProductionDeploy();
}

export function isLanguageIntelligenceConversationV1Enabled() {
  if (!isLanguageIntelligenceEngineV1Enabled()) return false;
  const raw = process.env.ENABLE_LANGUAGE_INTELLIGENCE_CONVERSATION_V1;
  if (raw != null && String(raw).trim() !== '') {
    return parseBoolEnv(raw, false);
  }
  return isNonProductionDeploy();
}

export function isLanguageIntelligenceStorefrontLocalizerV1Enabled() {
  if (!isLanguageIntelligenceEngineV1Enabled()) return false;
  const raw = process.env.ENABLE_LANGUAGE_INTELLIGENCE_STOREFRONT_LOCALIZER_V1;
  if (raw != null && String(raw).trim() !== '') {
    return parseBoolEnv(raw, false);
  }
  return isNonProductionDeploy();
}

export function isLanguageIntelligencePreferencesV1Enabled() {
  if (!isLanguageIntelligenceEngineV1Enabled()) return false;
  const raw = process.env.ENABLE_LANGUAGE_INTELLIGENCE_PREFERENCES_V1;
  if (raw != null && String(raw).trim() !== '') {
    return parseBoolEnv(raw, false);
  }
  return isNonProductionDeploy();
}

export function isLanguageIntelligenceConsumptionV1Enabled() {
  if (!isLanguageIntelligenceEngineV1Enabled()) return false;
  const raw = process.env.ENABLE_LANGUAGE_INTELLIGENCE_CONSUMPTION_V1;
  if (raw != null && String(raw).trim() !== '') {
    return parseBoolEnv(raw, false);
  }
  return isNonProductionDeploy();
}

/**
 * Stage 0 — shadow auto resolution + diagnostics.
 * Fail closed (off in production when unset).
 */
export function isLanguageAutoResolutionV1Enabled() {
  if (!isLanguageIntelligenceEngineV1Enabled()) return false;
  return failClosedFlag('ENABLE_LANGUAGE_AUTO_RESOLUTION_V1');
}

/**
 * Stage 1 — GET /api/language-intelligence/resolve
 * Fail closed.
 */
export function isLanguageResolveApiV1Enabled() {
  if (!isLanguageAutoResolutionV1Enabled()) return false;
  return failClosedFlag('ENABLE_LANGUAGE_RESOLVE_API_V1');
}

/**
 * Stage 2 — guest cookie cardbey_language
 * Fail closed.
 */
export function isLanguageVisitorPreferenceV1Enabled() {
  if (!isLanguageAutoResolutionV1Enabled()) return false;
  return failClosedFlag('ENABLE_LANGUAGE_VISITOR_PREFERENCE_V1');
}

/**
 * Stage 3 — dashboard i18next ↔ account preference bridge (diagnostics / feature snapshot).
 * Fail closed. Does not make LI authoritative; client gate is VITE_ENABLE_LANGUAGE_DASHBOARD_PREF_BRIDGE_V1.
 */
export function isLanguageDashboardPrefBridgeV1Enabled() {
  if (!isLanguageIntelligencePreferencesV1Enabled()) return false;
  return failClosedFlag('ENABLE_LANGUAGE_DASHBOARD_PREF_BRIDGE_V1');
}

/**
 * Stage 4 — public storefront consumption cutover.
 * Fail closed. Requires auto-resolution. Still non-authoritative globally.
 */
export function isLanguageStorefrontConsumptionCutoverV1Enabled() {
  if (!isLanguageAutoResolutionV1Enabled()) return false;
  return failClosedFlag('ENABLE_LANGUAGE_STOREFRONT_CONSUMPTION_CUTOVER_V1');
}

/**
 * Stage 4 — storefront language selector UI (server-side allow signal; client also gated by Vite flag).
 * Fail closed. Requires cutover flag.
 */
export function isLanguageStorefrontSelectorV1Enabled() {
  if (!isLanguageStorefrontConsumptionCutoverV1Enabled()) return false;
  return failClosedFlag('ENABLE_LANGUAGE_STOREFRONT_SELECTOR_V1');
}

/** Stage 5A — owner language settings APIs / panel */
export function isLanguageStorefrontOwnerControlsV1Enabled() {
  if (!isLanguageStorefrontConsumptionCutoverV1Enabled()) return false;
  return failClosedFlag('ENABLE_LANGUAGE_STOREFRONT_OWNER_CONTROLS_V1');
}

/** Stage 5A — translation approval enforcement on public consume */
export function isLanguageTranslationApprovalV1Enabled() {
  if (!isLanguageStorefrontConsumptionCutoverV1Enabled()) return false;
  return failClosedFlag('ENABLE_LANGUAGE_TRANSLATION_APPROVAL_V1');
}

/** Stage 5A — readiness evaluator */
export function isLanguageTranslationReadinessV1Enabled() {
  if (!isLanguageStorefrontOwnerControlsV1Enabled()) return false;
  return failClosedFlag('ENABLE_LANGUAGE_TRANSLATION_READINESS_V1');
}

/** Stage 5A — pilot enrollment */
export function isLanguageStorefrontPilotEnrollmentV1Enabled() {
  if (!isLanguageStorefrontConsumptionCutoverV1Enabled()) return false;
  return failClosedFlag('ENABLE_LANGUAGE_STOREFRONT_PILOT_ENROLLMENT_V1');
}

/** Stage 5A — pilot diagnostics */
export function isLanguageStorefrontPilotDiagnosticsV1Enabled() {
  if (!isLanguageStorefrontPilotEnrollmentV1Enabled()) return false;
  return failClosedFlag('ENABLE_LANGUAGE_STOREFRONT_PILOT_DIAGNOSTICS_V1');
}

/**
 * Block editArtifact translate intents that would overwrite canonical fields.
 * Default ON when engine enabled; set ENABLE_LANGUAGE_BLOCK_EDIT_ARTIFACT_TRANSLATE=false to disable.
 */
export function isLanguageBlockEditArtifactTranslateEnabled() {
  const raw = process.env.ENABLE_LANGUAGE_BLOCK_EDIT_ARTIFACT_TRANSLATE;
  if (raw != null && String(raw).trim() !== '') {
    return parseBoolEnv(raw, true);
  }
  return isLanguageIntelligenceEngineV1Enabled();
}

export function isLanguageIntelligenceAuthoritative() {
  return false;
}
