#!/usr/bin/env node
/**
 * Governed repair for AWE FINANCIAL public storefront fidelity issues.
 *
 * Default: DRY-RUN only (prints proposed mutations; writes nothing).
 *
 * Apply (explicit confirmation required):
 *   CARDBEY_CONFIRM_LIVE_REPAIR=1 node scripts/repair-awe-financial-storefront.mjs --apply
 *
 * Optional:
 *   --slug=awe-financial
 *   --store-id=cmsn1psxj006elcb3q9p2f79j
 *   --brochure   include brochure contact/description/services (still gated)
 *
 * Safe-execution: does NOT auto-publish. Projection rebuild is a separate confirmed step.
 *
 * Note (2026-08-26): awefinancial.com.au is currently a GoDaddy stub without brochure
 * phone/email/address — brochure fields are the authoritative contact source for repair.
 */

import { PrismaClient } from '@prisma/client';

const APPLY = process.argv.includes('--apply');
const BROCHURE = process.argv.includes('--brochure');
const CONFIRM = String(process.env.CARDBEY_CONFIRM_LIVE_REPAIR || '') === '1';
const slugArg = process.argv.find((a) => a.startsWith('--slug='));
const idArg = process.argv.find((a) => a.startsWith('--store-id='));
const SLUG = slugArg ? slugArg.slice('--slug='.length) : 'awe-financial';
const STORE_ID = idArg ? idArg.slice('--store-id='.length) : 'cmsn1psxj006elcb3q9p2f79j';

const prisma = new PrismaClient();

const BAD_IMAGE_RE =
  /\b(sanitation|garbage|waste|truck|hi-?vis|high visibility|bicycle|road maintenance|street cleaning|sweeper)\b/i;

const CREATE_STORE_PROMPT_RE =
  /^create\s+(?:a\s+)?(?:store|shop|business|website|mini\s*website)\b/i;
const MARKETING_SLOGAN_RE =
  /\b(ngân\s*hàng|banks?\s+to\s+choose|lựa\s*chọn|100\+|hơn\s+\d+|options?\s+for)\b/i;
const GEO_TOKEN_RE =
  /\b(VIC|NSW|QLD|SA|WA|TAS|NT|ACT|australia|melbourne|sydney|brisbane|perth|adelaide|footscray)\b/i;

function isSyntheticCreateStorePrompt(text) {
  return CREATE_STORE_PROMPT_RE.test(String(text ?? '').trim());
}

function isPlaceLikeLocationText(text) {
  const t = String(text ?? '').trim();
  if (!t || t.length < 3) return false;
  if (MARKETING_SLOGAN_RE.test(t)) return false;
  if (isSyntheticCreateStorePrompt(t)) return false;
  return GEO_TOKEN_RE.test(t) || /\b\d{4}\b/.test(t);
}

const BROCHURE_FIELDS = {
  description:
    'AWE Financial helps you unlock better financial solutions — from home loans and debt consolidation to low-doc business loans and property investment. Led by Leo Nguyen, Finance Broker, with access to 100+ lenders across Australia.',
  tagline: 'Empowering Your Financial Future with Confidence and Clarity',
  phone: '0420 435 238',
  email: 'leo@awefinancial.com.au',
  address: '238 Barkly St, Footscray VIC',
  suburb: 'Footscray',
  location: 'Footscray VIC',
  type: 'Professional',
};

const BROCHURE_SERVICES = [
  {
    name: 'Home Loan',
    description:
      'Find a better home loan interest rate from 100+ lenders. We compare and negotiate on your behalf.',
  },
  {
    name: 'Debt Consolidation',
    description: 'Consolidate your debts to improve cash flow and simplify repayments.',
  },
  {
    name: 'Low Doc Business Loan',
    description: 'Low documentation loans designed for self-employed business owners.',
  },
  {
    name: 'Property Investment Finance',
    description: 'Finance for new property investment or refinancing existing assets.',
  },
  {
    name: 'Refinancing',
    description: 'Refinance your existing mortgage or business loan to get a better rate.',
  },
];

function fallbackAbout(name, type) {
  return `${name || 'This business'} is a ${type || 'professional service'} dedicated to quality and a great customer experience.`;
}

