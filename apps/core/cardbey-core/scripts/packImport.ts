/**
 * CLI: Import starter packs from JSON files under data/starter-packs.
 * Uses stable unique keys for idempotent upserts:
 *   Pack = businessType + region + version + name
 *   Category = key (global find-or-create)
 *   CatalogItem = canonicalName + type (global find-or-create)
 *
 * DO NOT import this script from runtime app code. Run only via: npx tsx scripts/packImport.ts
 *
 * Usage: npx tsx scripts/packImport.ts [--dry-run]
 */

import fs from 'fs';
import path from 'path';
import { getPrismaClient } from '../src/db/prisma.js';
import { loadPackFromJson, PackLoadError } from '../src/lib/catalog/packLoader.js';
import type { CatalogItemType } from '../src/lib/catalog/types.js';

const DRY_RUN = process.argv.includes('--dry-run');
const DATA_DIR = path.resolve(process.cwd(), 'data', 'starter-packs');

interface Summary {
  files: number;
  packs: number;
  categoriesCreated: number;
  categoriesSkipped: number;
  itemsCreated: number;
  itemsSkipped: number;
  errors: string[];
}

function readJsonFiles(dir: string): { name: string; content: unknown }[] {
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  return files.map((name) => {
    const filePath = path.join(dir, name);
    const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return { name, content };
  });
}

