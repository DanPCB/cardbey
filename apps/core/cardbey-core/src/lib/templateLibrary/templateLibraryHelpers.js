/**
 * Template Library — JSON parse helpers and actor resolution.
 */

import { prisma } from '../prisma.js';

export function parseJsonArray(value, fallback = []) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return fallback;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export async function resolveTemplateActor(req) {
  const userId = req.userId || req.user?.id || '';
  const role = req.user?.role || null;
  const storeIds = [];
  if (req.user?.business?.id) storeIds.push(String(req.user.business.id));
  if (req.query?.storeId) storeIds.push(String(req.query.storeId));
  if (req.body?.storeId) storeIds.push(String(req.body.storeId));
  return { userId, role, storeIds: [...new Set(storeIds.filter(Boolean))] };
}

export function mapLibraryRecord(lib) {
  if (!lib) return null;
  return {
    ...lib,
    tags: parseJsonArray(lib.tags),
  };
}

export function mapTemplateRecord(tpl, library = null) {
  if (!tpl) return null;
  return {
    ...tpl,
    tags: parseJsonArray(tpl.tags),
    previewUrls: parseJsonArray(tpl.previewUrls),
    supportedChannels: parseJsonArray(tpl.supportedChannels),
    supportedLocales: parseJsonArray(tpl.supportedLocales),
    libraryOwnerType: library?.ownerType ?? tpl.library?.ownerType,
    libraryOwnerId: library?.ownerId ?? tpl.library?.ownerId,
    isOfficial: (library?.ownerType ?? tpl.library?.ownerType) === 'PLATFORM',
  };
}

export function mapVersionRecord(version) {
  if (!version) return null;
  return {
    ...version,
    supportedVariants: parseJsonArray(version.supportedVariants),
  };
}

export function mapInstanceRecord(instance) {
  if (!instance) return null;
  return instance;
}

export async function loadStoreBindingContext(storeId) {
  if (!storeId) return {};
  const business = await prisma.business.findUnique({
    where: { id: storeId },
    select: {
      id: true,
      name: true,
      description: true,
      phone: true,
      address: true,
      website: true,
      heroImageUrl: true,
      avatarImageUrl: true,
      primaryColor: true,
      secondaryColor: true,
      tagline: true,
    },
  });
  if (!business) return {};
  return {
    store: {
      name: business.name,
      description: business.description,
      phone: business.phone,
      address: business.address,
      website: business.website,
      logoUrl: business.avatarImageUrl,
      heroImageUrl: business.heroImageUrl,
      primaryColor: business.primaryColor,
      secondaryColor: business.secondaryColor,
      tagline: business.tagline,
    },
  };
}
