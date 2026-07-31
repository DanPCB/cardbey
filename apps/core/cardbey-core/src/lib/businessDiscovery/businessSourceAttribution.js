/**
 * Runtime JS sibling for Node without TS remapping.
 * Keep behavior aligned with businessSourceAttribution.ts.
 */

/** Human-readable label per source, for UI display ("Source: Google"). */
const SOURCE_LABELS = {
  google_places: 'Google',
  website: 'Business website',
  schema_org: 'Structured data (schema.org)',
  social: 'Social profile',
  upload: 'Uploaded material',
  manual: 'Manual entry',
  apple_maps: 'Apple Maps',
  yelp: 'Yelp',
  facebook_page: 'Facebook Page',
};

/** Required attribution text for sources that mandate it. */
const SOURCE_ATTRIBUTION_TEXT = {
  google_places: 'Data provided by Google. Powered by the Google Places API.',
  yelp: 'Data provided by Yelp.',
  facebook_page: 'Data provided by Facebook.',
  apple_maps: 'Data provided by Apple Maps.',
};

export function sourceLabel(source) {
  return SOURCE_LABELS[source] ?? source;
}

export function createAttribution(params) {
  const { source, sourceUrl = null, sourceId = null, fetchedAt } = params;
  return {
    source,
    sourceUrl: sourceUrl ?? null,
    sourceId: sourceId ?? null,
    fetchedAt: fetchedAt ?? new Date().toISOString(),
    attributionText: SOURCE_ATTRIBUTION_TEXT[source] ?? null,
  };
}

/**
 * Merge a new attribution into an existing chain, de-duplicating on
 * source + sourceId + sourceUrl. Most recent fetch wins ordering.
 */
export function mergeAttributions(existing, incoming) {
  const out = Array.isArray(existing) ? [...existing] : [];
  for (const att of incoming) {
    const key = `${att.source}|${att.sourceId ?? ''}|${att.sourceUrl ?? ''}`;
    const idx = out.findIndex(
      (e) => `${e.source}|${e.sourceId ?? ''}|${e.sourceUrl ?? ''}` === key,
    );
    if (idx >= 0) out[idx] = att;
    else out.push(att);
  }
  return out;
}

/** Compact attribution suitable for UI ("Source: Google · view"). */
export function describeAttribution(att) {
  return {
    label: sourceLabel(att.source),
    url: att.sourceUrl ?? null,
    note: att.attributionText ?? null,
  };
}
