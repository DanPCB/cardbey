/**
 * Dataset selector: choose best Starter Pack for (businessType, region),
 * optionally apply price ladder and run validators. Returns instantiation payload.
 * NOT wired into store creation. Pure library; call explicitly.
 */

import { getAvailableStarterPackFiles, loadStarterPackFromFile } from './packRegistry.js';
import { loadPriceLadder } from './ladderLoader.js';
import { resolvePriceForItem } from '../priceLadder.js';
import { validatePack, summarizeIssues } from '../validators/validatePack.js';
import { DEFAULT_VALIDATOR_RULES } from '../validators/defaultRules.js';
import type { ValidatorRuleConfig } from '../validators/types.js';
import { NoStarterPackFoundError } from './errors.js';
import type {
  DatasetSelectionInput,
  DatasetSelectionOptions,
  SelectedDataset,
  ItemLike,
  CategoryLike,
  PackMetaLike,
} from './types.js';

function normalizeKey(s: string): string {
  return s.trim().toLowerCase();
}

function stablePackId(packMeta: PackMetaLike): string {
  return `${packMeta.businessType}/${packMeta.region}/${packMeta.version ?? ''}/${packMeta.name ?? ''}`;
}

/** Merge loaded pack into instantiation items (catalog + join per item) */
function toItems(
  itemsNormalized: Array<{
    type: string;
    canonicalName: string;
    shortDescription: string;
    longDescription: string | null;
    tags: string[];
    defaultCategoryKey: string;
    suggestedPriceMin: number | null;
    suggestedPriceMax: number | null;
    currencyCode: string | null;
    imagePrompt: string | null;
    imageKeywords: string[] | null;
    modifiersJson: Record<string, unknown> | null;
    businessTypeHints: string[];
    localeHints: string[];
  }>,
  starterPackItemJoin: Array<{ categoryKey: string; sortOrder: number; featured: boolean; overridesJson: Record<string, unknown> | null }>
): ItemLike[] {
  return itemsNormalized.map((catalog, i) => {
    const join = starterPackItemJoin[i] ?? { categoryKey: catalog.defaultCategoryKey, sortOrder: i, featured: false, overridesJson: null };
    return {
      ...catalog,
      categoryKey: join.categoryKey,
      sortOrder: join.sortOrder,
      featured: join.featured,
      overridesJson: join.overridesJson ?? undefined,
    };
  });
}

/**
 * Select best starter pack for (businessType, region), optionally apply ladder and validators.
 * Defaults: applyPriceLadder false, runValidators false (safest; no blocking).
 */
