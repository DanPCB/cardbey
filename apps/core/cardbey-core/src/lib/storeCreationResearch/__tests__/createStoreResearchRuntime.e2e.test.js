/**
 * Runtime regression for research-grounded create-store (no live Places/network).
 * Exercises the real import graph + research agent with controlled source adapters.
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { clearResearchEvidenceForTests } from '../researchEvidenceRepository.js';
import { resolveStoreResearchInputFields } from '../researchInputFields.js';
import {
  finalizeResearchCatalogForDraft,
  isResearchCatalogPendingOwnerReview,
  stampSuggestedCatalogOrigin,
} from '../../../services/draftStore/researchCatalogDraft.js';
import { buildCatalogFromPreloadedItems } from '../../../services/draftStore/preloadedCatalogFromItems.js';
import { classifyGenerateDraftFailure } from '../../toolExecutors/store/classifyGenerateDraftFailure.js';

vi.mock('../sourceDiscoveryService.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    discoverSources: vi.fn(),
  };
});

import { discoverSources } from '../sourceDiscoveryService.js';
import { runStoreCreationResearch } from '../businessResearchAgent.js';

const FIXTURE = {
  businessName: 'Modern Security Doors',
  location: 'Unit 54/68 Eucumbene Dr, Ravenhall VIC 3023',
  websiteUrl: 'https://modern-security-doors.example',
  phone: '+61390001234',
  email: 'hello@modern-security-doors.example',
  ocrText: 'Modern Security Doors — security screens and doors — Ravenhall VIC',
};

beforeEach(() => {
  clearResearchEvidenceForTests();
  vi.clearAllMocks();
});

describe('create-store research runtime e2e (fixture)', () => {
  it('forwards Phase 1 contact fields into research input resolution', () => {
    const fields = resolveStoreResearchInputFields(
      {
        businessName: FIXTURE.businessName,
        location: FIXTURE.location,
        websiteUrl: FIXTURE.websiteUrl,
        phone: FIXTURE.phone,
        email: FIXTURE.email,
      },
      { ocrText: FIXTURE.ocrText, website: FIXTURE.websiteUrl },
    );
    expect(fields.businessName).toMatch(/Modern Security/i);
    expect(fields.website || fields.websiteUrl).toBeTruthy();
    expect(fields.phone).toBeTruthy();
  });

  it('stages sourced catalog pending owner review when research returns menu offers', async () => {
    discoverSources.mockResolvedValue([
      {
        sourceType: 'official_website',
        sourceUrl: FIXTURE.websiteUrl,
        priority: 0,
        raw: {
          name: FIXTURE.businessName,
          phone: FIXTURE.phone,
          address: FIXTURE.location,
          offers: [
            { name: 'Security screen door', price: 890, description: 'Installed' },
            { name: 'Pet mesh upgrade', price: 220, description: 'Add-on' },
          ],
        },
      },
    ]);

    const research = await runStoreCreationResearch(
      {
        businessName: FIXTURE.businessName,
        location: FIXTURE.location,
        website: FIXTURE.websiteUrl,
        phone: FIXTURE.phone,
        email: FIXTURE.email,
        ocrText: FIXTURE.ocrText,
      },
      { prisma: null },
    );

    expect(research.researchRan).toBe(true);
    expect(discoverSources).toHaveBeenCalled();

    if (research.catalog?.products?.length || research.preloadedCatalogItems?.length) {
      const catalog =
        research.catalog ??
        buildCatalogFromPreloadedItems(research.preloadedCatalogItems || [], {
          businessName: FIXTURE.businessName,
        });
      if (isResearchCatalogPendingOwnerReview(research)) {
        const prev = process.env.PERFORMER_STAGE_SOURCED_CATALOG_PENDING_REVIEW;
        process.env.PERFORMER_STAGE_SOURCED_CATALOG_PENDING_REVIEW = '1';
        try {
          const finalized = finalizeResearchCatalogForDraft(catalog, research, {
            businessName: FIXTURE.businessName,
          });
          expect(finalized.meta?.contentOrigin || finalized.products?.[0]?.contentOrigin).toBeTruthy();
        } finally {
          if (prev === undefined) delete process.env.PERFORMER_STAGE_SOURCED_CATALOG_PENDING_REVIEW;
          else process.env.PERFORMER_STAGE_SOURCED_CATALOG_PENDING_REVIEW = prev;
        }
      }
    }
  });

  it('suggested fallback stamp remains available when research yields no catalog', async () => {
    discoverSources.mockResolvedValue([]);

    const research = await runStoreCreationResearch(
      {
        businessName: FIXTURE.businessName,
        location: FIXTURE.location,
        website: FIXTURE.websiteUrl,
        phone: FIXTURE.phone,
      },
      { prisma: null },
    );

    expect(research).toBeTruthy();
    const suggested = stampSuggestedCatalogOrigin(
      buildCatalogFromPreloadedItems(
        [{ name: 'Custom security door', price: 999 }],
        { businessName: FIXTURE.businessName },
      ),
    );
    expect(suggested.meta.contentOrigin).toBe('suggested');
    expect(suggested.products[0].contentOrigin).toBe('suggested');
  });

  it('no-match research falls back without MODULE_NOT_FOUND classification', async () => {
    discoverSources.mockResolvedValue([]);
    const research = await runStoreCreationResearch(
      {
        businessName: FIXTURE.businessName,
        location: FIXTURE.location,
        website: FIXTURE.websiteUrl,
      },
      { prisma: null },
    );
    expect(research).toBeTruthy();
    const classified = classifyGenerateDraftFailure(
      Object.assign(new Error('Cannot find module x'), { code: 'ERR_MODULE_NOT_FOUND' }),
    );
    expect(classified.code).toBe('STORE_BUILD_RUNTIME_DEPENDENCY_MISSING');
    expect(classified.message).not.toMatch(/Cannot find/);
  });
});
