/**
 * Upsert Platform Template Library + 7 PUBLISHED STORE_WEBSITE presets.
 *
 * Prefers existing rows by slug (e.g. cardbey-official) so re-runs do not
 * create duplicate galleries.
 *
 * Usage (from apps/core/cardbey-core):
 *   npm run seed:template-library
 */

import '../src/env/loadEnv.js';
import '../src/env/ensureDatabaseUrl.js';
import { prisma } from '../src/lib/prisma.js';

const LIBRARY_SLUG = 'cardbey-official';
const FALLBACK_LIBRARY_SLUG = 'cardbey-store-website';

/** @type {Array<{ slug: string, name: string, industry: string, description: string, tags: string[], primary: string, secondary: string, fontFamily?: string, sections: string[] }>} */
const STORE_WEBSITE_TEMPLATES = [
  {
    slug: 'beauty-wellness-website',
    name: 'Beauty & wellness website',
    industry: 'beauty',
    description: 'Beauty & wellness website',
    tags: ['beauty', 'modern', 'website'],
    primary: '#db2777',
    secondary: '#fce7f3',
    fontFamily: 'Georgia, "Times New Roman", serif',
    sections: ['navigation', 'hero', 'featured', 'about', 'reviews', 'contact', 'footer'],
  },
  {
    slug: 'restaurant-cafe-website',
    name: 'Restaurant & café website',
    industry: 'hospitality',
    description: 'Restaurant & café website',
    tags: ['hospitality', 'modern', 'website'],
    primary: '#c2410c',
    secondary: '#ffedd5',
    sections: ['navigation', 'hero', 'featured', 'about', 'reviews', 'contact', 'footer'],
  },
  {
    slug: 'retail-store-website',
    name: 'Retail store website',
    industry: 'retail',
    description: 'Retail store website',
    tags: ['retail', 'modern', 'website'],
    primary: '#2563eb',
    secondary: '#dbeafe',
    sections: ['navigation', 'hero', 'featured', 'visit_us', 'footer'],
  },
  {
    slug: 'professional-services-website',
    name: 'Professional services website',
    industry: 'services',
    description: 'Professional services website',
    tags: ['services', 'modern', 'website'],
    primary: '#0f766e',
    secondary: '#ccfbf1',
    sections: ['navigation', 'hero', 'usp', 'about', 'contact', 'footer'],
  },
  {
    slug: 'trades-home-services-website',
    name: 'Trades & home services website',
    industry: 'trades',
    description: 'Trades & home services website',
    tags: ['trades', 'modern', 'website'],
    primary: '#b45309',
    secondary: '#fef3c7',
    sections: ['navigation', 'hero', 'usp', 'about', 'contact', 'footer'],
  },
  {
    slug: 'travel-business-website',
    name: 'Travel business website',
    industry: 'travel',
    description: 'Travel business website',
    tags: ['travel', 'modern', 'website'],
    primary: '#0369a1',
    secondary: '#e0f2fe',
    sections: ['navigation', 'hero', 'featured', 'about', 'contact', 'footer'],
  },
  {
    slug: 'minimal-seller-storefront',
    name: 'Minimal personal seller storefront',
    industry: 'retail',
    description: 'Minimal personal seller storefront',
    tags: ['retail', 'minimal', 'website'],
    primary: '#525252',
    secondary: '#f5f5f5',
    sections: ['navigation', 'hero', 'featured', 'about', 'contact', 'footer'],
  },
];

function layoutDefinition(sections) {
  return {
    sections: sections.map((type, order) => ({
      id: type,
      type,
      visible: true,
      order,
    })),
  };
}

function themeDefinition(tpl) {
  return {
    primaryColor: tpl.primary,
    secondaryColor: tpl.secondary,
    ...(tpl.fontFamily ? { fontFamily: tpl.fontFamily } : {}),
  };
}

