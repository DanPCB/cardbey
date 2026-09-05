import {
  resolveDraftBusinessName,
  resolveDraftBusinessType,
  resolveDraftLocation,
} from '../services/draftStore/draftStoreService.js';

function parseDraftJsonField(raw) {
  if (raw == null) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const o = JSON.parse(raw);
      return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
    } catch {
      return {};
    }
  }
  return {};
}

function storeObjectFromDraft(storeId, preview, input, draft) {
  const name = resolveDraftBusinessName(draft, preview, input);
  const type = resolveDraftBusinessType(draft, preview, input) || 'General';
  const location = resolveDraftLocation(draft, preview, input);
  return {
    id: storeId || 'temp',
    ...(name ? { name } : {}),
    type,
    ...(location ? { location } : {}),
  };
}

/**
 * Shared draft-by-store resolver for alias endpoints.
 * Reuses existing DraftStore persistence; no new systems.
 * Status contract: 'generating' | 'ready' | 'committed' | 'not_found' | 'failed'.
 * When storeId is 'temp' and generationRunId is provided but no row exists yet, return status 'generating' so UI keeps polling.
 * @returns {{ draft: object|null, status: 'generating'|'ready'|'committed'|'not_found'|'failed', store: object, products: array, categories: array, generationRunId: string|null }}
 */
export async function resolveDraftForStore(prisma, storeId, generationRunId = null) {
  const emptyStore = { id: storeId || 'temp', type: 'General' };
  const notFound = {
    draft: null,
    status: 'not_found',
    store: emptyStore,
    products: [],
    categories: [],
    generationRunId: generationRunId || null,
  };

  if (!storeId || typeof storeId !== 'string') {
    return notFound;
  }

  const runId = (typeof generationRunId === 'string' && generationRunId) ? generationRunId : null;

  if (storeId === 'temp') {
    if (!runId) return notFound;
    const drafts = await prisma.draftStore.findMany({
      where: { status: { in: ['draft', 'generating', 'ready', 'committed', 'error'] } },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });
    const d = drafts.find((x) => {
      try {
        const inp = typeof x.input === 'string' ? JSON.parse(x.input) : (x.input || {});
        if (inp.generationRunId === runId) return true;
        const prev = typeof x.preview === 'string' ? JSON.parse(x.preview) : (x.preview || {});
        if (prev?.meta?.generationRunId === runId) return true;
        return false;
      } catch (_) { return false; }
    });
    // No row yet but we have generationRunId → return 'generating' so UI keeps polling (don't return not_found)
    if (!d) {
      return {
        draft: null,
        status: 'generating',
        store: { id: 'temp', type: 'General' },
        products: [],
        categories: [],
        generationRunId: runId,
      };
    }
    const input = parseDraftJsonField(d.input);
    const preview = parseDraftJsonField(d.preview);
    const status = d.status === 'generating' ? 'generating' : (d.status === 'ready' || d.status === 'draft' ? 'ready' : d.status === 'error' ? 'failed' : 'not_found');
    const rawProducts = preview.items || preview.products || [];
    const products = rawProducts.map((item) => ({ ...item, description: item?.description ?? null }));
    return {
      draft: d,
      status,
      store: storeObjectFromDraft('temp', preview, input, d),
      products,
      categories: preview.categories || [],
      generationRunId: input.generationRunId || runId,
    };
  }

  // Real store id — prefer editable revisions over committed snapshots.
  // create-from-store / website-edit must not treat a published snapshot as "ready".
  const EDITABLE_STATUSES = ['draft', 'generating', 'ready'];
  const ALL_STATUSES = ['draft', 'generating', 'ready', 'committed', 'error'];

  const linksStore = (d) => {
    try {
      const inp = typeof d.input === 'string' ? JSON.parse(d.input) : d.input;
      if (inp?.storeId === storeId) return true;
      const prev = typeof d.preview === 'string' ? JSON.parse(d.preview) : d.preview;
      if (prev?.meta?.storeId === storeId) return true;
      return false;
    } catch (_) {
      return false;
    }
  };

  let target = await prisma.draftStore.findFirst({
    where: { committedStoreId: storeId, status: { in: EDITABLE_STATUSES } },
    orderBy: { updatedAt: 'desc' },
  });
  if (!target) {
    const editable = await prisma.draftStore.findMany({
      where: { status: { in: EDITABLE_STATUSES } },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
    target = editable.find(linksStore) || null;
  }
  if (!target) {
    target = await prisma.draftStore.findFirst({
      where: { committedStoreId: storeId, status: 'committed' },
      orderBy: { updatedAt: 'desc' },
    });
  }
  if (!target) {
    const fallback = await prisma.draftStore.findMany({
      where: { status: { in: ALL_STATUSES } },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
    target = fallback.find(linksStore) || null;
  }
  if (target && runId) {
    const inp = typeof target.input === 'string' ? JSON.parse(target.input) : (target.input || {});
    if (inp.generationRunId !== runId) {
      const match = await prisma.draftStore.findFirst({
        where: { committedStoreId: storeId, status: { in: ALL_STATUSES } },
        orderBy: { updatedAt: 'desc' },
      });
      if (match) {
        const mi = typeof match.input === 'string' ? JSON.parse(match.input) : (match.input || {});
        if (mi.generationRunId === runId) target = match;
        else target = null;
      } else target = null;
    }
  }
  if (!target) return { ...notFound, store: { id: storeId, type: 'General' } };
  const input = parseDraftJsonField(target.input);
  const preview = parseDraftJsonField(target.preview);
  const status =
    target.status === 'generating'
      ? 'generating'
      : target.status === 'ready' || target.status === 'draft'
        ? 'ready'
        : target.status === 'committed'
          ? 'committed'
          : target.status === 'error'
            ? 'failed'
            : 'not_found';
  const rawProducts = preview.items || preview.products || [];
  const products = rawProducts.map((item) => ({ ...item, description: item?.description ?? null }));
  return {
    draft: target,
    status,
    store: storeObjectFromDraft(storeId, preview, input, target),
    products,
    categories: preview.categories || [],
    generationRunId: input.generationRunId || runId,
  };
}
