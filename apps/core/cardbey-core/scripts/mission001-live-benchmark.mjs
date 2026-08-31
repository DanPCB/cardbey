/**
 * Mission 001 Gate 10 — LIVE staging benchmark (opt-in).
 *
 * Runs public Places/website research + Mission 001 grounding/fidelity path.
 * Never publishes, never emails/calls businesses, never claims ownership.
 *
 * Usage (from apps/core/cardbey-core):
 *   MISSION_001_LIVE_BENCHMARK=1 node --import tsx/esm scripts/mission001-live-benchmark.mjs
 *   MISSION_001_LIVE_BENCHMARK=1 node --import tsx/esm scripts/mission001-live-benchmark.mjs --limit=5
 *   MISSION_001_LIVE_BENCHMARK=1 node --import tsx/esm scripts/mission001-live-benchmark.mjs --mode=generate --limit=3
 *   MISSION_001_LIVE_BENCHMARK=1 node --import tsx/esm scripts/mission001-live-benchmark.mjs --json --out=mission001-live.json
 *
 * Modes:
 *   research  — live research + grounding + fidelity (default; no draft persistence required for core path)
 *   generate  — createDraft + generateDraft (includeImages=false by default); never commit/publish
 */
import { pathToFileURL } from 'url';
import path from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync, mkdirSync } from 'fs';
import { config as loadDotenv } from 'dotenv';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
loadDotenv({ path: path.join(root, '.env') });
loadDotenv({ path: path.join(root, '.env.local'), override: true });

function argValue(name, fallback = null) {
  const hit = process.argv.find((a) => a.startsWith(`${name}=`));
  if (!hit) return fallback;
  return hit.slice(name.length + 1);
}

function hasFlag(name) {
  return process.argv.includes(name);
}

if (process.env.MISSION_001_LIVE_BENCHMARK !== '1') {
  console.error(
    'Refusing to run: set MISSION_001_LIVE_BENCHMARK=1 to opt into live Places/website research.\n' +
      'This runner never publishes or contacts businesses; it only reads public sources.',
  );
  process.exit(2);
}

process.env.ENABLE_MISSION_001_STORE_FIDELITY_V1 = process.env.ENABLE_MISSION_001_STORE_FIDELITY_V1 ?? '1';
process.env.ENABLE_MISSION_001_GROUNDING_V1 = process.env.ENABLE_MISSION_001_GROUNDING_V1 ?? '1';
process.env.ENABLE_MISSION_001_NAME_RESOLUTION_V1 = process.env.ENABLE_MISSION_001_NAME_RESOLUTION_V1 ?? '1';
process.env.ENABLE_MISSION_001_SPARSE_MODE_V1 = process.env.ENABLE_MISSION_001_SPARSE_MODE_V1 ?? '1';
process.env.ENABLE_MISSION_001_PROVENANCE_V1 = process.env.ENABLE_MISSION_001_PROVENANCE_V1 ?? '1';
process.env.ENABLE_MISSION_001_FIDELITY_GATE_V1 = process.env.ENABLE_MISSION_001_FIDELITY_GATE_V1 ?? '1';
process.env.ENABLE_MISSION_001_TARGETED_REPAIR_V1 = process.env.ENABLE_MISSION_001_TARGETED_REPAIR_V1 ?? '1';
process.env.ENABLE_MISSION_001_PIPELINE_TIMING_V1 = process.env.ENABLE_MISSION_001_PIPELINE_TIMING_V1 ?? '1';
process.env.ENABLE_MISSION_001_OFFERING_RECONSTRUCTION_V1 =
  process.env.ENABLE_MISSION_001_OFFERING_RECONSTRUCTION_V1 ?? '1';
process.env.ENABLE_STORE_RESEARCH_PIPELINE = process.env.ENABLE_STORE_RESEARCH_PIPELINE ?? '1';

