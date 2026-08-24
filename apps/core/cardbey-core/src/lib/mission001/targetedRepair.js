/**
 * Mission 001 Gate 6 — bounded targeted repair execution.
 */

import Mission001Flags from './mission001Flags.js';
import { assessPreRevealFidelity, planTargetedRepair } from './fidelityPreReveal.js';
import { stripFabricatedCatalogScaffolds } from './sparseCatalogMode.js';

const IMAGE_REPAIR_LIMIT = 6;
const FAKE_REVIEW_AUTHORS = new Set(['alex m.', 'jordan k.', 'sam r.']);

/**
 * @param {object} preview
 * @param {string[]} targets
 * @param {object} ctx
 */
export async function executeTargetedRepair(preview, targets, ctx = {}) {
  /** @type {Record<string, boolean>} */
  const applied = {};

  if (targets.includes('catalog')) {
    applied.catalog = await repairCatalogTarget(preview, ctx);
  }
  if (targets.includes('composition')) {
    applied.composition = await repairCompositionTarget(preview, ctx);
  }
  if (targets.includes('images') && ctx.includeImages !== false) {
    applied.images = await repairImagesTarget(preview, ctx);
  }

  return { applied, targets };
}

async function repairCatalogTarget(preview, ctx) {
  const items = Array.isArray(preview.items) ? preview.items : [];
  if (!items.length) return false;

  const stripped = stripFabricatedCatalogScaffolds({ products: items });
  let nextItems = stripped.products ?? items;
  let repaired = nextItems !== items;

  try {
    const { repairServiceCatalogPlaceholderProducts, buildServiceCatalogPlaceholderSeed } = await import(
      '../../lib/catalog/serviceCatalogPlaceholders.js'
    );
    const leakProfile = {
      businessName: preview.storeName,
      storeName: preview.storeName,
      businessType: preview.storeType,
      storeType: preview.storeType,
      verticalSlug: preview.meta?.verticalSlug ?? ctx.verticalSlug,
      verticalGroup: preview.meta?.verticalGroup ?? ctx.verticalGroup,
    };
    const repairedScaffold = repairServiceCatalogPlaceholderProducts(
      nextItems,
      leakProfile,
      () => buildServiceCatalogPlaceholderSeed(nextItems, leakProfile),
    );
    if (repairedScaffold.repaired && Array.isArray(repairedScaffold.products)) {
      nextItems = repairedScaffold.products;
      repaired = true;
      if (Array.isArray(repairedScaffold.categories) && repairedScaffold.categories.length) {
        preview.categories = repairedScaffold.categories;
      }
    }
  } catch {
    /* non-fatal */
  }

  if (repaired) {
    preview.items = nextItems;
  }
  return repaired;
}

async function repairCompositionTarget(preview, ctx) {
  let changed = false;
  const sections = preview?.website?.sections;
  if (Array.isArray(sections)) {
    const filtered = sections.filter((s) => {
      if (s?.type !== 'social_proof') return true;
      const reviews = s?.content?.reviews;
      if (!Array.isArray(reviews)) return true;
      const hasFake = reviews.some((r) => FAKE_REVIEW_AUTHORS.has(String(r?.author ?? '').toLowerCase()));
      if (hasFake) {
        changed = true;
        return false;
      }
      return true;
    });
    if (changed) {
      preview.website = { ...(preview.website ?? {}), sections: filtered };
    }
  }

  try {
    const { mergeWebsiteIntoPreview } = await import('../../services/draftStore/websiteSectionsGenerator.js');
    const { ensureWebsiteTemplateFoundationOnInput } = await import(
      '../../services/draftStore/websiteTemplateFoundation.js'
    );
    const inputWithTpl = await ensureWebsiteTemplateFoundationOnInput(ctx.draftInput ?? {});
    mergeWebsiteIntoPreview(preview, inputWithTpl);
    changed = true;
  } catch {
    /* non-fatal */
  }

  return changed;
}

async function repairImagesTarget(preview, ctx) {
  const items = Array.isArray(preview.items) ? preview.items : [];
  const missing = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => !String(item?.imageUrl ?? '').trim())
    .slice(0, IMAGE_REPAIR_LIMIT);
  if (!missing.length) return false;

  let menuMod;
  try {
    menuMod = await import('../../services/menuVisualAgent/menuVisualAgent.ts');
  } catch {
    return false;
  }
  const generateImageForDraftItem = menuMod.generateImageForDraftItem ?? menuMod.default?.generateImageForDraftItem;
  if (typeof generateImageForDraftItem !== 'function') return false;

  const { resolveItemImageSearchQuery } = await import('../../services/draftStore/itemImageQueryResolver.js');
  const categories = Array.isArray(preview.categories) ? preview.categories : [];
  const usedUrls = new Set(items.map((it) => it?.imageUrl).filter(Boolean));
  let repairedCount = 0;

  for (const { item, index } of missing) {
    const catalogCategoryHint =
      item.categoryId && categories.length
        ? categories.find((c) => c.id === item.categoryId)?.name
        : null;
    const imageQueryHint = resolveItemImageSearchQuery({
      itemName: item?.name,
      description: item?.description,
      imageQueryHint: item?.imageQueryHint,
      verticalSlug: ctx.verticalForItem ?? preview.meta?.verticalSlug,
      verticalGroup: ctx.effectiveImageFillProfile?.verticalGroup,
      businessType: preview.storeType,
      storeName: preview.storeName,
      categoryName: catalogCategoryHint,
      location: ctx.locationStr ?? null,
    });
    try {
      const result = await generateImageForDraftItem(item.name, item.description, ctx.styleName ?? 'modern', {
        profile: ctx.effectiveImageFillProfile ?? undefined,
        imageQueryHint,
        categoryName: imageQueryHint,
        businessType: preview.storeType,
        storeName: preview.storeName,
        verticalSlug: ctx.verticalForItem,
        usedUrls,
        allowNullOnLowConfidence: true,
        ...(ctx.locationStr ? { location: ctx.locationStr } : {}),
      });
      if (result?.url) {
        item.imageUrl = result.url;
        item.imageSource = result.source;
        item.imageQuery = result.query;
        item.imageConfidence = result.confidence;
        usedUrls.add(result.url);
        repairedCount += 1;
      }
    } catch {
      /* continue */
    }
    if (repairedCount >= IMAGE_REPAIR_LIMIT) break;
    void index;
  }

  return repairedCount > 0;
}

/**
 * @param {object} params
 */
export async function executeTargetedRepairLoop(params) {
  const { preview, assessment, assessOptions = {}, repairContext = {} } = params;
  if (!Mission001Flags.targetedRepair || !assessment) {
    return { applied: false, cycles: 0, repairs: [], finalAssessment: assessment };
  }

  let currentAssessment = assessment;
  /** @type {object[]} */
  const repairs = [];
  let cycle = 0;

  while (cycle < (assessment.maxRepairCycles ?? 2)) {
    const plan = planTargetedRepair(currentAssessment, cycle);
    if (!plan.shouldRepair) break;

    const repairStart = Date.now();
    const outcome = await executeTargetedRepair(preview, plan.targets, repairContext);
    repairs.push({
      cycle: cycle + 1,
      targets: plan.targets,
      outcome,
      repairMs: Date.now() - repairStart,
    });

    currentAssessment = assessPreRevealFidelity(preview, assessOptions);
    cycle += 1;
    if (currentAssessment.pass) break;
  }

  return {
    applied: repairs.length > 0,
    cycles: cycle,
    repairs,
    finalAssessment: currentAssessment,
  };
}
