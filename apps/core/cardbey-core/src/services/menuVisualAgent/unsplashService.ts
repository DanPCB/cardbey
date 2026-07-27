/**
 * Unsplash Service
 * Searches Unsplash API for food/product images
 * 
 * Legal: Only uses Unsplash API (no scraping)
 * Rate limits: 50 requests/hour (free tier)
 */

import { createApi } from 'unsplash-js';

// Initialize Unsplash client (only if API key is available)
const unsplashApi = process.env.UNSPLASH_ACCESS_KEY
  ? createApi({
      accessKey: process.env.UNSPLASH_ACCESS_KEY,
    })
  : null;

export interface UnsplashImageResult {
  url: string;
  attribution: string; // Photographer name + Unsplash link
  photographer: string;
  photographerUrl: string;
}

/**
 * Search Unsplash for an image matching a menu item
 * 
 * @param query - Menu item name (e.g., "Flat White", "Pho Bo")
 * @param style - Optional style preset to refine search
 * @returns Image URL and attribution, or null if not found/API unavailable
 */
export async function searchUnsplashImage(
  query: string,
  style?: 'modern' | 'warm' | 'minimal' | 'vibrant'
): Promise<UnsplashImageResult | null> {
  if (!unsplashApi) {
    console.log('[UnsplashService] API key not configured, skipping Unsplash search');
    return null;
  }

  try {
    // Build search query with style keywords if provided
    let searchQuery = query;
    if (style) {
      const styleKeywords: Record<string, string> = {
        modern: 'modern food photography',
        warm: 'warm food photography',
        minimal: 'minimalist food',
        vibrant: 'vibrant food photography',
      };
      searchQuery = `${query} ${styleKeywords[style] || ''}`;
    }

    // Search Unsplash (food category, 1 result)
    const result = await unsplashApi.search.getPhotos({
      query: searchQuery,
      orientation: 'landscape',
      perPage: 1,
      // Filter to food-related collections if possible
    });

    if (result.type === 'success' && result.response.results.length > 0) {
      const photo = result.response.results[0];
      
      // Get regular size URL (800px width, good for product images)
      const imageUrl = photo.urls.regular;
      
      // Build attribution (required by Unsplash license)
      const attribution = `Photo by ${photo.user.name} on Unsplash`;
      const photographer = photo.user.name;
      const photographerUrl = photo.user.links.html;

      console.log('[UnsplashService] Found image:', { query, imageUrl, photographer });

      return {
        url: imageUrl,
        attribution,
        photographer,
        photographerUrl,
      };
    }

    console.log('[UnsplashService] No results found for query:', query);
    return null;
  } catch (error: any) {
    // Log error but don't throw (non-blocking)
    console.error('[UnsplashService] Search failed:', error.message);
    return null;
  }
}

/**
 * Check if Unsplash service is available
 */
export function isUnsplashAvailable(): boolean {
  return unsplashApi !== null;
}

