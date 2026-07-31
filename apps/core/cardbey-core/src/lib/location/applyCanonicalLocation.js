import {
  DEMO_FALLBACK_LOCATION_NAMES,
  logLocationGenerationMismatch,
  resolveCanonicalBusinessLocation
} from "./resolveCanonicalBusinessLocation.js";
function trim(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function localityTokens(loc) {
  const out = /* @__PURE__ */ new Set();
  for (const part of [loc?.city, loc?.suburb, loc?.region, loc?.country, loc?.displayLocation]) {
    const t = trim(part)?.toLowerCase();
    if (t) out.add(t);
  }
  return out;
}
function generatedLocationFromPreview(preview) {
  if (!preview || typeof preview !== "object") {
    return { city: null, suburb: null, region: null, country: null, location: null };
  }
  const contact = preview.contact && typeof preview.contact === "object" && !Array.isArray(preview.contact) ? preview.contact : {};
  return {
    city: trim(preview.city),
    suburb: trim(preview.suburb),
    region: trim(preview.region ?? preview.state),
    country: trim(preview.country),
    location: trim(preview.location ?? contact.address)
  };
}
function locationsConflict(canonical, generated) {
  const canonicalTokens = localityTokens(canonical);
  if (!canonicalTokens.size) return false;
  const genParts = [generated.city, generated.suburb, generated.region, generated.country, generated.location].map((p) => trim(p)).filter(Boolean);
  if (!genParts.length) return false;
  for (const part of genParts) {
    const lower = part.toLowerCase();
    if (DEMO_FALLBACK_LOCATION_NAMES.has(lower) && !canonicalTokens.has(lower)) return true;
    const firstToken = lower.split(",")[0]?.trim();
    if (firstToken && DEMO_FALLBACK_LOCATION_NAMES.has(firstToken) && !canonicalTokens.has(firstToken)) {
      return true;
    }
  }
  const genJoined = genParts.join(" ").toLowerCase();
  for (const token of canonicalTokens) {
    if (genJoined.includes(token)) return false;
  }
  const major = ["austin", "singapore", "melbourne", "sydney", "carlton", "fitzroy"];
  for (const m of major) {
    if (genJoined.includes(m) && !canonicalTokens.has(m)) return true;
  }
  return false;
}
function buildResolveInputFromDraftInput(draftInput) {
  const input = draftInput && typeof draftInput === "object" ? draftInput : {};
  const seed = input.businessSnapshot && typeof input.businessSnapshot === "object" ? input.businessSnapshot : null;
  const canonicalFromInput = input.canonicalLocation && typeof input.canonicalLocation === "object" ? input.canonicalLocation : null;
  return {
    userPrompt: trim(input.prompt) ?? trim(input.rawUserText),
    locationText: trim(input.location),
    address: trim(input.address),
    suburb: trim(input.suburb),
    city: trim(input.city),
    region: trim(input.region),
    state: trim(input.state),
    country: trim(input.country),
    operatingRegion: trim(input.operatingRegion),
    latitude: typeof input.lat === "number" ? input.lat : null,
    longitude: typeof input.lng === "number" ? input.lng : null,
    seed: seed ? {
      address: trim(seed.address),
      city: trim(seed.city),
      suburb: trim(seed.suburb),
      state: trim(seed.state),
      country: trim(seed.country),
      operatingRegion: trim(seed.operatingRegion)
    } : input.seedId ? {
      address: trim(input.address),
      city: trim(input.city),
      suburb: trim(input.suburb),
      state: trim(input.state),
      country: trim(input.country),
      operatingRegion: trim(input.operatingRegion)
    } : null,
    biSnapshot: seed ? {
      address: trim(seed.address),
      city: trim(seed.city),
      suburb: trim(seed.suburb),
      region: trim(seed.region ?? seed.state),
      country: trim(seed.country)
    } : null,
    missionContext: canonicalFromInput ? { canonicalLocation: canonicalFromInput, location: trim(input.location) } : { location: trim(input.location) }
  };
}
function applyCanonicalLocationToPreview(preview, canonical, trace = {}) {
  const generated = generatedLocationFromPreview(preview);
  if (locationsConflict(canonical, generated)) {
    logLocationGenerationMismatch({
      ...trace,
      inputLocation: trace.inputLocation ?? null,
      canonicalLocation: canonical,
      generatedLocation: generated,
      sourceUsed: canonical.source
    });
  }
  const contact = preview.contact && typeof preview.contact === "object" && !Array.isArray(preview.contact) ? { ...preview.contact } : {};
  if (canonical.addressLine) contact.address = canonical.addressLine;
  preview.contact = contact;
  preview.location = canonical.displayLocation;
  preview.suburb = canonical.suburb;
  preview.city = canonical.city ?? canonical.suburb;
  preview.state = canonical.region;
  preview.region = canonical.region;
  preview.country = canonical.country;
  if (canonical.latitude != null) preview.lat = canonical.latitude;
  if (canonical.longitude != null) preview.lng = canonical.longitude;
  preview.meta = {
    ...preview.meta && typeof preview.meta === "object" ? preview.meta : {},
    canonicalLocation: canonical,
    locationSource: canonical.source
  };
  return preview;
}
function draftColumnPatchFromCanonical(canonical) {
  return {
    address: canonical.addressLine,
    suburb: canonical.suburb,
    state: canonical.region,
    country: canonical.country,
    lat: canonical.latitude,
    lng: canonical.longitude
  };
}
function businessColumnPatchFromCanonical(canonical) {
  return {
    address: canonical.addressLine,
    suburb: canonical.suburb,
    state: canonical.region,
    country: canonical.country,
    lat: canonical.latitude,
    lng: canonical.longitude
  };
}
function resolveAndApplyCanonicalLocationForDraft(args) {
  const resolveInput = buildResolveInputFromDraftInput(args.draftInput ?? null);
  const canonical = resolveCanonicalBusinessLocation(resolveInput);
  const preview = applyCanonicalLocationToPreview(
    args.preview && typeof args.preview === "object" ? { ...args.preview } : {},
    canonical,
    {
      ...args.trace ?? {},
      inputLocation: resolveInput.locationText ?? resolveInput.address ?? resolveInput.userPrompt ?? null,
      canonicalLocation: canonical
    }
  );
  return {
    canonical,
    preview,
    columnPatch: draftColumnPatchFromCanonical(canonical),
    inputPatch: { canonicalLocation: canonical, location: canonical.displayLocation }
  };
}
function mergeCanonicalContactForPublish(contactFields, canonical) {
  if (canonical.source === "unavailable") return contactFields;
  return {
    ...contactFields,
    address: contactFields.address ?? canonical.addressLine,
    suburb: canonical.suburb ?? canonical.city ?? contactFields.suburb ?? null,
    state: canonical.region ?? contactFields.state ?? null,
    country: canonical.country ?? contactFields.country ?? null,
    lat: contactFields.lat ?? canonical.latitude,
    lng: contactFields.lng ?? canonical.longitude
  };
}
export {
  applyCanonicalLocationToPreview,
  buildResolveInputFromDraftInput,
  businessColumnPatchFromCanonical,
  draftColumnPatchFromCanonical,
  mergeCanonicalContactForPublish,
  resolveAndApplyCanonicalLocationForDraft
};
