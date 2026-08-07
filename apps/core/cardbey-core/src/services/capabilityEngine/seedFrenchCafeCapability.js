/**
 * Seed the French Café Starter Pack pilot capability (idempotent).
 */

import { createCapabilityRepository } from './capabilityRepository.js';
import {
  ALLOWED_ADAPTERS,
  CAPABILITY_STATUS,
  CAPABILITY_TYPE,
  VERSION_STATUS,
} from './capabilityTypes.js';
import { evaluateCapabilityRights } from './rightsEvaluator.js';

const SLUG = 'french-cafe-starter-pack';

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export async function seedFrenchCafeCapability(prisma) {
  const repo = createCapabilityRepository(prisma);

  // Resolve real library assets from french-cafe / food-drink collection
  const collection = await prisma.universalEntity.findUnique({
    where: { kind_slug: { kind: 'Collection', slug: 'french-cafe-starter' } },
  });
  const meta = collection?.metadata && typeof collection.metadata === 'object' ? collection.metadata : {};
  let assetIds = Array.isArray(meta.assetIds) ? meta.assetIds.slice(0, 8) : [];
  if (assetIds.length === 0) {
    const fallback = await prisma.universalAsset.findMany({
      where: { status: 'PUBLISHED' },
      take: 40,
    });
    assetIds = fallback
      .filter((a) => {
        const m = a.metadata && typeof a.metadata === 'object' ? a.metadata : {};
        return (
          String(m.industry || '') === 'food-drink' ||
          (Array.isArray(a.categories) && a.categories.map(String).includes('food-drink'))
        );
      })
      .slice(0, 6)
      .map((a) => a.id);
  }

  let capability = await repo.getBySlug(SLUG);
  if (!capability) {
    capability = await repo.insertCapability({
      ownerType: 'platform',
      ownerId: 'cardbey_platform',
      creatorId: 'cardbey_originals',
      slug: SLUG,
      name: 'French Café Starter Pack',
      summary: 'Apply a café storefront draft, menu placeholders, promo draft, and display playlist draft.',
      description:
        'A controlled Capability that helps launch a French café presence using Cardbey drafts only. Does not publish your store, invent reviews, or set real prices.',
      capabilityType: CAPABILITY_TYPE.STORE_SETUP,
      industry: 'food-drink',
      status: CAPABILITY_STATUS.DRAFT,
      visibility: 'public',
      defaultLicenceCode: 'cardbey-capability-internal',
      previewAssetIds: assetIds.slice(0, 3),
    });
  }

  const versions = await repo.listVersions(capability.id);
  let version = versions.find((v) => v.status === VERSION_STATUS.PUBLISHED) || versions[0];
  if (!version) {
    version = await repo.insertVersion({
      capabilityId: capability.id,
      versionNumber: 1,
      versionLabel: '1.0.0',
      changelog: 'Phase 4A pilot — draft-only café launch pack',
      status: VERSION_STATUS.DRAFT,
      inputSchema: [
        {
          key: 'businessName',
          label: 'Café name',
          type: 'TEXT',
          required: true,
          description: 'Display name for draft storefront',
        },
        {
          key: 'serviceCategory',
          label: 'Service category',
          type: 'ENUM',
          required: true,
          defaultValue: 'cafe',
          validation: { enum: ['cafe', 'restaurant', 'bakery'] },
        },
        {
          key: 'location',
          label: 'Location',
          type: 'LOCATION',
          required: true,
        },
        {
          key: 'preferredLanguage',
          label: 'Preferred language',
          type: 'LANGUAGE',
          required: false,
          defaultValue: 'en',
        },
        {
          key: 'contactNumber',
          label: 'Contact number',
          type: 'TEXT',
          required: false,
          sensitive: true,
        },
      ],
      dependencyDefinition: {
        collectionSlug: 'french-cafe-starter',
        libraryAssetIds: assetIds,
      },
      compatibilityDefinition: {
        targetTypes: ['DRAFT_STORE'],
        requiresFeatureFlags: ['ENABLE_CAPABILITY_ENGINE_V1', 'ENABLE_CAPABILITY_APPLICATION_V1'],
      },
      executionDefinition: {
        steps: [
          {
            id: 'confirm',
            type: 'REQUEST_USER_CONFIRMATION',
            name: 'Confirm application',
            description: 'User must confirm the execution plan',
            adapterKey: ALLOWED_ADAPTERS.REQUEST_USER_CONFIRMATION,
            failurePolicy: 'STOP',
            rollbackPolicy: 'ROLLBACK_STEP',
          },
          {
            id: 'template',
            type: 'APPLY_STOREFRONT_TEMPLATE',
            name: 'Apply café storefront template (draft)',
            description: 'Sets draft template and preview — does not publish',
            adapterKey: ALLOWED_ADAPTERS.APPLY_STOREFRONT_TEMPLATE_DRAFT,
            config: { templateKey: 'restaurant-cafe' },
            failurePolicy: 'ROLLBACK_ALL',
            rollbackPolicy: 'ROLLBACK_STEP',
          },
          {
            id: 'assets',
            type: 'ATTACH_ASSET',
            name: 'Attach Library café assets',
            description: 'References Universal Library assets on the draft',
            adapterKey: ALLOWED_ADAPTERS.ATTACH_LIBRARY_ASSETS,
            config: { assetIds },
            failurePolicy: 'CONTINUE_OPTIONAL',
            rollbackPolicy: 'ROLLBACK_STEP',
          },
          {
            id: 'menu',
            type: 'SET_CONFIGURATION',
            name: 'Create menu structure placeholders',
            description: 'Placeholder categories only — no fake prices',
            adapterKey: ALLOWED_ADAPTERS.CREATE_MENU_STRUCTURE_DRAFT,
            failurePolicy: 'STOP',
            rollbackPolicy: 'ROLLBACK_STEP',
          },
          {
            id: 'promo',
            type: 'CREATE_PROMOTION_DRAFT',
            name: 'Create promotion draft',
            description: 'Draft artifact only — not launched',
            adapterKey: ALLOWED_ADAPTERS.CREATE_PROMOTION_DRAFT,
            failurePolicy: 'CONTINUE_OPTIONAL',
            rollbackPolicy: 'ROLLBACK_STEP',
          },
          {
            id: 'playlist',
            type: 'CREATE_DISPLAY_PLAYLIST_DRAFT',
            name: 'Create display playlist draft',
            description: 'Inactive playlist — not pushed to devices',
            adapterKey: ALLOWED_ADAPTERS.CREATE_DISPLAY_PLAYLIST_DRAFT,
            failurePolicy: 'CONTINUE_OPTIONAL',
            rollbackPolicy: 'ROLLBACK_STEP',
          },
        ],
      },
    });

    const componentDefs = [
      {
        componentType: 'COLLECTION',
        referenceType: 'UniversalEntity',
        referenceId: collection?.id || 'french-cafe-starter',
        configuration: { slug: 'french-cafe-starter' },
        sortOrder: 0,
      },
      ...assetIds.map((id, i) => ({
        componentType: 'LIBRARY_ASSET',
        referenceType: 'UniversalAsset',
        referenceId: id,
        sortOrder: i + 1,
        required: false,
      })),
      {
        componentType: 'PLATFORM_ACTION',
        referenceType: 'Adapter',
        referenceId: ALLOWED_ADAPTERS.APPLY_STOREFRONT_TEMPLATE_DRAFT,
        sortOrder: 100,
      },
    ];
    for (const c of componentDefs) {
      await repo.insertComponent({ capabilityVersionId: version.id, ...c });
    }
  }

  const components = await repo.listComponents(version.id);
  const rights = await evaluateCapabilityRights(prisma, version, components);
  if (!rights.ok && assetIds.length === 0) {
    // Allow publish with collection reference only when assets still empty — mark review
    await repo.updateVersion(version.id, {
      changelog: `${version.changelog || ''} | rights: pending assets`,
    });
  } else if (!rights.ok) {
    return { ok: false, error: 'rights_conflict', rights, capabilityId: capability.id };
  }

  if (version.status !== VERSION_STATUS.PUBLISHED) {
    const now = new Date().toISOString();
    version = await repo.updateVersion(version.id, {
      status: VERSION_STATUS.PUBLISHED,
      approvedAt: now,
      publishedAt: now,
    });
  }
  capability = await repo.updateCapability(capability.id, {
    status: CAPABILITY_STATUS.PUBLISHED,
    currentVersionId: version.id,
    publishedAt: capability.publishedAt || new Date().toISOString(),
    visibility: 'public',
    previewAssetIds: assetIds.slice(0, 3),
  });

  return {
    ok: true,
    capability,
    version,
    assetCount: assetIds.length,
    rights,
  };
}
