/**
 * Taxonomy helpers — categories, entities, relations.
 */

import { ENTITY_KIND } from './universalAssetTypes.js';

/**
 * Built-in category taxonomy (Phase 2B seed).
 */
export const BUILTIN_CATEGORIES = Object.freeze([
  { slug: 'business', name: 'Business', kind: ENTITY_KIND.CATEGORY },
  { slug: 'food-beverage', name: 'Food & Beverage', kind: ENTITY_KIND.CATEGORY },
  { slug: 'retail', name: 'Retail', kind: ENTITY_KIND.CATEGORY },
  { slug: 'services', name: 'Services', kind: ENTITY_KIND.CATEGORY },
  { slug: 'creative', name: 'Creative', kind: ENTITY_KIND.CATEGORY },
  { slug: 'education', name: 'Education', kind: ENTITY_KIND.CATEGORY },
  { slug: 'health-wellness', name: 'Health & Wellness', kind: ENTITY_KIND.CATEGORY },
  { slug: 'travel', name: 'Travel', kind: ENTITY_KIND.CATEGORY },
]);

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export async function listTaxonomyCategories(prisma) {
  const entities = await prisma.universalEntity.findMany({
    where: { kind: ENTITY_KIND.CATEGORY },
    orderBy: { name: 'asc' },
  });
  if (entities.length > 0) {
    return { ok: true, categories: entities, source: 'db' };
  }
  return { ok: true, categories: BUILTIN_CATEGORIES, source: 'builtin' };
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object} input
 */
export async function upsertTaxonomyEntity(prisma, input) {
  const kind = String(input?.kind ?? '').trim();
  const name = String(input?.name ?? '').trim();
  const slug = input?.slug ? String(input.slug).trim() : null;
  if (!kind || !name) {
    return { ok: false, error: 'kind_and_name_required', status: 400 };
  }

  if (slug) {
    const entity = await prisma.universalEntity.upsert({
      where: { kind_slug: { kind, slug } },
      create: { kind, name, slug, metadata: input.metadata ?? null },
      update: { name, metadata: input.metadata ?? undefined },
    });
    return { ok: true, entity };
  }

  const entity = await prisma.universalEntity.create({
    data: { kind, name, slug, metadata: input.metadata ?? null },
  });
  return { ok: true, entity };
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object} [filters]
 */
export async function listTaxonomyEntities(prisma, filters = {}) {
  const take = Math.min(Math.max(Number(filters.limit) || 50, 1), 200);
  const skip = Math.max(Number(filters.offset) || 0, 0);
  /** @type {import('@prisma/client').Prisma.UniversalEntityWhereInput} */
  const where = {};
  if (filters.kind) where.kind = String(filters.kind);
  if (filters.slug) where.slug = String(filters.slug);

  const [items, total] = await Promise.all([
    prisma.universalEntity.findMany({
      where,
      orderBy: { name: 'asc' },
      take,
      skip,
    }),
    prisma.universalEntity.count({ where }),
  ]);

  return { ok: true, items, total, limit: take, offset: skip };
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object} input
 */
export async function createEntityRelation(prisma, input) {
  const fromEntityId = String(input?.fromEntityId ?? '').trim();
  const toEntityId = String(input?.toEntityId ?? '').trim();
  const relationType = String(input?.relationType ?? '').trim();
  if (!fromEntityId || !toEntityId || !relationType) {
    return { ok: false, error: 'relation_fields_required', status: 400 };
  }

  try {
    const relation = await prisma.universalEntityRelation.create({
      data: {
        fromEntityId,
        toEntityId,
        relationType,
        weight: Number.isFinite(Number(input?.weight)) ? Number(input.weight) : null,
      },
    });
    return { ok: true, relation };
  } catch (err) {
    if (String(err?.code) === 'P2002') {
      return { ok: false, error: 'relation_exists', status: 409 };
    }
    throw err;
  }
}

/**
 * Ensure builtin categories exist in DB.
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export async function ensureBuiltinCategories(prisma) {
  const created = [];
  for (const cat of BUILTIN_CATEGORIES) {
    const entity = await prisma.universalEntity.upsert({
      where: { kind_slug: { kind: cat.kind, slug: cat.slug } },
      create: { kind: cat.kind, name: cat.name, slug: cat.slug },
      update: { name: cat.name },
    });
    created.push(entity);
  }
  return { ok: true, categories: created };
}