async function runImport(): Promise<Summary> {
  const summary: Summary = {
    files: 0,
    packs: 0,
    categoriesCreated: 0,
    categoriesSkipped: 0,
    itemsCreated: 0,
    itemsSkipped: 0,
    errors: [],
  };
  const inputs = readJsonFiles(DATA_DIR);
  summary.files = inputs.length;

  if (DRY_RUN) {
    for (const { name, content } of inputs) {
      try {
        const loaded = loadPackFromJson(content);
        summary.packs += 1;
        summary.categoriesCreated += loaded.categoriesNormalized.length;
        summary.itemsCreated += loaded.itemsNormalized.length;
        console.log(
          `[dry-run] ${name}: ${loaded.categoriesNormalized.length} categories, ${loaded.itemsNormalized.length} items (zero DB writes)`
        );
      } catch (e) {
        const msg = e instanceof PackLoadError ? e.message : (e as Error).message;
        summary.errors.push(`${name}: ${msg}`);
      }
    }
    return summary;
  }

  const prisma = getPrismaClient();

  for (const { name, content } of inputs) {
    try {
      const loaded = loadPackFromJson(content);
      const { packMeta, categoriesNormalized, itemsNormalized, starterPackItemJoin } = loaded;

      // 1) Find or create BusinessType, Region (stable keys)
      let businessType = await prisma.businessType.findUnique({ where: { key: packMeta.businessType } });
      if (!businessType) {
        businessType = await prisma.businessType.create({
          data: { key: packMeta.businessType, label: packMeta.businessType },
        });
      }
      let region = await prisma.region.findUnique({ where: { code: packMeta.region } });
      if (!region) {
        region = await prisma.region.create({
          data: { code: packMeta.region, label: packMeta.region },
        });
      }

      // 2) Find or create StarterPack by businessType + region + version + name
      let pack = await prisma.starterPack.findFirst({
        where: {
          businessTypeId: businessType.id,
          regionId: region.id,
          version: packMeta.version,
          name: packMeta.name,
        },
      });
      if (!pack) {
        pack = await prisma.starterPack.create({
          data: {
            businessTypeId: businessType.id,
            regionId: region.id,
            version: packMeta.version,
            name: packMeta.name,
            description: packMeta.description,
            defaultCurrencyCode: packMeta.defaultCurrencyCode,
            status: 'DRAFT',
          },
        });
      } else {
        await prisma.starterPack.update({
          where: { id: pack.id },
          data: { description: packMeta.description, defaultCurrencyCode: packMeta.defaultCurrencyCode },
        });
      }

      // 3) Find-or-create CatalogCategory by key (global); then replace pack's category links
      const keyToCategoryId = new Map<string, string>();
      for (const cat of categoriesNormalized) {
        const parentId = cat.parentKey ? keyToCategoryId.get(cat.parentKey) ?? null : null;
        const existing = await prisma.catalogCategory.findFirst({ where: { key: cat.key } });
        let catalogCategoryId: string;
        if (existing) {
          catalogCategoryId = existing.id;
          summary.categoriesSkipped += 1;
        } else {
          const created = await prisma.catalogCategory.create({
            data: { key: cat.key, label: cat.label, parentId, sortOrder: cat.sortOrder },
          });
          catalogCategoryId = created.id;
          summary.categoriesCreated += 1;
        }
        keyToCategoryId.set(cat.key, catalogCategoryId);
      }
      await prisma.starterPackCategory.deleteMany({ where: { starterPackId: pack.id } });
      for (const cat of categoriesNormalized) {
        const catalogCategoryId = keyToCategoryId.get(cat.key)!;
        await prisma.starterPackCategory.create({
          data: { starterPackId: pack.id, catalogCategoryId, sortOrder: cat.sortOrder },
        });
      }

      // 4) Find-or-create CatalogItem by canonicalName + type (global); then replace pack's item links
      await prisma.starterPackItem.deleteMany({ where: { starterPackId: pack.id } });
      for (let i = 0; i < itemsNormalized.length; i++) {
        const catalog = itemsNormalized[i];
        const joinDatum = starterPackItemJoin[i];
        const defaultCategoryId = keyToCategoryId.get(catalog.defaultCategoryKey) ?? null;
        let catalogItem = await prisma.catalogItem.findFirst({
          where: { canonicalName: catalog.canonicalName, type: catalog.type },
        });
        if (!catalogItem) {
          catalogItem = await prisma.catalogItem.create({
            data: {
              type: catalog.type as CatalogItemType,
              canonicalName: catalog.canonicalName,
              shortDescription: catalog.shortDescription,
              longDescription: catalog.longDescription,
              tags: catalog.tags as object,
              defaultCategoryKey: catalog.defaultCategoryKey,
              defaultCategoryId,
              suggestedPriceMin: catalog.suggestedPriceMin,
              suggestedPriceMax: catalog.suggestedPriceMax,
              currencyCode: catalog.currencyCode,
              imagePrompt: catalog.imagePrompt,
              imageKeywords: catalog.imageKeywords as object | null,
              modifiersJson: catalog.modifiersJson as object | null,
              businessTypeHints: catalog.businessTypeHints as object,
              localeHints: catalog.localeHints as object,
            },
          });
          summary.itemsCreated += 1;
        } else {
          summary.itemsSkipped += 1;
        }
        await prisma.starterPackItem.create({
          data: {
            starterPackId: pack.id,
            catalogItemId: catalogItem.id,
            sortOrder: joinDatum.sortOrder,
            featured: joinDatum.featured,
            overridesJson: joinDatum.overridesJson as object | null,
          },
        });
      }

      summary.packs += 1;
      console.log(
        `[import] ${name}: pack ${pack.id}, ${categoriesNormalized.length} categories (linked), ${itemsNormalized.length} items (linked)`
      );
    } catch (e) {
      const msg = e instanceof PackLoadError ? e.message : (e as Error).message;
      summary.errors.push(`${name}: ${msg}`);
      console.error(`[error] ${name}:`, msg);
    }
  }

  return summary;
}

runImport()
  .then((s) => {
    console.log('---');
    console.log(
      `Files: ${s.files}, Packs: ${s.packs}, Categories created/skipped: ${s.categoriesCreated}/${s.categoriesSkipped}, Items created/skipped: ${s.itemsCreated}/${s.itemsSkipped}`
    );
    if (s.errors.length) console.log('Errors:', s.errors);
    if (DRY_RUN) console.log('(dry-run; no DB changes)');
    process.exit(s.errors.length ? 1 : 0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
