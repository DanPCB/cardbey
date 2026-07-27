/**
 * Content provenance — mandatory distinction between original and AI-generated assets.
 * Demo content must not publish accidentally.
 */

import type { ContentProvenance, ContentSourceType, FetchedAsset } from './types.js';

export function provenanceForSource(
  source: ContentSourceType,
  opts: { demoReason?: string } = {},
): ContentProvenance {
  const isAi = source === 'AI_GENERATED';
  return {
    source,
    isDemo: isAi,
    needsReplacement: isAi,
    replacementStatus: isAi ? 'pending' : undefined,
    demoReason: isAi ? (opts.demoReason ?? 'AI-generated placeholder') : null,
  };
}

export function markAssetReplaced(asset: FetchedAsset): FetchedAsset {
  return {
    ...asset,
    provenance: {
      ...asset.provenance,
      isDemo: false,
      needsReplacement: false,
      replacementStatus: 'replaced',
      source: asset.provenance.source === 'AI_GENERATED' ? 'USER_UPLOADED' : asset.provenance.source,
    },
  };
}

export interface DemoContentViolation {
  field: string;
  reason: string;
}

/** Block publish when unreplaced demo content remains on draft payload. */
export function findUnreplacedDemoViolations(payload: {
  products?: Array<{ name?: string; imageProvenance?: ContentProvenance; provenance?: ContentProvenance }>;
  services?: Array<{ name?: string; provenance?: ContentProvenance }>;
  heroImage?: { provenance?: ContentProvenance };
  logo?: { provenance?: ContentProvenance };
}): DemoContentViolation[] {
  const violations: DemoContentViolation[] = [];

  const check = (field: string, prov: ContentProvenance | undefined) => {
    if (!prov) return;
    if (prov.isDemo && prov.needsReplacement && prov.replacementStatus !== 'replaced' && prov.replacementStatus !== 'skipped') {
      violations.push({
        field,
        reason: prov.demoReason ?? 'Demo content must be replaced before publish',
      });
    }
  };

  check('heroImage', payload.heroImage?.provenance);
  check('logo', payload.logo?.provenance);

  for (const [i, p] of (payload.products ?? []).entries()) {
    check(`products[${i}].${p.name ?? i}`, p.imageProvenance ?? p.provenance);
  }
  for (const [i, s] of (payload.services ?? []).entries()) {
    check(`services[${i}].${s.name ?? i}`, s.provenance);
  }

  return violations;
}

export function assertPublishableNoDemoContent(payload: Parameters<typeof findUnreplacedDemoViolations>[0]): void {
  const violations = findUnreplacedDemoViolations(payload);
  if (violations.length > 0) {
    const detail = violations.map((v) => `${v.field}: ${v.reason}`).join('; ');
    throw new Error(`Cannot publish: unreplaced demo content — ${detail}`);
  }
}
