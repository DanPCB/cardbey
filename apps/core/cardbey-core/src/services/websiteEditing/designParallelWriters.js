/**
 * Parallel live design writers inventory (C1 — document only; do not disable).
 */

export const DESIGN_PARALLEL_WRITERS = Object.freeze([
  {
    id: 'mini_website_sections_patch',
    path: 'PATCH /api/mini-website/:storeId/sections',
    classification: 'unsafe_for_convergence',
    quarantineBatch: 'C5',
    removeBatch: 'C8',
    notes: 'Writes Business.stylePreferences.miniWebsite live without publishDraft',
  },
  {
    id: 'business_profile_patch',
    path: 'PATCH /api/stores/:id (profile / stylePreferences fields)',
    classification: 'public_direct',
    quarantineBatch: 'C5',
    removeBatch: null,
    notes: 'Live Business profile/brand fields; website hero may still need republish',
  },
  {
    id: 'shows_storefront_settings',
    path: 'Shows APIs → storefrontSettings.featuredWorks (+ miniWebsite mirror)',
    classification: 'public_direct',
    quarantineBatch: 'C5',
    removeBatch: null,
    notes: 'Public Shows lifecycle; distinct from theme chips but affects presentation',
  },
  {
    id: 'hero_draft_patch',
    path: 'PATCH /api/stores/:storeId/draft/hero (+ uploads)',
    classification: 'draft_safe',
    quarantineBatch: null,
    removeBatch: null,
    notes: 'Draft-authoritative when live; Class A — no auto-republish',
  },
  {
    id: 'style_chip_local_state',
    path: 'WebsitePreviewPage selectedTemplate (React state)',
    classification: 'legacy_compatibility',
    quarantineBatch: 'C2',
    removeBatch: 'C8',
    notes: 'Local-only until C2 persists to DraftStore.preview.website.theme',
  },
  {
    id: 'commit_draft_legacy',
    path: 'POST commitDraft / publish-draft',
    classification: 'unsafe_for_convergence',
    quarantineBatch: 'C5',
    removeBatch: 'C8',
    notes: 'Bypasses projection runway relative to publishDraft snapshot',
  },
  {
    id: 'publish_draft_canonical',
    path: 'publishDraft / publish_store snapshot',
    classification: 'draft_safe',
    quarantineBatch: null,
    removeBatch: null,
    notes: 'Canonical public design write via publish',
  },
]);
