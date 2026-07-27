/**
 * Persisted public content interaction metrics (feed cards, storefront show items, etc.).
 */

const ALLOWED_TYPES = new Set([
  'feed_artifact',
  'show_item',
  'product',
  'service',
  'campaign',
  'store',
]);

function normalizeType(raw) {
  const t = String(raw ?? '').trim().toLowerCase();
  return ALLOWED_TYPES.has(t) ? t : null;
}

function normalizeId(raw) {
  const id = String(raw ?? '').trim();
  return id.length > 0 && id.length <= 256 ? id : null;
}

function normalizeViewerKey(raw) {
  const key = String(raw ?? '').trim();
  if (!key || key.length > 128) return 'anonymous';
  return key;
}

function toSummary(metrics, viewer) {
  return {
    contentId: metrics.contentId,
    contentType: metrics.contentType,
    storeId: metrics.storeId ?? null,
    artifactId: metrics.artifactId ?? null,
    viewsCount: metrics.viewsCount,
    lovesCount: metrics.lovesCount,
    clapsCount: metrics.clapsCount,
    commentsCount: metrics.commentsCount,
    sharesCount: metrics.sharesCount,
    bookingsCount: metrics.bookingsCount,
    viewerState: {
      loved: Boolean(viewer?.loved),
      clapped: Boolean(viewer && viewer.clapAdds > 0),
      shared: Boolean(viewer?.shared),
    },
  };
}

async function getOrCreateMetrics(prisma, contentType, contentId, meta = {}) {
  const existing = await prisma.contentInteractionMetrics.findUnique({
    where: {
      contentType_contentId: { contentType, contentId },
    },
  });
  if (existing) return existing;
  return prisma.contentInteractionMetrics.create({
    data: {
      contentType,
      contentId,
      storeId: meta.storeId ? String(meta.storeId) : null,
      artifactId: meta.artifactId ? String(meta.artifactId) : null,
    },
  });
}

async function getViewerState(prisma, metricsId, viewerKey) {
  return prisma.contentInteractionViewerState.findUnique({
    where: {
      metricsId_viewerKey: { metricsId, viewerKey },
    },
  });
}

async function ensureViewerState(prisma, metricsId, viewerKey) {
  const existing = await getViewerState(prisma, metricsId, viewerKey);
  if (existing) return existing;
  return prisma.contentInteractionViewerState.create({
    data: { metricsId, viewerKey },
  });
}

export async function getContentInteractionSummary(prisma, input) {
  const contentType = normalizeType(input.contentType);
  const contentId = normalizeId(input.contentId);
  const viewerKey = normalizeViewerKey(input.viewerKey);
  if (!contentType || !contentId) {
    return null;
  }

  const metrics = await prisma.contentInteractionMetrics.findUnique({
    where: { contentType_contentId: { contentType, contentId } },
  });
  if (!metrics) {
    return {
      contentId,
      contentType,
      storeId: input.storeId ?? null,
      artifactId: input.artifactId ?? null,
      viewsCount: 0,
      lovesCount: 0,
      clapsCount: 0,
      commentsCount: 0,
      sharesCount: 0,
      bookingsCount: 0,
      viewerState: { loved: false, clapped: false, shared: false },
    };
  }

  const viewer = await getViewerState(prisma, metrics.id, viewerKey);
  return toSummary(metrics, viewer);
}

export async function recordContentView(prisma, input) {
  const contentType = normalizeType(input.contentType);
  const contentId = normalizeId(input.contentId);
  const viewerKey = normalizeViewerKey(input.viewerKey);
  if (!contentType || !contentId) return null;

  const metrics = await getOrCreateMetrics(prisma, contentType, contentId, input);
  const viewer = await ensureViewerState(prisma, metrics.id, viewerKey);
  if (viewer.viewed) {
    const fresh = await prisma.contentInteractionMetrics.findUnique({ where: { id: metrics.id } });
    return toSummary(fresh, viewer);
  }

  const [nextMetrics, nextViewer] = await prisma.$transaction([
    prisma.contentInteractionMetrics.update({
      where: { id: metrics.id },
      data: { viewsCount: { increment: 1 } },
    }),
    prisma.contentInteractionViewerState.update({
      where: { id: viewer.id },
      data: { viewed: true },
    }),
  ]);

  void import('./storeEngagement/storeEngagementBridge.js').then(({ bridgeContentInteractionToStoreEngagement }) =>
    bridgeContentInteractionToStoreEngagement(prisma, {
      contentType,
      contentId,
      storeId: input.storeId ?? metrics.storeId,
      viewerKey,
      action: 'view',
      source: input.source ?? 'content_interaction',
    }),
  );

  return toSummary(nextMetrics, nextViewer);
}

export async function toggleContentLove(prisma, input) {
  const contentType = normalizeType(input.contentType);
  const contentId = normalizeId(input.contentId);
  const viewerKey = normalizeViewerKey(input.viewerKey);
  if (!contentType || !contentId) return null;

  const metrics = await getOrCreateMetrics(prisma, contentType, contentId, input);
  const viewer = await ensureViewerState(prisma, metrics.id, viewerKey);
  const nextLoved = !viewer.loved;
  const loveDelta = nextLoved ? 1 : -1;

  const [nextMetrics, nextViewer] = await prisma.$transaction([
    prisma.contentInteractionMetrics.update({
      where: { id: metrics.id },
      data: { lovesCount: { increment: loveDelta } },
    }),
    prisma.contentInteractionViewerState.update({
      where: { id: viewer.id },
      data: { loved: nextLoved },
    }),
  ]);

  return toSummary(
    {
      ...nextMetrics,
      lovesCount: Math.max(0, nextMetrics.lovesCount),
    },
    nextViewer,
  );
}

export async function addContentClap(prisma, input) {
  const contentType = normalizeType(input.contentType);
  const contentId = normalizeId(input.contentId);
  const viewerKey = normalizeViewerKey(input.viewerKey);
  if (!contentType || !contentId) return null;

  const metrics = await getOrCreateMetrics(prisma, contentType, contentId, input);
  const viewer = await ensureViewerState(prisma, metrics.id, viewerKey);

  const [nextMetrics, nextViewer] = await prisma.$transaction([
    prisma.contentInteractionMetrics.update({
      where: { id: metrics.id },
      data: { clapsCount: { increment: 1 } },
    }),
    prisma.contentInteractionViewerState.update({
      where: { id: viewer.id },
      data: { clapAdds: { increment: 1 } },
    }),
  ]);

  return toSummary(nextMetrics, nextViewer);
}

export async function recordContentShare(prisma, input) {
  const contentType = normalizeType(input.contentType);
  const contentId = normalizeId(input.contentId);
  const viewerKey = normalizeViewerKey(input.viewerKey);
  if (!contentType || !contentId) return null;

  const metrics = await getOrCreateMetrics(prisma, contentType, contentId, input);
  const viewer = await ensureViewerState(prisma, metrics.id, viewerKey);
  if (viewer.shared) {
    const fresh = await prisma.contentInteractionMetrics.findUnique({ where: { id: metrics.id } });
    return toSummary(fresh, viewer);
  }

  const [nextMetrics, nextViewer] = await prisma.$transaction([
    prisma.contentInteractionMetrics.update({
      where: { id: metrics.id },
      data: { sharesCount: { increment: 1 } },
    }),
    prisma.contentInteractionViewerState.update({
      where: { id: viewer.id },
      data: { shared: true },
    }),
  ]);

  return toSummary(nextMetrics, nextViewer);
}
