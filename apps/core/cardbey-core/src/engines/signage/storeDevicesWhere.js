/**
 * Shared Prisma where for store-scoped non-archived devices (aligned with list-devices / pushToAll).
 */

export function buildStoreDevicesWhere(tenantId, storeId, status) {
  const statusFilter = status === 'online' ? { status: 'online' } : {};
  return {
    tenantId,
    storeId,
    // Device.archivedAt is not present in the Prisma schema version in this repo.
    ...statusFilter,
  };
}