const mode = String(argValue('--mode', 'research')).trim().toLowerCase();
const limitRaw = argValue('--limit', null);
const limit = limitRaw != null ? Math.max(1, Number(limitRaw) || 1) : null;
const idsRaw = argValue('--ids', null);
const idFilter = idsRaw
  ? new Set(
      idsRaw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    )
  : null;
const includeImages = hasFlag('--include-images');
const outPath = argValue('--out', null);
const wantJson = hasFlag('--json') || Boolean(outPath);

const {
  MISSION001_BENCHMARK_FIXTURES,
  resolveLiveInput,
  normalizeBenchmarkRow,
  summarizeBenchmarkRows,
} = await import(pathToFileURL(path.join(root, 'src/lib/mission001/benchmarkFixtures.js')).href);
const {
  classifyMission001Failure,
  summarizeFailureTaxonomy,
  computeOfferingReconstructionRate,
  computeFalseOfferingRate,
  summarizeByVertical,
  offeringsPubliclyExpected,
} = await import(pathToFileURL(path.join(root, 'src/lib/mission001/failureTaxonomy.js')).href);
const {
  classifyBusinessResolution,
  computeMission001ResolutionMetrics,
  parseLocationParts,
  BUSINESS_RESOLUTION_OUTCOME,
} = await import(
  pathToFileURL(path.join(root, 'src/lib/mission001/businessResolutionOutcomes.js')).href
);
const { resolveNameOnlyInputForResearch, isNameOnlyResearchInput } = await import(
  pathToFileURL(path.join(root, 'src/lib/mission001/nameOnlyResolution.js')).href
);
const { buildGroundedCatalogFromResearch, catalogDiffersFromGenericScaffold } = await import(
  pathToFileURL(path.join(root, 'src/lib/mission001/groundedCatalogPipeline.js')).href
);
const { buildSparseHonestCatalog, shouldUseSparseCatalogMode } = await import(
  pathToFileURL(path.join(root, 'src/lib/mission001/sparseCatalogMode.js')).href
);
const { assessPreRevealFidelity } = await import(
  pathToFileURL(path.join(root, 'src/lib/mission001/fidelityPreReveal.js')).href
);
const { attachNormalizedProvenanceToCatalog } = await import(
  pathToFileURL(path.join(root, 'src/lib/mission001/provenanceNormalize.js')).href
);
const { runStoreCreationResearch } = await import(
  pathToFileURL(path.join(root, 'src/lib/storeCreationResearch/index.js')).href
);
const { isGooglePlacesConfigured } = await import(
  pathToFileURL(path.join(root, 'src/lib/businessDiscovery/businessDiscoverySources.js')).href
);

const GENERIC_SCAFFOLD = ['Core Service', 'Premium Package', 'Basic Package', 'Express Service'];

let fixtures = idFilter
  ? MISSION001_BENCHMARK_FIXTURES.filter((f) => idFilter.has(f.id))
  : MISSION001_BENCHMARK_FIXTURES;
if (limit != null) fixtures = fixtures.slice(0, limit);
if (idFilter && fixtures.length === 0) {
  console.error(`[mission001-live] no fixtures matched --ids=${idsRaw}`);
  process.exit(2);
}

function countUnsupportedClaims(catalog, assessment) {
  if (catalog?.meta?.mission001SparseMode && !(catalog.products?.length > 0)) {
    return 0;
  }
  let n = 0;
  if (!catalogDiffersFromGenericScaffold(catalog, GENERIC_SCAFFOLD)) n += 1;
  const fakeReviews = (assessment?.coherence?.critical ?? []).some((m) =>
    String(m).toLowerCase().includes('review'),
  );
  if (fakeReviews) n += 1;
  return n;
}

