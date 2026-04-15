/**
 * MI (Merged Intelligence) Service
 * Manages MIEntity registration, updates, and queries
 */

import { PrismaClient } from '@prisma/client';
import type { MIEntity as MIType, MIBrain } from '../mi/miTypes.js';

const prisma = new PrismaClient();

export interface MIRegisterInput {
  productId: string;
  productType: MIType['productType'];
  mediaType: MIType['format']['mediaType'];
  fileUrl: string;
  previewUrl?: string;
  dimensions?: string;
  orientation?: 'vertical' | 'horizontal' | 'square' | 'flat';
  durationSec?: number;
  createdByUserId: string;
  createdByEngine?: string;
  sourceProjectId?: string;
  tenantId?: string;
  storeId?: string;
  campaignId?: string;
  miBrain: MIBrain;
  status?: 'active' | 'paused' | 'expired' | 'draft';
  validFrom?: string; // ISO timestamp
  validTo?: string; // ISO timestamp
  // Links - only one should be provided
  links?: {
    creativeAssetId?: string;
    reportId?: string;
    screenItemId?: string;
    packagingId?: string;
    templateId?: string;
  };
}

export interface MIQueryFilters {
  tenantId?: string;
  storeId?: string;
  campaignId?: string;
  productType?: MIType['productType'];
  role?: MIBrain['role'];
  status?: 'active' | 'paused' | 'expired' | 'draft';
  creativeAssetId?: string;
  reportId?: string;
  screenItemId?: string;
  templateId?: string;
}

/**
 * Register or update an MIEntity
 * If a link is provided and an MIEntity already exists for that link, update it.
 * Otherwise create a new MIEntity.
 */
export async function registerOrUpdateEntity(input: MIRegisterInput) {
  const {
    productId,
    productType,
    mediaType,
    fileUrl,
    previewUrl,
    dimensions,
    orientation,
    durationSec,
    createdByUserId,
    createdByEngine = 'creative_engine_v3',
    sourceProjectId,
    tenantId,
    storeId,
    campaignId,
    miBrain,
    status = 'active',
    validFrom,
    validTo,
    links,
  } = input;

  // Check if an entity already exists for the provided link
  let existingEntity = null;
  if (links?.creativeAssetId) {
    existingEntity = await prisma.mIEntity.findUnique({
      where: { creativeAssetId: links.creativeAssetId },
    });
  } else if (links?.reportId) {
    existingEntity = await prisma.mIEntity.findUnique({
      where: { reportId: links.reportId },
    });
  } else if (links?.screenItemId) {
    existingEntity = await prisma.mIEntity.findUnique({
      where: { screenItemId: links.screenItemId },
    });
  } else if (links?.templateId) {
    existingEntity = await prisma.mIEntity.findUnique({
      where: { templateId: links.templateId },
    });
  }

  const data = {
    productId,
    productType,
    mediaType,
    fileUrl,
    previewUrl: previewUrl || null,
    dimensions: dimensions || null,
    orientation: orientation || null,
    durationSec: durationSec || null,
    createdByUserId,
    createdByEngine,
    sourceProjectId: sourceProjectId || null,
    tenantId: tenantId || null,
    storeId: storeId || null,
    campaignId: campaignId || null,
    creativeAssetId: links?.creativeAssetId || null,
    reportId: links?.reportId || null,
    screenItemId: links?.screenItemId || null,
    packagingId: links?.packagingId || null,
    templateId: links?.templateId || null,
    miBrain: miBrain as any, // Prisma Json type
    status,
    validFrom: validFrom ? new Date(validFrom) : null,
    validTo: validTo ? new Date(validTo) : null,
  };

  if (existingEntity) {
    // Update existing entity
    const updated = await prisma.mIEntity.update({
      where: { id: existingEntity.id },
      data,
    });
    return updated;
  } else {
    // Create new entity
    const created = await prisma.mIEntity.create({
      data,
    });
    return created;
  }
}

/**
 * Get MIEntity by ID
 */
export async function getEntityById(id: string) {
  return await prisma.mIEntity.findUnique({
    where: { id },
  });
}

/**
 * Get MIEntity by productId
 */
export async function getEntityByProductId(productId: string) {
  return await prisma.mIEntity.findFirst({
    where: { productId },
  });
}

/**
 * Get MIEntity by linked asset
 */
export async function getEntityByLink(filters: {
  creativeAssetId?: string;
  reportId?: string;
  screenItemId?: string;
  templateId?: string;
}) {
  if (filters.creativeAssetId) {
    return await prisma.mIEntity.findUnique({
      where: { creativeAssetId: filters.creativeAssetId },
    });
  }
  if (filters.reportId) {
    return await prisma.mIEntity.findUnique({
      where: { reportId: filters.reportId },
    });
  }
  if (filters.screenItemId) {
    return await prisma.mIEntity.findUnique({
      where: { screenItemId: filters.screenItemId },
    });
  }
  if (filters.templateId) {
    return await prisma.mIEntity.findUnique({
      where: { templateId: filters.templateId },
    });
  }
  return null;
}

/**
 * Query MIEntities by context filters
 */
export async function getEntitiesByContext(filters: MIQueryFilters) {
  const where: any = {};

  if (filters.tenantId) where.tenantId = filters.tenantId;
  if (filters.storeId) where.storeId = filters.storeId;
  if (filters.campaignId) where.campaignId = filters.campaignId;
  if (filters.productType) where.productType = filters.productType;
  if (filters.status) where.status = filters.status;
  if (filters.creativeAssetId) where.creativeAssetId = filters.creativeAssetId;
  if (filters.reportId) where.reportId = filters.reportId;
  if (filters.screenItemId) where.screenItemId = filters.screenItemId;
  if (filters.templateId) where.templateId = filters.templateId;
  if (filters.templateId) where.templateId = filters.templateId;

  // Role filter requires checking the miBrain JSON field
  // For now, we'll fetch and filter in memory (can be optimized with raw SQL if needed)
  let entities = await prisma.mIEntity.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  });

  // Filter by role if provided
  if (filters.role) {
    entities = entities.filter((entity) => {
      const brain = entity.miBrain as any;
      return brain?.role === filters.role;
    });
  }

  return entities;
}

/**
 * Delete MIEntity by ID
 */
export async function deleteEntity(id: string) {
  return await prisma.mIEntity.delete({
    where: { id },
  });
}
