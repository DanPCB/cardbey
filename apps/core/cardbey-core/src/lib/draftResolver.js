/**
 * Shared draft-by-store resolver for alias endpoints.
 * Reuses existing DraftStore persistence; no new systems.
 * Status contract: 'generating' | 'ready' | 'not_found' | 'failed'.
 * When storeId is 'temp' and generationRunId is provided but no row exists yet, return status 'generating' so UI keeps polling.
 * @returns {{ draft: object|null, status: 'generating'|'ready'|'not_found'|'failed', store: object, products: array, categories: array, generationRunId: string|null }}
 */
export async function resolveDraftForStore(prisma, storeId, generationRunId = null) {
  const emptyStore = { id: storeId || 'temp', name: 'Untitled Store', type: 'General' };
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
      where: { status: { in: ['draft', 'generating', 'ready', 'error'] } },
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
        store: { id: 'temp', name: 'Untitled Store', type: 'General' },
        products: [],
        categories: [],
        generationRunId: runId,
      };
    }
    const input = typeof d.input === 'string' ? JSON.parse(d.input) : (d.input || {});
    const preview = typeof d.preview === 'string' ? JSON.parse(d.preview) : (d.preview || {});
    const status = d.status === 'generating' ? 'generating' : (d.status === 'ready' || d.status === 'draft' ? 'ready' : d.status === 'error' ? 'failed' : 'not_found');
    const rawProducts = preview.items || preview.products || [];
    const products = rawProducts.map((item) => ({ ...item, description: item?.description ?? null }));
    return {
      draft: d,
      status,
      store: { id: 'temp', name: preview.storeName || preview.meta?.storeName || 'Untitled Store', type: preview.storeType || preview.meta?.storeType || 'General' },
      products,
      categories: preview.categories || [],
      generationRunId: input.generationRunId || runId,
    };
  }

  // Real store id
  let target = await prisma.draftStore.findFirst({
    where: { committedStoreId: storeId, status: { in: ['draft', 'generating', 'ready', 'error'] } },
    orderBy: { updatedAt: 'desc' },
  });
  if (!target) {
    const all = await prisma.draftStore.findMany({
      where: { status: { in: ['draft', 'generating', 'ready', 'error'] } },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
    target = all.find((d) => {
      try {
        const inp = typeof d.input === 'string' ? JSON.parse(d.input) : d.input;
        if (inp?.storeId === storeId) return true;
        const prev = typeof d.preview === 'string' ? JSON.parse(d.preview) : d.preview;
        if (prev?.meta?.storeId === storeId) return true;
        return false;
      } catch (_) { return false; }
    }) || null;
  }
  if (target && runId) {
    const inp = typeof target.input === 'string' ? JSON.parse(target.input) : (target.input || {});
    if (inp.generationRunId !== runId) {
      const match = await prisma.draftStore.findFirst({
        where: { committedStoreId: storeId, status: { in: ['draft', 'generating', 'ready', 'error'] } },
        orderBy: { updatedAt: 'desc' },
      });
      if (match) {
        const mi = typeof match.input === 'string' ? JSON.parse(match.input) : (match.input || {});
        if (mi.generationRunId === runId) target = match;
        else target = null;
      } else target = null;
    }
  }
  if (!target) return { ...notFound, store: { id: storeId, name: 'Untitled Store', type: 'General' } };
  const input = typeof target.input === 'string' ? JSON.parse(target.input) : (target.input || {});
  const preview = typeof target.preview === 'string' ? JSON.parse(target.preview) : (target.preview || {});
  const status = target.status === 'generating' ? 'generating' : (target.status === 'ready' || target.status === 'draft' ? 'ready' : target.status === 'error' ? 'failed' : 'not_found');
  const rawProducts = preview.items || preview.products || [];
  const products = rawProducts.map((item) => ({ ...item, description: item?.description ?? null }));
  return {
    draft: target,
    status,
    store: { id: storeId, name: preview.storeName || preview.meta?.storeName || 'Untitled Store', type: preview.storeType || preview.meta?.storeType || 'General' },
    products,
    categories: preview.categories || [],
    generationRunId: input.generationRunId || runId,
  };
}