function groundingPct(groundedResult, catalog) {
  if (catalog?.meta?.mission001SparseMode) {
    // Sparse empty catalog is truthful, but not "evidence-grounded offerings".
    return (catalog.products?.length ?? 0) > 0 ? null : 0;
  }
  const s = groundedResult?.grounded?.provenanceSummary;
  if (s && typeof s === 'object') {
    const exact = Number(s.exactCount ?? s.exact ?? 0) || 0;
    const verified = Number(s.verifiedCount ?? s.verified ?? 0) || 0;
    const inferred = Number(s.inferredCount ?? s.inferred ?? 0) || 0;
    const fallback = Number(s.fallbackCount ?? s.fallback ?? 0) || 0;
    const total = Math.max(
      1,
      Number(s.total) || exact + verified + inferred + fallback || catalog?.products?.length || 1,
    );
    const backed = exact + verified;
    if (backed > 0 || exact + verified + inferred + fallback > 0) {
      return Math.round((backed / total) * 100);
    }
  }
  const products = Array.isArray(catalog?.products) ? catalog.products : [];
  if (!products.length) return 0;
  const real = products.filter(
    (p) =>
      p?.provenanceStatus === 'REAL' ||
      p?.contentOrigin === 'sourced' ||
      String(p?.sourceType ?? '').toLowerCase().includes('website') ||
      String(p?.sourceType ?? '').toLowerCase().includes('official'),
  ).length;
  return Math.round((real / products.length) * 100);
}

function imageRelevanceFromPreview(preview) {
  const items = Array.isArray(preview?.items) ? preview.items : [];
  if (!items.length) return null;
  const withImage = items.filter((it) => String(it?.imageUrl ?? '').trim()).length;
  return Math.round((withImage / items.length) * 100);
}

/**
 * @param {object} fixture
 */
