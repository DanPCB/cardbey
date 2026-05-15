/**
 * MI Video Templates Service
 * Service layer for MI video template operations
 */


import { prisma } from '../lib/prisma.js';

export interface ListMiVideoTemplatesParams {
  occasionType?: string;
  orientation?: string;
  onlyActive?: boolean;
}

/**
 * List MI video templates with optional filters
 */
export async function listMiVideoTemplates(params: ListMiVideoTemplatesParams) {
  const { occasionType, orientation, onlyActive = true } = params;

  const where: any = {};

  if (occasionType) {
    where.occasionType = occasionType;
  }

  if (orientation) {
    where.orientation = orientation;
  }

  if (onlyActive) {
    where.isActive = true;
  }

  return prisma.miVideoTemplate.findMany({
    where,
    orderBy: { createdAt: 'asc' },
  });
}

/**
 * Get MI video template by key
 */
export async function getMiVideoTemplateByKey(key: string) {
  return prisma.miVideoTemplate.findUnique({
    where: { key },
  });
}

