/**
 * Orchestrate Phase 8B cutover for draft-store snapshot publish only.
 */

import {
  isDesignLibraryAuthoritative,
  isStorefrontProjectionAcceptanceEnabled,
  isStorefrontProjectionPublishEnabled,
} from '../flags.js';
import { fingerprintProjection, readAcceptanceFromMeta } from '../acceptance/acceptanceRecord.js';
import { catalogFromDraft } from '../acceptance/persistAcceptanceOnDraft.js';
import { buildProjectionPublishPackage } from './buildProjectionPublishPackage.js';
import { resolvePublishSnapshotSource } from './resolvePublishSnapshotSource.js';
import { attachPublishProvenance, buildPublishProvenance } from './publishProvenance.js';
import { emitStorefrontPublishCompleted } from './emitPublishCompleted.js';
import { validatePublishSnapshot } from './validatePublishSnapshot.js';

/**
 * @param {{
 *   draft: object,
 *   legacyPreview: object,
 *   context?: Record<string, unknown>,
 *   startedAtMs?: number,
 * }} input
 */
export function prepareDraftStorePublishOverride(input) {
  void isDesignLibraryAuthoritative();
  const startedAtMs = input.startedAtMs ?? Date.now();
  const draft = input.draft;
  const legacyPreview = input.legacyPreview;
  const context = {
    phone: draft?.preview?.phone ?? draft?.input?.phone,
    bookingUrl: draft?.preview?.bookingUrl,
    businessName: draft?.input?.businessName,
    ...(input.context || {}),
  };

  const catalog = catalogFromDraft(draft);
  if (!catalog.meta?.designLibraryStorefrontProjection && draft?.preview?.meta) {
    catalog.meta = { ...catalog.meta, ...draft.preview.meta };
  }

  const acceptance = readAcceptanceFromMeta(catalog.meta);
  const projection = catalog.meta?.designLibraryStorefrontProjection;
  const currentFingerprint = projection ? fingerprintProjection(projection) : null;

  const publishCutoverEnabled = isStorefrontProjectionPublishEnabled();
  const acceptanceEnabled = isStorefrontProjectionAcceptanceEnabled();

  let projectionBuilt = null;
  if (publishCutoverEnabled && acceptanceEnabled) {
    projectionBuilt = buildProjectionPublishPackage({
      catalog,
      legacyPreview,
      context,
    });
  }

  const resolved = resolvePublishSnapshotSource({
    publishCutoverEnabled,
    acceptanceEnabled,
    acceptanceRecord: acceptance,
    currentProjectionFingerprint: currentFingerprint,
    projectionPackageOk: Boolean(projectionBuilt?.ok),
    legacyPreview,
    projectionPreview: projectionBuilt?.ok ? projectionBuilt.preview : null,
  });

  // Re-validate chosen override (defense in depth)
  let primarySource = resolved.primarySource;
  let reason = resolved.reason;
  let preview = resolved.previewOverride;

  if (primarySource === 'projection') {
    const recheck = validatePublishSnapshot(preview, {
      catalogProducts: catalog.products || legacyPreview.items,
    });
    if (!recheck.ok) {
      primarySource = 'legacy';
      reason = 'projection_package_invalid';
      preview = legacyPreview;
      if (process.env.NODE_ENV !== 'production' || process.env.DESIGN_LIBRARY_POLICY_LOG === '1') {
        try {
          console.warn(
            '[storefrontDesignLibrary]',
            JSON.stringify({
              event: 'storefront.publish.projection_validation_failed',
              draftId: draft?.id ?? null,
              errors: recheck.errors,
            }),
          );
        } catch {
          /* ignore */
        }
      }
    }
  }

  const publishedAt = new Date().toISOString();
  const provenance = buildPublishProvenance(
    primarySource === 'projection'
      ? {
          source: 'projection',
          projectionFingerprint: currentFingerprint,
          acceptanceFingerprint: acceptance?.projectionFingerprint ?? null,
          blueprintId: projectionBuilt?.blueprintId ?? projection?.blueprintId ?? null,
          blueprintVersion: projectionBuilt?.blueprintVersion ?? null,
          projectionVersion: projectionBuilt?.projectionVersion ?? null,
          renderAdapterVersion: projectionBuilt?.renderAdapterVersion ?? null,
          publishedAt,
        }
      : {
          source: 'legacy',
          publishedAt,
          fallbackReason: reason === 'accepted_projection_publish' ? null : reason,
        },
  );

  const previewOverride = attachPublishProvenance(preview, provenance);

  return {
    previewOverride,
    primarySource,
    reason,
    provenance,
    acceptance,
    projectionFingerprint: currentFingerprint,
    publishDurationMs: Date.now() - startedAtMs,
    authoritative: false,
  };
}

/**
 * Emit completion after publishDraft succeeds.
 * @param {ReturnType<typeof prepareDraftStorePublishOverride>} prepared
 * @param {{ draftId?: string|null, storeId?: string|null, startedAtMs?: number }} ctx
 */
export function finalizePublishCutoverTelemetry(prepared, ctx = {}) {
  return emitStorefrontPublishCompleted({
    source: prepared.primarySource,
    draftId: ctx.draftId ?? null,
    storeId: ctx.storeId ?? null,
    blueprintId: prepared.provenance?.blueprintId ?? null,
    projectionFingerprint: prepared.projectionFingerprint ?? null,
    acceptanceFingerprint: prepared.provenance?.acceptanceFingerprint ?? null,
    publishDurationMs:
      ctx.startedAtMs != null ? Date.now() - ctx.startedAtMs : prepared.publishDurationMs,
    fallbackReason: prepared.primarySource === 'legacy' ? prepared.reason : null,
  });
}