async function runResearchPath(fixture) {
  const started = Date.now();
  const live = resolveLiveInput(fixture);
  const expectOfferings = offeringsPubliclyExpected(fixture, live);
  let params = {
    businessName: live.businessName,
    location: live.location,
    website: live.website,
    businessType: live.category,
    category: live.category,
    socialLinks: live.socialLinks,
  };
  let input = { ...params };

  const mission001Meta = {};
  let resolutionConfidence = null;
  // Owner-supplied website is identity evidence; location alone is not a resolved business.
  let identityResolved = Boolean(live.website);
  let wrongEntity = false;
  let websiteFound = Boolean(live.website);
  let sourceBlocked = false;
  let resolutionTrace = {
    inputBusinessName: live.businessName,
    inputLocation: live.location ?? null,
    locationParts: parseLocationParts(live.location),
    outcome: null,
    confidence: null,
    reasons: [],
    entityCandidates: 0,
    selectedCandidate: null,
    sharedBrandWebsite: null,
    websiteAcceptedReason: live.website ? 'owner_provided_url' : null,
  };

  if (isNameOnlyResearchInput(params, input)) {
    const nameResolution = await resolveNameOnlyInputForResearch(params, input);
    mission001Meta.nameResolution = {
      enriched: nameResolution.enriched,
      sparseMode: nameResolution.sparseMode,
      resolutionConfidence: nameResolution.resolutionConfidence,
    };
    resolutionConfidence = nameResolution.resolutionConfidence ?? null;
    if (nameResolution.enriched) {
      params = nameResolution.params;
      input = nameResolution.input;
      identityResolved = true;
      websiteFound = Boolean(params.website || input.website);
    } else if (nameResolution.sparseMode) {
      mission001Meta.sparseMode = true;
      identityResolved = false;
    }
  }

  let research = null;
  let groundedResult = null;
  let catalog;
  let researchFallbackReason = null;

  if (mission001Meta.sparseMode && shouldUseSparseCatalogMode(mission001Meta, null)) {
    catalog = buildSparseHonestCatalog(params, input, { sparseReason: 'name_only_unresolved' });
  } else {
    research = await runStoreCreationResearch(
      {
        businessName: params.businessName,
        location: params.location,
        website: params.website,
        category: params.businessType ?? params.category,
        socialLinks: params.socialLinks ?? null,
        missionId: `live_bench_${fixture.id}`,
      },
      { skipNetwork: false, prisma: null },
    );

    researchFallbackReason =
      research?.fallbackReason ??
      (research?.fallbackToGenerated ? 'fallback_to_generated' : null) ??
      (!(research?.extractedItems?.length || research?.catalog?.products?.length)
        ? 'no_catalog_items'
        : null);

    const sources = research?.sourcesUsed ?? [];
    websiteFound =
      websiteFound ||
      sources.some((s) => {
        const t = String(s?.sourceType ?? s?.source?.sourceType ?? '').toLowerCase();
        return t.includes('website') || t.includes('official');
      }) ||
      Boolean(research?.facts?.website?.value);

    if (Number(research?.confidence) >= 0.55 || research?.researchRan) {
      // Do not treat researchRan alone as identity resolution — require entity/website evidence below.
    }

    const pipelineEntity = research?.storeResearchPipeline?.entityResolution;
    if (pipelineEntity) {
      resolutionTrace.entityCandidates = pipelineEntity.candidates?.length ?? 0;
      resolutionTrace.selectedCandidate = pipelineEntity.selectedCandidate
        ? {
            name: pipelineEntity.selectedCandidate.name,
            website: pipelineEntity.selectedCandidate.website,
            confidence: pipelineEntity.selectedCandidate.confidence,
          }
        : null;
      resolutionTrace.sharedBrandWebsite = pipelineEntity.sharedBrandWebsite ?? null;
      if (pipelineEntity.sharedBrandWebsite && !resolutionTrace.websiteAcceptedReason) {
        resolutionTrace.websiteAcceptedReason = 'shared_brand_website_across_place_locations';
      } else if (pipelineEntity.selectedCandidate?.website && !resolutionTrace.websiteAcceptedReason) {
        resolutionTrace.websiteAcceptedReason = 'selected_place_candidate_website';
      }
      resolutionConfidence =
        resolutionConfidence ?? pipelineEntity.confidence ?? resolutionConfidence;
    }

    // Weak signal for wrong entity: research name conflicts heavily with input
    const researchedName = String(
      research?.facts?.businessName?.value ?? research?.businessProfile?.businessName ?? '',
    ).toLowerCase();
    const inputName = String(live.businessName ?? '').toLowerCase();
    if (
      researchedName &&
      inputName &&
      !researchedName.includes(inputName.slice(0, Math.min(6, inputName.length))) &&
      !inputName.includes(researchedName.slice(0, Math.min(6, researchedName.length))) &&
      Number(research?.confidence) >= 0.7
    ) {
      wrongEntity = true;
    }

    if (/blocked|403|cloudflare|captcha/i.test(String(research?.error ?? research?.notes ?? ''))) {
      sourceBlocked = true;
    }

    groundedResult = buildGroundedCatalogFromResearch(research, params, input, {
      missionId: `live_bench_${fixture.id}`,
    });

    if (groundedResult?.catalog?.products?.length) {
      catalog = attachNormalizedProvenanceToCatalog(groundedResult.catalog);
    } else if (research?.catalog?.products?.length) {
      catalog = attachNormalizedProvenanceToCatalog(research.catalog);
    } else if (
      Array.isArray(research?.extractedItems) &&
      research.extractedItems.length
    ) {
      catalog = attachNormalizedProvenanceToCatalog({
        products: research.extractedItems,
        meta: {
          catalogSource: 'research',
          catalogAuthoritySource: research.catalogAuthoritySource ?? 'SEMANTIC_WEBSITE_OFFERINGS',
        },
      });
      mission001Meta.sparseMode = false;
    } else if (shouldUseSparseCatalogMode(mission001Meta, research)) {
      catalog = buildSparseHonestCatalog(params, input, { sparseReason: 'weak_research' });
      mission001Meta.sparseMode = true;
    } else {
      catalog = buildSparseHonestCatalog(params, input, { sparseReason: 'no_catalog_products' });
      mission001Meta.sparseMode = true;
    }
  }

  const products = Array.isArray(catalog?.products) ? catalog.products : [];
  const productCount = products.length;
  const falseOfferingCount = products.filter((p) => {
    const status = String(p?.provenanceStatus ?? '').toUpperCase();
    const origin = String(p?.contentOrigin ?? '').toLowerCase();
    return (
      status === 'GENERATED' ||
      origin.includes('ai_generated') ||
      origin.includes('category_fallback') ||
      p?.aiGenerated === true
    );
  }).length;

  const pipelineEntity = research?.storeResearchPipeline?.entityResolution;
  const resolution = classifyBusinessResolution({
    wrongEntity,
    sourceBlocked,
    websiteFound,
    productCount,
    entityCandidates: pipelineEntity?.candidates?.length ?? resolutionTrace.entityCandidates ?? 0,
    selectedCandidate: pipelineEntity?.selectedCandidate ?? null,
    sharedBrandWebsite: pipelineEntity?.sharedBrandWebsite ?? null,
    requiresOwnerConfirmation: pipelineEntity?.requiresOwnerConfirmation ?? false,
    pipelineMode: research?.storeResearchPipeline?.mode ?? null,
    sourcesUsed: research?.sourcesUsed ?? [],
    ownerWebsite: live.website ?? null,
    researchConfidence: research?.confidence ?? null,
  });
  identityResolved = resolution.identityResolved;
  resolutionTrace.outcome = resolution.outcome;
  resolutionTrace.confidence = resolution.confidence;
  resolutionTrace.reasons = resolution.reasons;
  mission001Meta.businessResolution = resolutionTrace;
  mission001Meta.catalogEligible = resolution.catalogEligible;

  const sourcesUsed = research?.sourcesUsed ?? [];
  const failureClass = classifyMission001Failure({
    fixture,
    identityResolved,
    wrongEntity,
    websiteFound,
    productCount,
    sparseMode: mission001Meta.sparseMode === true,
    researchConfidence: research?.confidence,
    sourcesUsed,
    researchFallbackReason,
    sourceBlocked,
    evidenceQuality: fixture.evidenceQuality,
    inputType: fixture.inputType,
    businessKind: research?.businessKind ?? research?.businessProfile?.businessType,
  });

  const catalogGrounding = groundingPct(groundedResult, catalog);
  const fidelityScore =
    groundedResult?.grounded?.fidelity ??
    (mission001Meta.sparseMode
      ? { overall: 55, identity: identityResolved ? 70 : 40, catalog: 70, media: 50, branding: 55, blockers: [] }
      : null);

  const preview = {
    storeName: params.businessName,
    storeType: params.businessType ?? fixture.vertical,
    items: products,
    website: { sections: [] },
    meta: {
      mission001: {
        ...mission001Meta,
        fidelityScore,
        sparseMode: mission001Meta.sparseMode === true,
      },
    },
  };

  const assessment = assessPreRevealFidelity(preview, {
    fidelityScore,
    groundedResult: groundedResult?.grounded ?? null,
  });

  const totalMs = Date.now() - started;
  const passSparse = mission001Meta.sparseMode === true && productCount === 0;
  const finalStatus = assessment.pass || passSparse ? 'accepted_sparse_or_grounded' : 'needs_review';

  return normalizeBenchmarkRow({
    ...fixture,
    business: live.businessName,
    vertical: fixture.vertical,
    resolutionConfidence: resolutionConfidence ?? (Number(research?.confidence) || null),
    generationTime: totalMs,
    fidelityScore: assessment.fidelity?.overall ?? fidelityScore?.overall ?? null,
    catalogGrounding,
    unsupportedClaims: countUnsupportedClaims(catalog, assessment),
    imageRelevance: null,
    repairCycles: 0,
    finalStatus,
    failureClass,
    identityResolved,
    wrongEntity,
    websiteFound,
    productCount,
    offeringsPubliclyExpected: expectOfferings,
    falseOfferingCount,
    offeringReconstructed: productCount > 0 && falseOfferingCount === 0,
    sparseMode: mission001Meta.sparseMode === true,
    researchRan: Boolean(research?.researchRan),
    researchConfidence: research?.confidence ?? null,
    researchFallbackReason,
    businessKind: research?.businessKind ?? null,
    sourcesUsedSummary: sourcesUsed.slice(0, 8).map((s) => s?.sourceType ?? s?.source?.sourceType ?? 'unknown'),
    resolutionOutcome: resolution.outcome,
    resolutionConfidenceBand: resolution.confidence,
    catalogEligible: resolution.catalogEligible,
    resolutionReasons: resolution.reasons,
    websiteAcceptedReason: resolutionTrace.websiteAcceptedReason,
  });
}

