/**
 * Central artifact type registry — canonical types + aliases per mission family.
 * Artifact authority resolves types through this registry instead of per-family hardcoding.
 */

/** @typedef {{ canonical: string; aliases: string[]; mandatoryByDefault?: boolean }} ArtifactFamilyEntry */

/** @type {Record<string, ArtifactFamilyEntry>} */
export const ARTIFACT_REGISTRY = Object.freeze({
  loyalty: Object.freeze({
    canonical: 'generated_loyalty_program',
    aliases: [
      'generated_loyalty_program',
      'loyalty_program_draft',
      'loyalty',
      'text_asset',
    ],
    mandatoryByDefault: true,
  }),
  campaign: Object.freeze({
    canonical: 'campaign_package',
    aliases: ['campaign_package', 'campaign'],
    mandatoryByDefault: true,
  }),
  store: Object.freeze({
    canonical: 'store',
    aliases: ['store'],
    mandatoryByDefault: true,
  }),
  catalog: Object.freeze({
    canonical: 'catalog',
    aliases: ['catalog'],
    mandatoryByDefault: true,
  }),
  video: Object.freeze({
    canonical: 'video',
    aliases: ['video', 'promotional_video'],
    mandatoryByDefault: false,
  }),
  poster: Object.freeze({
    canonical: 'poster',
    aliases: ['poster', 'image', 'graphic'],
    mandatoryByDefault: false,
  }),
  content: Object.freeze({
    canonical: 'content',
    aliases: ['content', 'text_asset', 'document'],
    mandatoryByDefault: false,
  }),
});

/** @type {Map<string, string>} */
const aliasToCanonical = new Map();
/** @type {Map<string, string[]>} */
const canonicalToAliases = new Map();

for (const entry of Object.values(ARTIFACT_REGISTRY)) {
  canonicalToAliases.set(entry.canonical, [...entry.aliases]);
  for (const alias of entry.aliases) {
    aliasToCanonical.set(alias, entry.canonical);
  }
  aliasToCanonical.set(entry.canonical, entry.canonical);
}

/**
 * @param {string | null | undefined} rawType
 * @returns {string}
 */
export function resolveCanonicalArtifactType(rawType) {
  const key = String(rawType ?? '').trim();
  if (!key) return '';
  return aliasToCanonical.get(key) ?? key;
}

/**
 * @param {string} expectedType
 * @returns {string[]}
 */
export function getAliasesForExpectedType(expectedType) {
  const canonical = resolveCanonicalArtifactType(expectedType);
  return canonicalToAliases.get(canonical) ?? [expectedType];
}

/**
 * @param {import('../artifacts/artifactContract.js').OperationalArtifact | Record<string, unknown> | null | undefined} artifact
 * @param {string} expectedType
 */
export function matchesArtifactFamily(artifact, expectedType) {
  if (!artifact) return false;
  const aliases = getAliasesForExpectedType(expectedType);
  const subtype = String(artifact.subtype ?? '').trim();
  const type = String(artifact.type ?? '').trim();
  const artifactType = String(
    /** @type {Record<string, unknown>} */ (artifact).artifactType ?? '',
  ).trim();
  const canonicalSubtype = resolveCanonicalArtifactType(subtype);
  const canonicalType = resolveCanonicalArtifactType(type);
  const canonicalArtifactType = resolveCanonicalArtifactType(artifactType);
  const expectedCanonical = resolveCanonicalArtifactType(expectedType);

  return (
    aliases.includes(subtype) ||
    aliases.includes(type) ||
    aliases.includes(artifactType) ||
    canonicalSubtype === expectedCanonical ||
    canonicalType === expectedCanonical ||
    canonicalArtifactType === expectedCanonical ||
    (expectedCanonical === 'generated_loyalty_program' &&
      subtype === 'generated_loyalty_program' &&
      type === 'text_asset')
  );
}

/**
 * @param {string | null | undefined} missionFamily
 * @returns {ArtifactFamilyEntry | null}
 */
export function registryEntryForMissionFamily(missionFamily) {
  const key = String(missionFamily ?? '').trim().toLowerCase();
  return ARTIFACT_REGISTRY[key] ?? null;
}
