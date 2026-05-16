/**
 * Shared Prisma where clause for store-scoped, non-archived devices (C-Net / signage).
 * Use for signage.list-devices and signage.publish-to-devices pushToAll so queries stay aligned.
 */

export type StoreDevicesStatusFilter = 'online' | 'all';

export function buildStoreDevicesWhere(
  tenantId: string,
  storeId: string,
  status?: StoreDevicesStatusFilter,
) {
  const statusFilter = status === 'online' ? { status: 'online' as const } : {};
  return {
    tenantId,
    storeId,
    // Device.archivedAt is not present in the Prisma schema version in this repo.
    ...statusFilter,
  };
}
