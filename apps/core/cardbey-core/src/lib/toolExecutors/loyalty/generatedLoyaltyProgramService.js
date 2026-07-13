/**
 * Build generated_loyalty_program — premium branded loyalty package artifact.
 */

import { randomUUID } from 'node:crypto';
import { getPrismaClient } from '../../prisma.js';
import { applyCanonicalLoyaltyDraftFields, resolveDraftStampThreshold } from './loyaltyProgramDraft.js';
import {
  hasAuthoritativeLoyaltyTopology,
  logLoyaltyContractDiagnostic,
} from '../../loyalty/loyaltyContractDiagnostics.js';

function pickString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

const CATEGORY_THEMES = {
  cafe: { primary: '#6F4E37', secondary: '#F5E6D3', accent: '#C4A574' },
  coffee: { primary: '#6F4E37', secondary: '#F5E6D3', accent: '#C4A574' },
  food: { primary: '#D97706', secondary: '#FEF3C7', accent: '#F59E0B' },
  retail: { primary: '#1E3A5F', secondary: '#E8F0FE', accent: '#3B82F6' },
  default: { primary: '#1F2937', secondary: '#F3F4F6', accent: '#6366F1' },
};

/**
 * @param {string | null | undefined} category
 */
function fallbackThemeForCategory(category) {
  const key = String(category ?? '')
    .trim()
    .toLowerCase();
  if (key.includes('cafe') || key.includes('coffee')) return CATEGORY_THEMES.cafe;
  if (key.includes('food') || key.includes('restaurant')) return CATEGORY_THEMES.food;
  if (key.includes('retail') || key.includes('shop')) return CATEGORY_THEMES.retail;
  return CATEGORY_THEMES.default;
}

/**
 * @param {string} storeId
 */
export async function loadStoreBrandingForLoyalty(storeId) {
  const sid = pickString(storeId);
  if (!sid) return null;
  try {
    const prisma = getPrismaClient();
    const b = await prisma.business.findUnique({
      where: { id: sid },
      select: {
        id: true,
        name: true,
        tagline: true,
        type: true,
        primaryColor: true,
        secondaryColor: true,
        avatarImageUrl: true,
        heroImageUrl: true,
        logo: true,
      },
    });
    if (!b) return null;

    let logoUrl =
      typeof b.avatarImageUrl === 'string' && b.avatarImageUrl.trim() ? b.avatarImageUrl.trim() : null;
    if (!logoUrl && typeof b.logo === 'string' && b.logo.trim()) {
      try {
        const parsed = JSON.parse(b.logo);
        const u = parsed?.url ?? parsed?.href;
        if (typeof u === 'string' && u.trim()) logoUrl = u.trim();
      } catch {
        /* ignore */
      }
    }

    const fallback = fallbackThemeForCategory(b.type);
    return {
      storeId: b.id,
      storeName: b.name,
      tagline: b.tagline ?? null,
      businessCategory: b.type ?? null,
      logoUrl,
      heroImageUrl: typeof b.heroImageUrl === 'string' ? b.heroImageUrl : null,
      primaryColor: b.primaryColor ?? fallback.primary,
      secondaryColor: b.secondaryColor ?? fallback.secondary,
      accentColor: fallback.accent,
      typography: 'system-ui, -apple-system, "Segoe UI", sans-serif',
      brandingSource: b.primaryColor || logoUrl ? 'store_brand_kit' : 'generated_fallback',
    };
  } catch {
    return null;
  }
}

/**
 * @param {Record<string, unknown>} branding
 */
export function buildLoyaltyCardTheme(branding) {
  const fallback = fallbackThemeForCategory(branding?.businessCategory);
  const primary = pickString(branding?.primaryColor) || fallback.primary;
  const secondary = pickString(branding?.secondaryColor) || fallback.secondary;
  const accent = pickString(branding?.accentColor) || fallback.accent;
  return {
    primaryColor: primary,
    secondaryColor: secondary,
    accentColor: accent,
    gradient: `linear-gradient(135deg, ${primary} 0%, ${accent} 55%, ${secondary} 100%)`,
    heroOverlay: 'rgba(0,0,0,0.35)',
    typography: branding?.typography ?? 'system-ui, -apple-system, "Segoe UI", sans-serif',
    brandingSource: branding?.brandingSource ?? 'generated_fallback',
  };
}

function resolvePublicJoinBase() {
  return (
    pickString(process.env.PUBLIC_CARD_BEY_BASE, process.env.PUBLIC_BASE_URL, process.env.PUBLIC_WEB_URL) ||
    'https://cardbey.com'
  ).replace(/\/$/, '');
}

/**
 * @param {{
 *   missionId: string;
 *   storeId?: string | null;
 *   storeName?: string | null;
 *   draft: Record<string, unknown>;
 *   branding?: Record<string, unknown> | null;
 * }} params
 */
