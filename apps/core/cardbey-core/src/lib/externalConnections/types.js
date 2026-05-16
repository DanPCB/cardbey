/**
 * External Connections — shared vocabulary for pull (ingest) and push (distribute).
 *
 * Mission Execution owns tools and callbacks; UI only displays/opens URLs.
 * This module is types/constants only — no I/O.
 */

/** @typedef {'pull' | 'push'} CapabilityDirection */

/** Normalized capability keys (extensible; tools map to these over time). */
export const EXTERNAL_CAPABILITY = Object.freeze({
  OAUTH_CONNECT: 'oauth_connect',
  PUBLISH_CAMPAIGN: 'publish_campaign',
  SHARE_LINK: 'share_link',
  IMPORT_BUSINESS_PROFILE: 'import_business_profile',
  IMPORT_CATALOG: 'import_catalog',
  FETCH_EXTERNAL_PREVIEW: 'fetch_external_preview',
  APPLY_TO_DRAFT: 'apply_external_source_to_draft',
});

/** How the connection is established (one record may combine kinds later; v1 is mostly oauth_token for Meta). */
export const CONNECTION_KIND = Object.freeze({
  OAUTH_TOKEN: 'oauth_token',
  URL_SOURCE: 'url_source',
  MANUAL: 'manual',
});
