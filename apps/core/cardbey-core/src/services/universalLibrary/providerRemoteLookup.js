/**
 * Dedupe helper: provider + providerRemoteId (metadata).
 */

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} provider
 * @param {string} remoteId
 */
export async function findAssetByProviderRemoteId(prisma, provider, remoteId) {
  const id = String(remoteId || '').trim();
  if (!id) return null;
  const p = String(provider || '').trim();
  if (!p) return null;

  // Prefer JSON path when the driver supports it; fall back to scan.
  try {
    const hit = await prisma.universalAsset.findFirst({
      where: {
        provider: p,
        metadata: { path: ['providerRemoteId'], equals: id },
      },
    });
    if (hit) return hit;
  } catch {
    /* sqlite / older clients */
  }

  const rows = await prisma.universalAsset.findMany({
    where: { provider: p },
    take: 4000,
    select: { id: true, metadata: true, sourceUrl: true, status: true },
  });
  return (
    rows.find((a) => {
      const m = a.metadata && typeof a.metadata === 'object' ? a.metadata : {};
      return String(m.providerRemoteId || m.remoteId || '') === id;
    }) || null
  );
}