/**
 * Full draft generation path (template mode, images off by default). Never commits.
 * @param {object} fixture
 */
async function runGeneratePath(fixture) {
  const started = Date.now();
  const live = resolveLiveInput(fixture);
  const { createDraft, generateDraft, getDraft } = await import(
    pathToFileURL(path.join(root, 'src/services/draftStore/draftStoreService.js')).href
  );

  const input = {
    businessName: live.businessName,
    storeName: live.businessName,
    location: live.location,
    website: live.website,
    websiteUrl: live.website,
    businessType: live.category ?? fixture.vertical,
    storeType: live.category ?? fixture.vertical,
    socialLinks: live.socialLinks,
    includeImages: includeImages === true,
    missionId: `live_bench_gen_${fixture.id}_${Date.now()}`,
  };

  let draftId = null;
  try {
    const draft = await createDraft({
      mode: 'template',
      input,
      meta: { userAgent: 'mission001-live-benchmark' },
    });
    draftId = draft.id;
    await generateDraft(draftId, {});
    const ready = await getDraft(draftId);
    const preview = ready?.preview && typeof ready.preview === 'object' ? ready.preview : {};
    const mission001 = preview.meta?.mission001 ?? {};
    const assessment = mission001.fidelityAssessment ?? null;
    const products = Array.isArray(preview.items) ? preview.items : [];
    const catalog = { products, meta: preview.meta ?? {} };
    const totalMs = Date.now() - started;

    return normalizeBenchmarkRow({
      ...fixture,
      business: live.businessName,
      resolutionConfidence: mission001.nameResolution?.resolutionConfidence ?? null,
      generationTime: totalMs,
      fidelityScore:
        assessment?.fidelity?.overall ??
        mission001.fidelityScore?.overall ??
        null,
      catalogGrounding: groundingPct(
        mission001.grounding ? { grounded: mission001.grounding } : null,
        catalog,
      ),
      unsupportedClaims: countUnsupportedClaims(catalog, assessment),
      imageRelevance: imageRelevanceFromPreview(preview),
      repairCycles: mission001.targetedRepair?.cycles ?? 0,
      finalStatus: ready?.status === 'ready' ? 'accepted_sparse_or_grounded' : 'needs_review',
      draftId,
      pipelineTiming: mission001.pipelineTiming ?? { totalMs, mode: 'generate' },
    });
  } catch (err) {
    return normalizeBenchmarkRow({
      ...fixture,
      business: live.businessName,
      generationTime: Date.now() - started,
      fidelityScore: null,
      catalogGrounding: null,
      unsupportedClaims: null,
      imageRelevance: null,
      repairCycles: 0,
      finalStatus: 'hard_failure',
      error: err?.message ?? String(err),
      draftId,
    });
  }
}

