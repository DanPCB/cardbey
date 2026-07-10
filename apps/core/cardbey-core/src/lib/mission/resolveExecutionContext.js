/**
 * ResolveExecutionContext — canonical pre-compile store / business space resolution.
 * Reusable across loyalty, campaigns, offers, and other store-scoped missions.
 */

import {
  fetchUserStoresForDisambiguation,
  validateUserStoreId,
} from '../intake/resolveStoreAmbiguity.js';
import { matchStoreCandidateByReply } from '../intake/storeSelectionReplay.js';

function pickString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function formatStoreLocation(store) {
  const parts = [store?.suburb, store?.city, store?.state, store?.region, store?.country]
    .map((p) => (typeof p === 'string' ? p.trim() : ''))
    .filter(Boolean);
  if (parts.length) return [...new Set(parts)].slice(0, 2).join(', ');
  if (typeof store?.formattedAddress === 'string' && store.formattedAddress.trim()) {
    return store.formattedAddress.trim();
  }
  if (typeof store?.address === 'string' && store.address.trim()) return store.address.trim();
  return null;
}

/**
 * @param {Record<string, unknown>} store
 */
export function buildStoreCandidateCard(store) {
  const id = pickString(store?.id);
  const name = pickString(store?.name) || 'Store';
  return {
    id,
    storeId: id,
    spaceId: id,
    name,
    category: pickString(store?.type, store?.category) || null,
    location: formatStoreLocation(store),
    logoUrl: pickString(store?.logoUrl, store?.avatarImageUrl) || null,
    avatarImageUrl: pickString(store?.avatarImageUrl) || null,
    primaryColor: pickString(store?.primaryColor) || null,
    secondaryColor: pickString(store?.secondaryColor) || null,
    tagline: pickString(store?.tagline) || null,
    slug: pickString(store?.slug) || null,
    isCurrent: store?.isCurrent === true,
  };
}

/**
 * @param {Record<string, unknown>} store
 */
export function buildBrandThemeFromStore(store) {
  const primary = pickString(store?.primaryColor) || '#1F2937';
  const secondary = pickString(store?.secondaryColor) || '#F3F4F6';
  return {
    primaryColor: primary,
    secondaryColor: secondary,
    accentColor: primary,
    logoUrl: pickString(store?.logoUrl, store?.avatarImageUrl) || null,
    typography: 'system-ui, -apple-system, "Segoe UI", sans-serif',
  };
}

/**
 * @param {Record<string, unknown>} store
 * @param {Record<string, unknown>} [opts]
 */
export function buildResolvedExecutionContext(store, opts = {}) {
  const storeId = pickString(store?.id, store?.storeId);
  const card = buildStoreCandidateCard({ ...store, isCurrent: opts.isCurrent === true });
  const brandTheme = buildBrandThemeFromStore(card);
  return {
    storeId,
    spaceId: storeId,
    selectedStore: card,
    selectedSpace: { id: storeId, type: 'business', name: card.name },
    brandTheme,
    businessType: card.category,
    location: card.location,
    currency: pickString(opts.currency, store?.currency) || 'AUD',
    timezone: pickString(opts.timezone, store?.timezone) || 'Australia/Melbourne',
    storeLocked: true,
    selectionMethod: pickString(opts.selectionMethod) || 'automatic',
    selectionReason: pickString(opts.selectionReason) || null,
    resolvedAt: new Date().toISOString(),
  };
}

/**
 * @param {{
 *   stores: Array<Record<string, unknown>>;
 *   lockedTool: string;
 *   userMessage?: string;
 *   lockedParams?: Record<string, unknown>;
 *   activeStore?: Record<string, unknown> | null;
 *   clarifyType: 'active_space_confirm' | 'execution_context_store_picker';
 * }} args
 */
export function buildExecutionContextClarifyPayload(args) {
  const lockedTool = pickString(args.lockedTool) || 'setup_loyalty_program';
  const lockedParams =
    args.lockedParams && typeof args.lockedParams === 'object' && !Array.isArray(args.lockedParams)
      ? args.lockedParams
      : {};
  const stores = (args.stores ?? []).map((s) => buildStoreCandidateCard(s));
  const activeStore = args.activeStore ? buildStoreCandidateCard(args.activeStore) : null;
  const isConfirm = args.clarifyType === 'active_space_confirm' && activeStore;

  const question = isConfirm
    ? `Create this loyalty program for ${activeStore.name}?`
    : 'Which business should I create this loyalty program for?';

  const options = stores.map((s) => ({
    label: s.name,
    tool: lockedTool,
    parameters: {
      ...lockedParams,
      storeId: s.id,
      activeStoreId: s.id,
      selectionMethod: 'manual',
    },
    logoUrl: s.logoUrl,
    hint: s.category,
    storeCandidate: s,
  }));

  if (isConfirm) {
    options.unshift({
      label: `Yes — ${activeStore.name}`,
      tool: lockedTool,
      parameters: {
        ...lockedParams,
        storeId: activeStore.id,
        activeStoreId: activeStore.id,
        selectionMethod: 'active-space',
        confirmedActiveSpace: true,
      },
      logoUrl: activeStore.logoUrl,
      hint: activeStore.category,
      storeCandidate: activeStore,
    });
  }

  return {
    ok: true,
    success: true,
    action: 'clarify_store',
    lockedTool,
    missingContext: ['store'],
    clarifyType: isConfirm ? 'active_space_confirm' : 'execution_context_store_picker',
    response: question,
    message: question,
    options,
    storeCandidates: stores,
    activeStoreCandidate: activeStore,
    brandPreview: activeStore ? buildBrandThemeFromStore(activeStore) : null,
    executionContextResolution: {
      stage: 'resolve_execution_context',
      status: 'pending',
      selectionMethod: null,
      storeLocked: false,
    },
    pendingIntent: {
      userMessage: pickString(args.userMessage) || '',
      originalTool: lockedTool,
      tool: lockedTool,
      lockedTool,
      lockedIntent: lockedTool,
      clarifyType: isConfirm ? 'active_space_confirm' : 'execution_context_store_picker',
      storeCandidates: stores,
      activeStoreCandidate: activeStore,
    },
    executionPath: 'resolve_execution_context',
    pathId: 'resolve_execution_context',
  };
}

