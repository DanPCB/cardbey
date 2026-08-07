/**
 * Capability rights — fail closed on unresolved conflicts.
 * A capability cannot grant broader rights than its components.
 */

import { isDevelopmentFixture } from '../universalLibrary/contentOrigin.js';

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object} version
 * @param {object[]} components
 */
export async function evaluateCapabilityRights(prisma, version, components) {
  const reasons = [];
  const assetRefs = (components || []).filter(
    (c) => c.componentType === 'LIBRARY_ASSET' || c.referenceType === 'UniversalAsset',
  );

  for (const ref of assetRefs) {
    if (!ref.referenceId) {
      reasons.push({ code: 'MISSING_ASSET_REFERENCE', componentId: ref.id });
      continue;
    }
    const asset = await prisma.universalAsset.findUnique({ where: { id: ref.referenceId } });
    if (!asset) {
      reasons.push({ code: 'ASSET_NOT_FOUND', referenceId: ref.referenceId });
      continue;
    }
    if (isDevelopmentFixture(asset)) {
      reasons.push({ code: 'FIXTURE_ASSET_FORBIDDEN', referenceId: ref.referenceId });
      continue;
    }
    const rights = String(asset.rightsStatus || '').toUpperCase();
    if (rights === 'UNKNOWN' || rights === 'REJECTED' || rights === 'RESTRICTED') {
      reasons.push({ code: 'ASSET_RIGHTS_NOT_CLEARED', referenceId: ref.referenceId, rights });
    }
  }

  const collectionRefs = (components || []).filter((c) => c.componentType === 'COLLECTION');
  for (const col of collectionRefs) {
    if (!col.referenceId && !col.configuration?.slug) {
      reasons.push({ code: 'COLLECTION_REFERENCE_MISSING', componentId: col.id });
    }
  }

  const ok = reasons.length === 0;
  return {
    ok,
    compatible: ok,
    reasons,
    policy: 'capability_cannot_exceed_component_rights',
  };
}
