/**
 * Read-only Design presentation projection (C1).
 * Reports provenance per field; never mutates; never silently picks a conflict winner.
 */

import {
  DESIGN_ADAPTER_COMMANDS,
  DESIGN_ADAPTER_ID,
  DESIGN_PROVENANCE,
  DESIGN_READINESS,
  DESIGN_SOURCE_PRECEDENCE,
  isDesignAdapterCommandConfigured,
} from './designAdapterContract.js';
import { DESIGN_PARALLEL_WRITERS } from './designParallelWriters.js';
import {
  draftRevisionFingerprint,
  readDesignPresentationEnvelope,
} from './designPresentationEnvelope.js';
import { CANONICAL_DESIGN_PRESET_IDS } from './designPresets.js';

function parseJsonObject(value) {
  if (value == null) return null;
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

function field(value, provenance, extra = {}) {
  return {
    value: value === undefined ? null : value,
    provenance,
    ...extra,
  };
}

/**
 * @param {object} args
 * @param {object|null} args.business
 * @param {object|null} args.draft
 * @param {object} args.editingContext — from resolveWebsiteEditingContext
 * @param {boolean} args.flagEnabled
 */
export function buildDesignPresentationProjection({
  business = null,
  draft = null,
  editingContext = null,
  flagEnabled = false,
  mutationCapabilities = null,
}) {
  const mutations = {
    setTemplate: Boolean(flagEnabled && (mutationCapabilities?.setTemplate ?? isDesignAdapterCommandConfigured('setTemplate'))),
    setHero: Boolean(flagEnabled && (mutationCapabilities?.setHero ?? isDesignAdapterCommandConfigured('setHero'))),
  };

  if (!flagEnabled) {
    return {
      ok: true,
      adapterId: DESIGN_ADAPTER_ID,
      readiness: DESIGN_READINESS.NOT_ENABLED,
      commandsConfigured: Object.fromEntries(
        DESIGN_ADAPTER_COMMANDS.map((c) => [c, isDesignAdapterCommandConfigured(c)]),
      ),
      mutationCapabilities: { setTemplate: false, setHero: false },
      sourcePrecedence: DESIGN_SOURCE_PRECEDENCE,
      parallelWriters: DESIGN_PARALLEL_WRITERS,
      supportedPresets: CANONICAL_DESIGN_PRESET_IDS,
      projection: null,
      conflicts: [],
      diagnostics: ['flag_off'],
    };
  }

  const conflicts = [];
  const stylePrefs = parseJsonObject(business?.stylePreferences) || {};
  const miniWebsite =
    stylePrefs.miniWebsite && typeof stylePrefs.miniWebsite === 'object'
      ? stylePrefs.miniWebsite
      : null;
  const draftPreview = parseJsonObject(draft?.preview) || {};
  const draftWebsite =
    draftPreview.website && typeof draftPreview.website === 'object' ? draftPreview.website : null;
  const draftTheme =
    draftWebsite?.theme && typeof draftWebsite.theme === 'object' ? draftWebsite.theme : null;
  const liveTheme =
    miniWebsite?.theme && typeof miniWebsite.theme === 'object' ? miniWebsite.theme : null;
  const envelope = readDesignPresentationEnvelope(draftPreview);

  const explicitTemplate = envelope?.templateId ?? null;
  const draftTemplate = draftTheme?.templateId ?? null;
  const liveTemplate = liveTheme?.templateId ?? null;
  let templateProvenance = DESIGN_PROVENANCE.MISSING;
  let templateValue = null;
  if (explicitTemplate != null) {
    templateProvenance = DESIGN_PROVENANCE.DRAFT_STORE;
    templateValue = explicitTemplate;
    if (liveTemplate != null && String(liveTemplate) !== String(explicitTemplate)) {
      conflicts.push({
        field: 'templateId',
        sources: ['approved_canonical_draft_design', DESIGN_PROVENANCE.MINI_WEBSITE],
        draft: explicitTemplate,
        live: liveTemplate,
        note: 'explicit_draft_wins_after_c2_mutation',
      });
    }
  } else if (draftTemplate != null && liveTemplate != null && String(draftTemplate) !== String(liveTemplate)) {
    templateProvenance = DESIGN_PROVENANCE.CONFLICT;
    templateValue = { draft: draftTemplate, live: liveTemplate };
    conflicts.push({
      field: 'templateId',
      sources: [DESIGN_PROVENANCE.DRAFT_STORE, DESIGN_PROVENANCE.MINI_WEBSITE],
      draft: draftTemplate,
      live: liveTemplate,
    });
  } else if (draftTemplate != null) {
    templateProvenance = DESIGN_PROVENANCE.DRAFT_STORE;
    templateValue = draftTemplate;
  } else if (liveTemplate != null) {
    templateProvenance = DESIGN_PROVENANCE.MINI_WEBSITE;
    templateValue = liveTemplate;
  }

  const draftHero = {
    imageUrl: draftPreview.heroImageUrl ?? draftPreview.heroImage ?? null,
    videoUrl: draftPreview.heroVideoUrl ?? draftPreview.heroVideo ?? null,
  };
  const liveHero = {
    imageUrl: business?.heroImageUrl ?? null,
    videoUrl: stylePrefs.heroVideo ?? stylePrefs.heroVideoUrl ?? null,
  };
  const heroConflict =
    (draftHero.imageUrl || draftHero.videoUrl) &&
    (liveHero.imageUrl || liveHero.videoUrl) &&
    (String(draftHero.imageUrl || '') !== String(liveHero.imageUrl || '') ||
      String(draftHero.videoUrl || '') !== String(liveHero.videoUrl || ''));
  if (heroConflict) {
    conflicts.push({
      field: 'hero',
      sources: [DESIGN_PROVENANCE.DRAFT_STORE, DESIGN_PROVENANCE.BUSINESS_STYLE_PREFERENCES],
      draft: draftHero,
      live: liveHero,
    });
  }

  const draftSections = Array.isArray(draftWebsite?.sections) ? draftWebsite.sections : null;
  const liveSections = Array.isArray(miniWebsite?.sections) ? miniWebsite.sections : null;
  if (draftSections && liveSections) {
    const dOrder = draftSections.map((s) => s?.type || s?.id).join('|');
    const lOrder = liveSections.map((s) => s?.type || s?.id).join('|');
    if (dOrder !== lOrder) {
      conflicts.push({
        field: 'sectionOrder',
        sources: [DESIGN_PROVENANCE.DRAFT_STORE, DESIGN_PROVENANCE.MINI_WEBSITE],
        draft: dOrder,
        live: lOrder,
      });
    }
  }

  const brandTone = business?.brandTone ?? null;
  const brandStyle = business?.brandStyle ?? null;
  const brandColors = business?.brandColors ?? null;
  const hasBrand =
    brandTone != null || brandStyle != null || brandColors != null;

  const compositionMeta =
    stylePrefs.compositionAdoption ||
    stylePrefs.websiteDirection ||
    stylePrefs.designAdoption ||
    null;

  let readiness = DESIGN_READINESS.READ_ONLY_CONTRACT_READY;
  if (!draft?.id && !editingContext?.draftId) {
    readiness = DESIGN_READINESS.BLOCKED_BY_MISSING_DRAFT;
  } else if (conflicts.length > 0) {
    readiness = DESIGN_READINESS.SOURCE_CONFLICT;
  } else if (compositionMeta && compositionMeta.status === 'stale') {
    readiness = DESIGN_READINESS.BLOCKED_BY_COMPOSITION_STATE;
  }

  const projection = {
    version: 'design_presentation_projection.v1',
    storeId: editingContext?.storeId || business?.id || null,
    draftId: editingContext?.draftId || draft?.id || null,
    editingKind: editingContext?.editingKind || null,
    template: field(templateValue, templateProvenance),
    designTokens: field(draftTheme?.tokens ?? liveTheme?.tokens ?? null, draftTheme?.tokens
      ? DESIGN_PROVENANCE.DRAFT_STORE
      : liveTheme?.tokens
        ? DESIGN_PROVENANCE.MINI_WEBSITE
        : DESIGN_PROVENANCE.MISSING),
    colours: field(
      brandColors ?? draftTheme?.colors ?? liveTheme?.colors ?? null,
      brandColors
        ? DESIGN_PROVENANCE.BRAND_PROFILE
        : draftTheme?.colors
          ? DESIGN_PROVENANCE.DRAFT_STORE
          : liveTheme?.colors
            ? DESIGN_PROVENANCE.MINI_WEBSITE
            : DESIGN_PROVENANCE.MISSING,
    ),
    typography: field(
      draftTheme?.typography ?? liveTheme?.typography ?? null,
      draftTheme?.typography
        ? DESIGN_PROVENANCE.DRAFT_STORE
        : liveTheme?.typography
          ? DESIGN_PROVENANCE.MINI_WEBSITE
          : DESIGN_PROVENANCE.MISSING,
    ),
    hero: field(
      heroConflict ? { draft: draftHero, live: liveHero } : draftHero.imageUrl || draftHero.videoUrl ? draftHero : liveHero,
      heroConflict
        ? DESIGN_PROVENANCE.CONFLICT
        : draftHero.imageUrl || draftHero.videoUrl
          ? DESIGN_PROVENANCE.DRAFT_STORE
          : liveHero.imageUrl || liveHero.videoUrl
            ? DESIGN_PROVENANCE.BUSINESS_STYLE_PREFERENCES
            : DESIGN_PROVENANCE.MISSING,
    ),
    layoutVariant: field(
      draftTheme?.layoutVariant ?? liveTheme?.layoutVariant ?? null,
      draftTheme?.layoutVariant
        ? DESIGN_PROVENANCE.DRAFT_STORE
        : liveTheme?.layoutVariant
          ? DESIGN_PROVENANCE.MINI_WEBSITE
          : DESIGN_PROVENANCE.MISSING,
    ),
    sectionOrder: field(
      draftSections
        ? draftSections.map((s) => s?.type || s?.id)
        : liveSections
          ? liveSections.map((s) => s?.type || s?.id)
          : null,
      draftSections
        ? DESIGN_PROVENANCE.DRAFT_STORE
        : liveSections
          ? DESIGN_PROVENANCE.MINI_WEBSITE
          : DESIGN_PROVENANCE.MISSING,
    ),
    sectionVisibility: field(null, DESIGN_PROVENANCE.MISSING),
    brandProfile: field(
      hasBrand ? { brandTone, brandStyle, brandColors } : null,
      hasBrand ? DESIGN_PROVENANCE.BRAND_PROFILE : DESIGN_PROVENANCE.MISSING,
    ),
    websiteDirection: field(
      stylePrefs.websiteDirection ?? null,
      stylePrefs.websiteDirection
        ? DESIGN_PROVENANCE.WEBSITE_DIRECTION
        : DESIGN_PROVENANCE.MISSING,
    ),
    compositionAdoption: field(
      compositionMeta,
      compositionMeta ? DESIGN_PROVENANCE.COMPOSITION_ADOPTION : DESIGN_PROVENANCE.MISSING,
    ),
    publicReleaseRef: field(
      {
        publishedAt: business?.publishedAt ?? null,
        isActive: business?.isActive ?? null,
        slug: business?.slug ?? null,
      },
      business ? DESIGN_PROVENANCE.BUSINESS_STYLE_PREFERENCES : DESIGN_PROVENANCE.MISSING,
    ),
  };

  return {
    ok: true,
    adapterId: DESIGN_ADAPTER_ID,
    readiness,
    commandsConfigured: Object.fromEntries(
      DESIGN_ADAPTER_COMMANDS.map((c) => [c, isDesignAdapterCommandConfigured(c)]),
    ),
    mutationCapabilities: mutations,
    supportedPresets: CANONICAL_DESIGN_PRESET_IDS,
    fingerprint: draft ? draftRevisionFingerprint(draft) : null,
    designEnvelope: envelope,
    unpublishedDesignChanges: Boolean(envelope?.templateId || envelope?.heroRef),
    sourcePrecedence: DESIGN_SOURCE_PRECEDENCE,
    parallelWriters: DESIGN_PARALLEL_WRITERS,
    projection,
    conflicts,
    diagnostics: buildDiagnosticsHints({
      conflicts,
      draft,
      miniWebsite,
      draftTemplate: explicitTemplate || draftTemplate,
      liveTemplate,
      envelope,
      mutations,
      compositionMeta,
    }),
  };
}

function buildDiagnosticsHints({
  conflicts,
  draft,
  miniWebsite,
  draftTemplate,
  liveTemplate,
  envelope,
  mutations,
  compositionMeta,
}) {
  const hints = [];
  if (!draft?.id) hints.push('missing_draft');
  if (liveTemplate && !draftTemplate) hints.push('style_preset_only_in_mini_website');
  if (miniWebsite && !draft?.preview) hints.push('mini_website_without_draft_preview');
  if (conflicts.some((c) => c.field === 'hero')) hints.push('hero_mismatch');
  if (conflicts.some((c) => c.field === 'sectionOrder')) hints.push('section_order_mismatch');
  if (conflicts.some((c) => c.field === 'templateId')) hints.push('template_mismatch');
  if (conflicts.length > 1) hints.push('multiple_design_sources_claiming_authority');
  hints.push('live_writer_risk_documented');
  if (envelope?.templateId) hints.push('canonical_draft_design_persisted');
  if (mutations?.setTemplate) hints.push('template_mutation_available');
  if (mutations?.setHero) hints.push('hero_mutation_available');
  if (compositionMeta?.status === 'stale') hints.push('composition_brand_stale');
  hints.push('preview_consumption_may_require_c4');
  hints.push('public_write_quarantine_pending_c5');
  return hints;
}