/** @type {object[]} */
const rows = [];
const placesConfigured = isGooglePlacesConfigured();

console.error(`[mission001-live] mode=${mode} fixtures=${fixtures.length} places=${placesConfigured}`);
console.error('[mission001-live] policy: no publish, no contact, public research only');

for (const fixture of fixtures) {
  const label = `${fixture.id} (${resolveLiveInput(fixture).businessName})`;
  process.stderr.write(`[mission001-live] start ${label}...\n`);
  try {
    const row =
      mode === 'generate' ? await runGeneratePath(fixture) : await runResearchPath(fixture);
    rows.push(row);
    process.stderr.write(
      `[mission001-live] done ${label} class=${row.failureClass} offerings=${row.productCount} fidelity=${row.fidelityScore} ms=${row.generationTime}\n`,
    );
  } catch (err) {
    rows.push(
      normalizeBenchmarkRow({
        ...fixture,
        business: resolveLiveInput(fixture).businessName,
        generationTime: null,
        finalStatus: 'hard_failure',
        error: err?.message ?? String(err),
      }),
    );
    process.stderr.write(`[mission001-live] FAIL ${label}: ${err?.message ?? err}\n`);
  }
}

const summary = summarizeBenchmarkRows(rows);
const taxonomy = summarizeFailureTaxonomy(rows);
const offeringReconstruction = computeOfferingReconstructionRate(rows);
const falseOffering = computeFalseOfferingRate(rows);
const byVertical = summarizeByVertical(rows);
const resolutionMetrics = computeMission001ResolutionMetrics(rows);