function patchMiniWebsite(miniWebsite, business) {
  if (!miniWebsite || typeof miniWebsite !== 'object') {
    return { next: miniWebsite, changes: [] };
  }
  const changes = [];
  const next = JSON.parse(JSON.stringify(miniWebsite));
  const sections = Array.isArray(next.sections) ? next.sections : [];

  const about = sections.find((s) => s?.type === 'about');
  if (about?.content && typeof about.content === 'object') {
    const body = typeof about.content.body === 'string' ? about.content.body : '';
    if (isSyntheticCreateStorePrompt(body)) {
      about.content.body = BROCHURE
        ? BROCHURE_FIELDS.description
        : fallbackAbout(business.name, business.type);
      changes.push('about.body: replace create-store prompt');
    }
    if (typeof about.content.imageUrl === 'string' && BAD_IMAGE_RE.test(String(about.content.imageUrl))) {
      about.content.imageUrl = null;
      changes.push('about.imageUrl: clear mismatched stock image');
    }
  }

  const contact = sections.find((s) => s?.type === 'contact');
  if (contact?.content && typeof contact.content === 'object') {
    const address = typeof contact.content.address === 'string' ? contact.content.address : '';
    if (address && !isPlaceLikeLocationText(address)) {
      contact.content.address = BROCHURE ? BROCHURE_FIELDS.address : null;
      changes.push(
        BROCHURE ? 'contact.address: set brochure address' : 'contact.address: clear non-geo slogan',
      );
    } else if (BROCHURE && !address) {
      contact.content.address = BROCHURE_FIELDS.address;
      changes.push('contact.address: set brochure address');
    }
    if (BROCHURE) {
      if (!contact.content.phone) {
        contact.content.phone = BROCHURE_FIELDS.phone;
        changes.push('contact.phone: set brochure phone');
      }
      if (!contact.content.email) {
        contact.content.email = BROCHURE_FIELDS.email;
        changes.push('contact.email: set brochure email');
      }
    }
  }

  const showIdx = sections.findIndex((s) => s?.type === 'show');
  if (showIdx >= 0) {
    const show = sections[showIdx];
    const content = show?.content && typeof show.content === 'object' ? show.content : {};
    const items = Array.isArray(content.items) ? content.items : [];
    const works = Array.isArray(content.works) ? content.works : [];
    const productIds = Array.isArray(content.productIds) ? content.productIds : [];
    if (items.length === 0 && works.length === 0 && productIds.length === 0) {
      sections.splice(showIdx, 1);
      changes.push('show: remove empty Shows section');
    }
  }

  next.sections = sections;
  return { next, changes };
}