async function ensureLibrary() {
  const existing =
    (await prisma.templateLibrary.findUnique({ where: { slug: LIBRARY_SLUG } })) ||
    (await prisma.templateLibrary.findUnique({ where: { slug: FALLBACK_LIBRARY_SLUG } }));
  if (existing) {
    return prisma.templateLibrary.update({
      where: { id: existing.id },
      data: { status: 'ACTIVE', visibility: 'PUBLIC' },
    });
  }
  return prisma.templateLibrary.create({
    data: {
      name: 'Cardbey Official',
      slug: LIBRARY_SLUG,
      description: 'Cardbey Official template collection',
      ownerType: 'PLATFORM',
      visibility: 'PUBLIC',
      status: 'ACTIVE',
      category: 'official',
      tags: JSON.stringify(['official', 'starter']),
      sortOrder: 0,
    },
  });
}

async function main() {
  if (!prisma.templateLibrary || !prisma.contentTemplate) {
    throw new Error('Prisma client missing Template Library models — run prisma generate');
  }

  const library = await ensureLibrary();
  let upserted = 0;

  for (const tpl of STORE_WEBSITE_TEMPLATES) {
    const theme = themeDefinition(tpl);
    const layout = layoutDefinition(tpl.sections);
    const definition = { contentType: 'STORE_WEBSITE', slug: tpl.slug };

    // Prefer any existing row with this slug (avoids duplicate galleries).
    const existing = await prisma.contentTemplate.findFirst({
      where: { slug: tpl.slug, contentType: 'STORE_WEBSITE' },
      include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
      orderBy: { createdAt: 'asc' },
    });

    if (!existing) {
      const created = await prisma.contentTemplate.create({
        data: {
          libraryId: library.id,
          name: tpl.name,
          slug: tpl.slug,
          description: tpl.description,
          contentType: 'STORE_WEBSITE',
          industry: tpl.industry,
          useCase: 'website',
          status: 'PUBLISHED',
          visibility: 'PUBLIC',
          tags: JSON.stringify(tpl.tags),
          supportedChannels: JSON.stringify(['web_desktop', 'web_mobile']),
          supportedLocales: JSON.stringify(['en']),
          qualityScore: 80,
          createdBy: 'system',
        },
      });
      const version = await prisma.contentTemplateVersion.create({
        data: {
          templateId: created.id,
          versionNumber: 1,
          definition,
          themeDefinition: theme,
          layoutDefinition: layout,
          defaultData: {},
          publishedAt: new Date(),
        },
      });
      await prisma.contentTemplate.update({
        where: { id: created.id },
        data: { currentVersionId: version.id },
      });
      upserted += 1;
      continue;
    }

    await prisma.contentTemplate.update({
      where: { id: existing.id },
      data: {
        name: tpl.name,
        description: tpl.description,
        contentType: 'STORE_WEBSITE',
        industry: tpl.industry,
        useCase: 'website',
        status: 'PUBLISHED',
        visibility: 'PUBLIC',
        tags: JSON.stringify(tpl.tags),
      },
    });

    const latest = existing.versions[0];
    if (latest) {
      await prisma.contentTemplateVersion.update({
        where: { id: latest.id },
        data: {
          themeDefinition: theme,
          layoutDefinition: layout,
          definition,
          publishedAt: latest.publishedAt || new Date(),
        },
      });
      if (!existing.currentVersionId) {
        await prisma.contentTemplate.update({
          where: { id: existing.id },
          data: { currentVersionId: latest.id },
        });
      }
    } else {
      const version = await prisma.contentTemplateVersion.create({
        data: {
          templateId: existing.id,
          versionNumber: 1,
          definition,
          themeDefinition: theme,
          layoutDefinition: layout,
          defaultData: {},
          publishedAt: new Date(),
        },
      });
      await prisma.contentTemplate.update({
        where: { id: existing.id },
        data: { currentVersionId: version.id },
      });
    }
    upserted += 1;
  }

  // Drop orphan fallback library if empty after slug-prefer upserts.
  const fallback = await prisma.templateLibrary.findUnique({
    where: { slug: FALLBACK_LIBRARY_SLUG },
    include: { templates: { select: { id: true } } },
  });
  if (fallback && fallback.templates.length === 0) {
    await prisma.templateLibrary.delete({ where: { id: fallback.id } });
  }

  const count = await prisma.contentTemplate.count({
    where: { contentType: 'STORE_WEBSITE', status: 'PUBLISHED' },
  });
  console.log(
    `[seed-template-library] library=${library.slug} upserted=${upserted} published STORE_WEBSITE=${count}`,
  );
}

main()
  .catch((err) => {
    console.error('[seed-template-library] failed', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
  });