export async function selectDataset(
  input: DatasetSelectionInput,
  options: DatasetSelectionOptions = {}
): Promise<SelectedDataset> {
  const businessTypeNorm = normalizeKey(input.businessType);
  const regionNorm = normalizeKey(input.region);
  const applyPriceLadder = options.applyPriceLadder === true;
  const runValidators = options.runValidators === true;
  const validatorRulesOverride = options.validatorRulesOverride;

  const filePaths = getAvailableStarterPackFiles();
  const loadedPacks: Array<{ path: string; pack: Awaited<ReturnType<typeof loadStarterPackFromFile>> }> = [];
  for (const p of filePaths) {
    try {
      const pack = loadStarterPackFromFile(p);
      loadedPacks.push({ path: p, pack });
    } catch {
      continue;
    }
  }

  let exactMatches = loadedPacks.filter(
    (x) => normalizeKey(x.pack.packMeta.businessType) === businessTypeNorm && normalizeKey(x.pack.packMeta.region) === regionNorm
  );

  let fallbackUsed = false;
  let selected = exactMatches[0];

  if (!selected && input.allowFallbackRegion === true) {
    const sameBusinessType = loadedPacks.filter((x) => normalizeKey(x.pack.packMeta.businessType) === businessTypeNorm);
    if (sameBusinessType.length > 0) {
      sameBusinessType.sort((a, b) => {
        const vA = a.pack.packMeta.version;
        const vB = b.pack.packMeta.version;
        if (vA !== vB) return vB.localeCompare(vA);
        return b.path.localeCompare(a.path);
      });
      selected = sameBusinessType[0];
      fallbackUsed = true;
    }
  }

  if (!selected) {
    throw new NoStarterPackFoundError(
      `No starter pack found for businessType="${input.businessType}" region="${input.region}". Add allowFallbackRegion: true to try same businessType with another region.`,
      input.businessType,
      input.region
    );
  }

  let versionHintUsed = false;
  if (input.packVersionHint && exactMatches.length > 0) {
    const hint = input.packVersionHint.trim().toLowerCase();
    const withHint = exactMatches.find((x) => x.pack.packMeta.version.toLowerCase().includes(hint) || hint.includes(x.pack.packMeta.version.toLowerCase()));
    if (withHint) {
      selected = withHint;
      versionHintUsed = true;
    }
  }
  if (input.packVersionHint && !versionHintUsed && fallbackUsed) {
    const hint = input.packVersionHint.trim().toLowerCase();
    const sameBusinessType = loadedPacks.filter((x) => normalizeKey(x.pack.packMeta.businessType) === businessTypeNorm);
    const withHint = sameBusinessType.find((x) => x.pack.packMeta.version.toLowerCase().includes(hint) || hint.includes(x.pack.packMeta.version.toLowerCase()));
    if (withHint) {
      selected = withHint;
      versionHintUsed = true;
    }
  }

  const pack = selected.pack;
  const packMeta: PackMetaLike = pack.packMeta;
  const categories: CategoryLike[] = pack.categoriesNormalized.map((c) => ({
    key: c.key,
    label: c.label,
    parentKey: c.parentKey,
    sortOrder: c.sortOrder,
  }));
  let items: ItemLike[] = toItems(pack.itemsNormalized, pack.starterPackItemJoin);

  const debugReasons: string[] = [];
  if (versionHintUsed) debugReasons.push('Version hint matched.');
  if (fallbackUsed) debugReasons.push('Fallback region used (no exact match).');
  if (input.currency && packMeta.defaultCurrencyCode && input.currency.trim().toUpperCase() !== (packMeta.defaultCurrencyCode ?? '').trim().toUpperCase()) {
    debugReasons.push(`Input currency "${input.currency}" differs from pack currency "${packMeta.defaultCurrencyCode}".`);
  }
  if (debugReasons.length === 0) debugReasons.push('Exact match.');

  let ladder: SelectedDataset['ladder'] = null;
  if (applyPriceLadder) {
    ladder = loadPriceLadder(packMeta.businessType, packMeta.region);
    if (ladder) {
      items = items.map((item) => {
        const hasMin = item.suggestedPriceMin != null && typeof item.suggestedPriceMin === 'number';
        const hasMax = item.suggestedPriceMax != null && typeof item.suggestedPriceMax === 'number';
        if (hasMin && hasMax) return item;
        const resolved = resolvePriceForItem(item, ladder!);
        return {
          ...item,
          suggestedPriceMin: item.suggestedPriceMin ?? resolved.min,
          suggestedPriceMax: item.suggestedPriceMax ?? resolved.max,
          currencyCode: item.currencyCode ?? resolved.currency ?? undefined,
        };
      });
    }
  }

  let validation: SelectedDataset['validation'] = null;
  if (runValidators) {
    const rules: ValidatorRuleConfig[] = Array.isArray(validatorRulesOverride)
      ? (validatorRulesOverride as ValidatorRuleConfig[])
      : [...DEFAULT_VALIDATOR_RULES];
    const issues = validatePack({
      pack: packMeta,
      items,
      categories,
      rules,
    });
    const summary = summarizeIssues(issues);
    validation = {
      issues,
      summary: { blocks: summary.blocks, warns: summary.warns, byCode: summary.byCode },
      rules: rules.map((r) => ({ name: r.name, code: r.code, isEnabled: r.isEnabled, severity: r.severity, configJson: r.configJson })),
    };
  }

  return {
    packMeta,
    categories,
    items,
    ladder: ladder ?? undefined,
    validation: validation ?? undefined,
    debug: {
      selectedPackId: stablePackId(packMeta),
      reason: debugReasons.join(' '),
      fallbackUsed,
    },
  };
}