async function main() {
  console.log(
    `[repair-awe-financial] mode=${APPLY ? 'APPLY' : 'DRY-RUN'} brochure=${BROCHURE} slug=${SLUG} id=${STORE_ID}`,
  );

  if (APPLY && !CONFIRM) {
    console.error('Refusing --apply without CARDBEY_CONFIRM_LIVE_REPAIR=1 (safe-execution gate).');
    process.exit(2);
  }

  const business = await prisma.business.findFirst({
    where: {
      OR: [{ id: STORE_ID }, { slug: SLUG }],
    },
    select: {
      id: true,
      name: true,
      slug: true,
      type: true,
      location: true,
      phone: true,
      email: true,
      description: true,
      stylePreferences: true,
      products: {
        select: { id: true, name: true, imageUrl: true, price: true },
        take: 50,
      },
    },
  });

  if (!business) {
    console.error('Business not found. Check DATABASE_URL / slug / id.');
    process.exit(1);
  }

  const prefs =
    business.stylePreferences && typeof business.stylePreferences === 'object'
      ? { ...business.stylePreferences }
      : {};
  const miniWebsite = prefs.miniWebsite ?? prefs.website ?? null;
  const { next, changes } = patchMiniWebsite(miniWebsite, business);

  const locationChanges = [];
  let nextLocation = business.location;
  if (
    typeof business.location === 'string' &&
    business.location.trim() &&
    !isPlaceLikeLocationText(business.location)
  ) {
    nextLocation = BROCHURE ? BROCHURE_FIELDS.location : null;
    locationChanges.push(
      BROCHURE
        ? `location: replace slogan with "${BROCHURE_FIELDS.location}"`
        : `location: clear "${business.location}"`,
    );
  } else if (BROCHURE && !business.location) {
    nextLocation = BROCHURE_FIELDS.location;
    locationChanges.push(`location: set "${BROCHURE_FIELDS.location}"`);
  }

  const fieldChanges = [];
  const fieldPatch = {};
  if (BROCHURE) {
    if (!business.phone || String(business.phone).includes('xxx')) {
      fieldPatch.phone = BROCHURE_FIELDS.phone;
      fieldChanges.push(`phone: ${BROCHURE_FIELDS.phone}`);
    }
    if (!business.email) {
      fieldPatch.email = BROCHURE_FIELDS.email;
      fieldChanges.push(`email: ${BROCHURE_FIELDS.email}`);
    }
    if (
      !business.description ||
      isSyntheticCreateStorePrompt(String(business.description)) ||
      /tạo cửa hàng|create a store for/i.test(String(business.description))
    ) {
      fieldPatch.description = BROCHURE_FIELDS.description;
      fieldChanges.push('description: brochure copy');
    }
    if (business.type && /^other$/i.test(String(business.type))) {
      fieldPatch.type = BROCHURE_FIELDS.type;
      fieldChanges.push(`type: ${BROCHURE_FIELDS.type}`);
    }
  }

  const badProducts = (business.products || []).filter((p) => {
    const name = String(p.name || '');
    const img = String(p.imageUrl || '');
    return (
      /consultation/i.test(name) ||
      Number(p.price) === 24.95 ||
      BAD_IMAGE_RE.test(img) ||
      BAD_IMAGE_RE.test(name)
    );
  });

  console.log('Target:', { id: business.id, slug: business.slug, name: business.name });
  console.log('Proposed miniWebsite changes:', changes.length ? changes : ['(none)']);
  console.log('Proposed location changes:', locationChanges.length ? locationChanges : ['(none)']);
  console.log('Proposed field changes:', fieldChanges.length ? fieldChanges : ['(none)']);
  console.log(
    'Proposed product cleanup:',
    badProducts.length
      ? badProducts.map((p) => `${p.id}:${p.name}`)
      : ['(none)'],
  );
  if (BROCHURE) {
    console.log(
      'Proposed service upserts:',
      BROCHURE_SERVICES.map((s) => s.name),
    );
  }

  const enrichmentGuard = {
    manuallyVerified: true,
    skipWebsiteFetch: true,
    note: 'MANUALLY_VERIFIED_2026-08-26 — website is GoDaddy stub; brochure data applied directly',
    verifiedAt: new Date().toISOString(),
    verifiedSource: 'brochure',
  };
  console.log('Proposed enrichmentGuard:', enrichmentGuard);

  if (!APPLY) {
    console.log('Dry-run complete. Re-run with CARDBEY_CONFIRM_LIVE_REPAIR=1 --apply [--brochure] to write.');
    console.log('After apply, schedule a separate confirmed republish if public projection is stale.');
    return;
  }

  const nextPrefs = {
    ...prefs,
    ...(next ? { miniWebsite: next } : {}),
    enrichmentGuard,
  };

  await prisma.business.update({
    where: { id: business.id },
    data: {
      ...(locationChanges.length ? { location: nextLocation } : {}),
      ...fieldPatch,
      ...(BROCHURE
        ? {
            address: BROCHURE_FIELDS.address,
            suburb: BROCHURE_FIELDS.suburb,
            state: 'VIC',
            tagline: BROCHURE_FIELDS.tagline,
          }
        : {}),
      stylePreferences: nextPrefs,
    },
  });

  if (badProducts.length) {
    const del = await prisma.product.deleteMany({
      where: { id: { in: badProducts.map((p) => p.id) } },
    });
    console.log('Deleted mismatched products:', del.count);
  }

  if (BROCHURE && prisma.product?.create) {
    for (const service of BROCHURE_SERVICES) {
      const existing = await prisma.product.findFirst({
        where: { businessId: business.id, name: service.name },
        select: { id: true },
      });
      if (existing) {
        await prisma.product.update({
          where: { id: existing.id },
          data: { description: service.description },
        });
      } else {
        await prisma.product.create({
          data: {
            businessId: business.id,
            name: service.name,
            description: service.description,
          },
        });
      }
    }
    console.log('Services upserted:', BROCHURE_SERVICES.length);
  }

  // Mirror guard onto candidate record when present (batch enrich path).
  try {
    if (prisma.businessCandidate?.findFirst) {
      const candidate = await prisma.businessCandidate.findFirst({
        where: {
          OR: [
            { name: { contains: 'AWE' } },
            { website: { contains: 'awefinancial' } },
          ],
        },
        select: { id: true, metadata: true, enrichmentNote: true },
      });
      if (candidate) {
        const meta =
          candidate.metadata && typeof candidate.metadata === 'object' ? candidate.metadata : {};
        await prisma.businessCandidate.update({
          where: { id: candidate.id },
          data: {
            enrichmentNote: enrichmentGuard.note,
            metadata: {
              ...meta,
              skipWebsiteFetch: true,
              manuallyVerified: true,
              verifiedAt: enrichmentGuard.verifiedAt,
            },
          },
        });
        console.log('Candidate enrichment guard set:', candidate.id);
      }
    }
  } catch (err) {
    console.warn('[repair-awe-financial] candidate guard skipped:', err?.message ?? err);
  }

  console.log('Applied Business patch. Public projection may still need a confirmed republish.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