const websiteNoCatalogPct = taxonomy.pct.WEBSITE_FOUND_NO_CATALOG ?? 0;
const structuredPct = taxonomy.pct.STRUCTURED_CATALOG_FOUND ?? 0;
const offeringGapDominant =
  websiteNoCatalogPct >= 40 ||
  (offeringReconstruction.ratePct != null && offeringReconstruction.ratePct < 50);

const launchGates = {
  p50Ok: summary.p50Ms != null && summary.p50Ms <= 60_000,
  p90Ok: summary.p90Ms != null && summary.p90Ms <= 90_000,
  medianFidelityOk: summary.medianFidelity != null && summary.medianFidelity >= 75,
  groundingOk: summary.groundedAtOrAbove75Pct != null && summary.groundedAtOrAbove75Pct >= 75,
  hardFailureOk: summary.hardFailureRatePct != null && summary.hardFailureRatePct <= 2,
  truthfulnessOk: summary.unsupportedClaimTotal === 0,
  offeringReconstructionOk:
    offeringReconstruction.ratePct != null && offeringReconstruction.ratePct >= 80,
  falseOfferingOk: falseOffering.ratePct != null && falseOffering.ratePct <= 5,
  eligibleOfferingReconstructionOk:
    resolutionMetrics.eligibleOfferingReconstructionRatePct != null &&
    resolutionMetrics.eligibleOfferingReconstructionRatePct >= 80,
  falseOfferingStrictOk: resolutionMetrics.falseOfferingRatePct === 0,
};

const mission001V1ClosureGates = {
  medianFidelityOk: launchGates.medianFidelityOk,
  legacyOfferingReconstructionOk:
    offeringReconstruction.ratePct != null && offeringReconstruction.ratePct >= 80,
  eligibleOfferingReconstructionOk:
    // N/A (no catalog-eligible rows) is not a pass; require measured ≥80 when eligible>0
    resolutionMetrics.catalogEligible === 0
      ? false
      : launchGates.eligibleOfferingReconstructionOk,
  falseOfferingZeroOk: resolutionMetrics.falseOfferingRatePct === 0,
  businessResolutionReported: Number.isFinite(resolutionMetrics.businessTotal),
  eligibleReconstructionReported: Number.isFinite(resolutionMetrics.catalogEligible),
  noWrongEntity: rows.every((r) => r.wrongEntity !== true),
  hardFailureOk: launchGates.hardFailureOk,
};
const mission001V1Ready = Object.values(mission001V1ClosureGates).every(Boolean);