export async function buildGeneratedLoyaltyProgramArtifact(params) {
  const missionId = pickString(params.missionId);
  const storeId = pickString(params.storeId, params.draft?.storeId);
  const draft = applyCanonicalLoyaltyDraftFields(
    params.draft && typeof params.draft === 'object' ? params.draft : {},
  );
  logLoyaltyContractDiagnostic('generated_loyalty_program_artifact', draft, {
    missionId,
    storeId,
  });
  const contractInvalid =
    hasAuthoritativeLoyaltyTopology(draft.cardTopology) &&
    !draft.rule &&
    process.env.NODE_ENV !== 'production';
  const branding =
    params.branding && typeof params.branding === 'object'
      ? params.branding
      : storeId
        ? await loadStoreBrandingForLoyalty(storeId)
        : null;

  const artifactId =
    pickString(draft.artifactId, draft.draftId) || `loyalty-gen-${randomUUID().slice(0, 8)}`;
  const programId = pickString(draft.loyaltyProgramId, draft.draftId, artifactId);
  const reward = pickString(draft.reward, draft.rewardRule, draft.rewardName, draft.rule?.rewardItem);
  const stampThreshold = resolveDraftStampThreshold(draft);
  const programName = pickString(draft.programName, draft.name, 'Loyalty Rewards');
  const storeName =
    pickString(params.storeName, branding?.storeName, draft.storeName) || 'Your Store';
  const rule = draft.rule && typeof draft.rule === 'object' ? draft.rule : null;
  const cardTopology =
    draft.cardTopology && typeof draft.cardTopology === 'object' ? draft.cardTopology : null;
  const cardFooterText = pickString(draft.cardFooterText, cardTopology?.footerText) || null;
  const rules =
    pickString(draft.rewardRule, draft.customerInstructions) ||
    (rule
      ? `Collect ${rule.purchasesRequired} ${rule.purchaseItem} · Get ${rule.rewardQuantity} ${rule.rewardItem}`
      : reward && stampThreshold != null
        ? `Buy ${stampThreshold}, get ${reward}`
        : 'Collect stamps to earn your reward.');

  const theme = buildLoyaltyCardTheme(
    branding ?? { businessCategory: draft.businessCategory ?? null },
  );
  const joinUrl = `${resolvePublicJoinBase()}/l/${programId}`;
  const suitcaseFilename = `${storeName.replace(/\s+/g, ' ').trim()} Rewards.cb-loyalty`;

  const generatedAssets = {
    programJson: { ...draft, programId, storeId, missionId },
    brandPalette: {
      primary: theme.primaryColor,
      secondary: theme.secondaryColor,
      accent: theme.accentColor,
    },
    qrPngUrl: `https://api.qrserver.com/v1/create-qr-code/?size=512x512&data=${encodeURIComponent(joinUrl)}`,
    cardPreviewUrl: null,
    printablePdfUrl: null,
    phonePreviewUrl: null,
    walletPreviewUrl: null,
  };

  const health = {
    readyToPublish: Boolean(reward && stampThreshold != null && storeId),
    qrGenerated: true,
    brandingApplied: theme.brandingSource === 'store_brand_kit',
    mobileCompatible: true,
    printable: true,
  };

  const publishing = {
    website: { enabled: true, status: 'ready' },
    marketplace: { enabled: true, status: 'ready' },
    pos: { enabled: false, status: 'pending_integration' },
    mobile: { enabled: true, status: 'ready' },
    printable: { enabled: true, status: 'ready' },
    socialQrPoster: { enabled: true, status: 'ready' },
  };

  return {
    id: artifactId,
    type: 'generated_loyalty_program',
    subtype: 'loyalty',
    status: 'awaiting_owner_review',
    missionId,
    storeId: storeId || null,
    storeName,
    title: `${programName}`,
    message: contractInvalid
      ? 'Loyalty draft created, but topology was lost before rendering.'
      : 'Loyalty program ready.',
    payload: {
      store: {
        id: storeId,
        name: storeName,
        tagline: branding?.tagline ?? null,
        category: branding?.businessCategory ?? draft.businessCategory ?? null,
      },
      branding: {
        logoUrl: branding?.logoUrl ?? null,
        heroImageUrl: branding?.heroImageUrl ?? null,
        primaryColor: theme.primaryColor,
        secondaryColor: theme.secondaryColor,
        accentColor: theme.accentColor,
        typography: theme.typography,
        source: theme.brandingSource,
      },
      program: {
        id: programId,
        programName,
        programType: pickString(draft.programType, 'stamp_card'),
        stampThreshold,
        requiredStamps: stampThreshold,
        reward,
        rules,
        rule,
        cardTopology,
        cardFooterText,
        layoutSource: pickString(draft.layoutSource, cardTopology?.source) || null,
        layoutConfidence: Number(draft.layoutConfidence ?? cardTopology?.confidence) || null,
        expiry: draft.expiryNote ?? null,
        memberLimit: null,
      },
      reward,
      stampThreshold,
      programName,
      rules,
      rule,
      cardTopology,
      cardFooterText,
      layoutSource: pickString(draft.layoutSource, cardTopology?.source) || null,
      layoutConfidence: Number(draft.layoutConfidence ?? cardTopology?.confidence) || null,
      qr: {
        url: joinUrl,
        label: 'Scan to Join',
        subtitle: 'Member scans this code to join instantly.',
      },
      theme,
      previews: {
        customerView: { mode: 'digital_card', stampProgress: 0, stampThreshold },
        mobile: { mode: 'phone_shell', aspectRatio: '9:19' },
        wallet: { mode: 'wallet_pass', provider: 'cardbey' },
      },
      publishing,
      health,
      generatedAssets,
      suitcase: {
        path: 'Loyalty Programs',
        filename: suitcaseFilename,
        missionId,
        storeId,
      },
      requiredStamps: stampThreshold,
      rewardRule: rules,
      customerInstructions: draft.customerInstructions ?? null,
      ownerInstructions: draft.ownerInstructions ?? null,
      rolloutSteps: draft.rolloutSteps ?? [],
      loyaltyProgramId: programId,
    },
    data: {
      ...draft,
      artifactId,
      programId,
      loyaltyProgramId: programId,
      storeId,
      missionId,
      theme,
      qr: { url: joinUrl },
      generatedAssets,
    },
    suggestedActions: [
      { action: 'publish_loyalty_program', label: 'Publish Now' },
      { action: 'apply_loyalty_program', label: 'Activate Program' },
      { action: 'setup_loyalty_program', label: 'Edit' },
      { action: 'save_to_suitcase', label: 'Save to Suitcase' },
      { action: 'publish_later', label: 'Publish Later' },
    ],
  };
}