/**
 * @param {{
 *   userId?: string | null;
 *   hintedStoreId?: string | null;
 *   paramsStoreId?: string | null;
 *   confirmedActiveSpace?: boolean;
 *   selectionMethod?: string | null;
 *   intentText?: string | null;
 *   userMessage?: string | null;
 *   lockedTool?: string | null;
 *   lockedParams?: Record<string, unknown>;
 * }} args
 */
export async function resolveExecutionContext(args) {
  const userId = pickString(args.userId);
  const lockedTool = pickString(args.lockedTool) || 'setup_loyalty_program';
  const lockedParams =
    args.lockedParams && typeof args.lockedParams === 'object' && !Array.isArray(args.lockedParams)
      ? args.lockedParams
      : {};
  const intentText = pickString(args.intentText, args.userMessage) || '';
  const storesRaw = userId ? await fetchUserStoresForDisambiguation(userId) : [];

  if (!userId) {
    return { resolved: false, kind: 'auth_required' };
  }

  if (storesRaw.length === 0) {
    return { resolved: false, kind: 'no_stores' };
  }

  const stores = storesRaw.map((s) => buildStoreCandidateCard(s));

  const explicitStoreId = pickString(args.paramsStoreId);
  if (explicitStoreId && (await validateUserStoreId(userId, explicitStoreId))) {
    const store = stores.find((s) => s.id === explicitStoreId) ?? { id: explicitStoreId, name: 'Store' };
    return {
      resolved: true,
      kind: 'explicit_params',
      executionContext: buildResolvedExecutionContext(store, {
        selectionMethod: pickString(args.selectionMethod) || 'explicit_prompt',
        selectionReason: 'Store id provided in intent parameters.',
      }),
    };
  }

  const nameMatch = matchStoreCandidateByReply(
    intentText,
    stores.map((s) => ({ id: s.id, label: s.name, value: s.id })),
  );
  if (nameMatch && (await validateUserStoreId(userId, nameMatch.id))) {
    const store = stores.find((s) => s.id === nameMatch.id) ?? nameMatch;
    return {
      resolved: true,
      kind: 'explicit_prompt',
      executionContext: buildResolvedExecutionContext(store, {
        selectionMethod: 'explicit_prompt',
        selectionReason: `Matched store name "${nameMatch.name}" from your message.`,
      }),
    };
  }

  if (stores.length === 1) {
    return {
      resolved: true,
      kind: 'automatic',
      executionContext: buildResolvedExecutionContext(stores[0], {
        selectionMethod: 'automatic',
        selectionReason: 'You own one active store.',
      }),
    };
  }

  const hintedStoreId = pickString(args.hintedStoreId);
  const confirmedActiveSpace = args.confirmedActiveSpace === true;
  const selectionMethod = pickString(args.selectionMethod);

  if (
    hintedStoreId &&
    (await validateUserStoreId(userId, hintedStoreId)) &&
    (confirmedActiveSpace || selectionMethod === 'active-space' || selectionMethod === 'manual')
  ) {
    const store = stores.find((s) => s.id === hintedStoreId) ?? { id: hintedStoreId, name: 'Store' };
    return {
      resolved: true,
      kind: selectionMethod === 'manual' ? 'manual' : 'active_space',
      executionContext: buildResolvedExecutionContext(
        { ...store, isCurrent: selectionMethod === 'active-space' },
        {
          selectionMethod: selectionMethod === 'manual' ? 'manual' : 'active-space',
          selectionReason:
            selectionMethod === 'manual'
              ? 'You selected this business.'
              : 'You confirmed your current business space.',
          isCurrent: selectionMethod === 'active-space',
        },
      ),
    };
  }

  if (hintedStoreId && (await validateUserStoreId(userId, hintedStoreId))) {
    const activeStore = stores.find((s) => s.id === hintedStoreId) ?? {
      id: hintedStoreId,
      name: 'Your store',
    };
    return {
      resolved: false,
      kind: 'confirm_active_space',
      clarify: buildExecutionContextClarifyPayload({
        stores: stores.map((s) => ({ ...s, isCurrent: s.id === hintedStoreId })),
        activeStore: { ...activeStore, isCurrent: true },
        lockedTool,
        lockedParams,
        userMessage: intentText,
        clarifyType: 'active_space_confirm',
      }),
    };
  }

  return {
    resolved: false,
    kind: 'multi_store_picker',
    clarify: buildExecutionContextClarifyPayload({
      stores,
      lockedTool,
      lockedParams,
      userMessage: intentText,
      clarifyType: 'execution_context_store_picker',
    }),
  };
}
