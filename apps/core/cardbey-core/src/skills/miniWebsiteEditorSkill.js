/**
 * miniWebsiteEditorSkill — reads and patches mini website sections for a store.
 * Used by edit_website mission tasks; logic is shared with miniWebsiteSectionMerge + executors.
 */

import { getPrismaClient } from '../lib/prisma.js';
import { computeStylePreferencesUpdate, getMiniWebsiteSnapshot, mergeSectionPatches } from '../lib/miniWebsiteSectionMerge.js';

export const miniWebsiteEditorSkill = {
  name: 'miniWebsiteEditor',
  description: 'Read and patch the mini website sections of a published store',

  tools: {
    /**
     * Get current website sections for a store.
     * @param {{ storeId: string }} args
     */
    getCurrentSections: async ({ storeId }) => {
      const prisma = getPrismaClient();
      const id = typeof storeId === 'string' ? storeId.trim() : String(storeId || '').trim();
      if (!id) throw new Error('storeId required');
      const business = await prisma.business.findUnique({
        where: { id },
        select: { stylePreferences: true, name: true, slug: true },
      });
      if (!business) throw new Error('Store not found');
      const { sections, theme } = getMiniWebsiteSnapshot(business.stylePreferences);
      return {
        storeName: business.name,
        slug: business.slug,
        sections,
        theme,
        hasMiniWebsite: Boolean(sections?.length),
      };
    },

    /**
     * Patch specific sections by type (merge content). Pass replaceAll + full sections array to replace.
     * @param {{ storeId: string, patch: unknown, theme?: unknown, replaceAll?: boolean, prisma?: object }} args
     */
    patchSections: async ({ storeId, patch, theme = null, replaceAll = false }) => {
      const prisma = getPrismaClient();
      const id = typeof storeId === 'string' ? storeId.trim() : String(storeId || '').trim();
      if (!id) throw new Error('storeId required');

      const business = await prisma.business.findUnique({
        where: { id },
        select: { stylePreferences: true },
      });
      if (!business) throw new Error('Store not found');

      const existing = business.stylePreferences && typeof business.stylePreferences === 'object' ? business.stylePreferences : {};
      const { sections: prevSections, theme: prevTheme, miniBase } = getMiniWebsiteSnapshot(existing);

      let updatedSections;
      if (replaceAll && Array.isArray(patch)) {
        updatedSections = patch.map((s) => (s && typeof s === 'object' ? { ...s } : s));
      } else if (Array.isArray(patch)) {
        updatedSections = mergeSectionPatches(prevSections, patch);
      } else {
        updatedSections = prevSections;
      }

      const themeNext = theme !== null && theme !== undefined ? theme : prevTheme;
      const updatedMini = {
        ...miniBase,
        sections: updatedSections,
        theme: themeNext,
        updatedAt: new Date().toISOString(),
      };

      await prisma.business.update({
        where: { id },
        data: {
          stylePreferences: { ...existing, miniWebsite: updatedMini },
          updatedAt: new Date(),
        },
      });

      return { ok: true, sections: updatedSections, theme: updatedMini.theme };
    },
  },
};
