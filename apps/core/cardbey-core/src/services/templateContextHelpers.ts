/**
 * Template Context Helpers
 * Utilities for building business/store context for template instantiation
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Get business context by storeId
 * storeId maps to Business.id in the schema
 */
export async function getBusinessContext(storeId: string | null): Promise<{
  business: {
    id: string;
    name: string;
    description: string | null;
    logoUrl: string | null;
    address: string | null;
    phone: string | null;
    // Brand fields for template binding (e.g., sourceKey: "business.primaryColor")
    primaryColor: string | null;
    secondaryColor: string | null;
    tagline: string | null;
    heroText: string | null;
    stylePreferences: any | null; // JSON object or null
  } | null;
}> {
  if (!storeId) {
    return { business: null };
  }

  try {
    const business = await prisma.business.findUnique({
      where: { id: storeId },
      select: {
        id: true,
        name: true,
        description: true,
        logo: true,
        address: true,
        phone: true,
        primaryColor: true,
        secondaryColor: true,
        tagline: true,
        heroText: true,
        stylePreferences: true,
      },
    });

    if (!business) {
      return { business: null };
    }

    // Parse logo JSON if present
    let logoUrl: string | null = null;
    if (business.logo) {
      try {
        const logoData = typeof business.logo === 'string' ? JSON.parse(business.logo) : business.logo;
        logoUrl = logoData?.url || null;
      } catch {
        // If logo is not JSON, treat as URL string
        logoUrl = business.logo;
      }
    }

    // Parse stylePreferences JSON if present
    let stylePreferences: any | null = null;
    if (business.stylePreferences) {
      try {
        stylePreferences = typeof business.stylePreferences === 'string' 
          ? JSON.parse(business.stylePreferences) 
          : business.stylePreferences;
      } catch {
        // If parsing fails, use as-is or set to null
        stylePreferences = null;
      }
    }

    return {
      business: {
        id: business.id,
        name: business.name,
        description: business.description,
        logoUrl,
        address: business.address,
        phone: business.phone,
        primaryColor: business.primaryColor || null,
        secondaryColor: business.secondaryColor || null,
        tagline: business.tagline || null,
        heroText: business.heroText || null,
        stylePreferences,
      },
    };
  } catch (error) {
    console.error('[TemplateContext] Failed to get business context:', error);
    return { business: null };
  }
}

/**
 * Get value from object by dot-notation path
 * Example: getByPath({ business: { name: 'Test' } }, 'business.name') => 'Test'
 */
export function getByPath(obj: any, path: string): any {
  if (!obj || !path) return undefined;
  
  const parts = path.split('.');
  let current = obj;
  
  for (const part of parts) {
    if (current == null || typeof current !== 'object') {
      return undefined;
    }
    current = current[part];
  }
  
  return current;
}

/**
 * Build slot values from template slots and business context
 * 
 * @param slots - Array of TemplateSlot definitions
 * @param businessContext - Business context object
 * @returns Record mapping slot.id to resolved value
 */
export function buildSlotValues(
  slots: any[],
  businessContext: { business: any }
): Record<string, any> {
  const slotValues: Record<string, any> = {};

  if (!Array.isArray(slots)) {
    return slotValues;
  }

  for (const slot of slots) {
    if (!slot || typeof slot !== 'object' || !slot.id) {
      continue;
    }

    // Try to resolve from sourceKey first
    if (slot.sourceKey) {
      const value = getByPath(businessContext, slot.sourceKey);
      if (value != null) {
        slotValues[slot.id] = value;
        continue;
      }
    }

    // Fall back to defaultValue
    if (slot.defaultValue !== undefined) {
      slotValues[slot.id] = slot.defaultValue;
    }
  }

  return slotValues;
}