const allMeasured =
  summary.p50Ms != null &&
  summary.medianFidelity != null &&
  summary.groundedAtOrAbove75Pct != null;
const launchReady =
  allMeasured &&
  Object.values(launchGates).every(Boolean) &&
  mode === 'generate';

const payload = {
  mode: mode === 'generate' ? 'live_generate' : 'live_research',
  generatedAt: new Date().toISOString(),
  placesConfigured,
  includeImages: mode === 'generate' ? includeImages : false,
  policy: {
    publish: false,
    contactBusinesses: false,
    claimOwnership: false,
    publicResearchOnly: true,
  },
  summary: {
    ...summary,
    offeringReconstructionRatePct: offeringReconstruction.ratePct,
    offeringReconstructionEligible: offeringReconstruction.eligible,
    offeringReconstructionSuccess: offeringReconstruction.reconstructed,
    falseOfferingRatePct: falseOffering.ratePct,
    falseOfferingCount: falseOffering.falseOfferings,
    falseOfferingTotal: falseOffering.totalOfferings,
    ...resolutionMetrics,
  },
  failureTaxonomy: taxonomy,
  byVertical,
  resolutionMetrics,
  constraintDecision: {
    offeringGapDominant,
    websiteFoundNoCatalogPct: websiteNoCatalogPct,
    structuredCatalogFoundPct: structuredPct,
    recommendation: offeringGapDominant
      ? 'FREEZE_NON_OFFERING_WORK__PRIORITIZE_WEBSITE_TO_OFFERING_RECONSTRUCTION'
      : 'CONTINUE_BROADER_FIDELITY_WORK',
  },
  launchGates,
  mission001V1ClosureGates,
  mission001V1Verdict: mission001V1Ready
    ? 'MISSION_001_V1_LAUNCH_READY'
    : 'MISSION_001_V1_LAUNCH_BLOCKED',
  verdict: launchReady
    ? '60_SECOND_STORE_CREATION_NEAR_READY'
    : '60_SECOND_STORE_CREATION_MAJOR_GAPS',
  note: mission001V1Ready
    ? 'MISSION 001 V1 launch closure gates passed on this research soak (no invent; unresolved stay sparse).'
    : offeringGapDominant
      ? 'Dominant constraint: identity succeeds but offering reconstruction fails (website→catalog).'
      : 'Mission 001 V1 closure gates not all met — see mission001V1ClosureGates.',
  rows,
};

if (outPath) {
  const abs = path.resolve(outPath);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, JSON.stringify(payload, null, 2), 'utf8');
  console.error(`[mission001-live] wrote ${abs}`);
}

if (wantJson && !outPath) {
  console.log(JSON.stringify(payload, null, 2));
} else if (!wantJson) {
  console.log('Mission 001 LIVE benchmark');
  console.log('mode:', payload.mode);
  console.log('fixtures:', summary.fixtureCount);
  console.log('P50/P90 ms:', summary.p50Ms, '/', summary.p90Ms);
  console.log('median fidelity:', summary.medianFidelity);
  console.log('offering reconstruction %:', offeringReconstruction.ratePct);
  console.log('eligible offering reconstruction %:', resolutionMetrics.eligibleOfferingReconstructionRatePct);
  console.log('business resolution %:', resolutionMetrics.businessResolutionRatePct);
  console.log('end-to-end offering coverage %:', resolutionMetrics.endToEndOfferingCoveragePct);
  console.log('false offering %:', falseOffering.ratePct);
  console.log('failure taxonomy %:', taxonomy.pct);
  console.log('by vertical:', byVertical);
  console.log('constraint decision:', payload.constraintDecision);
  console.log('mission001V1Verdict:', payload.mission001V1Verdict);
  console.log('verdict:', payload.verdict);
  console.log('launchGates:', launchGates);
}
