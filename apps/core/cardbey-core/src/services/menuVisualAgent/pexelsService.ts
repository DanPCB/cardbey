/**
 * Pexels Service
 * Searches Pexels API for product/menu images (real photos).
 * Used by draft-item image helper; no Prisma/DB.
 *
 * Env: PEXELS_API_KEY (optional)
 * API: https://api.pexels.com/v1/search
 */

const PEXELS_API_KEY = process.env.PEXELS_API_KEY || null;
const PEXELS_SEARCH_URL = 'https://api.pexels.com/v1/search';

export function isPexelsAvailable(): boolean {
  return !!PEXELS_API_KEY;
}

interface PexelsPhotoSrc {
  original?: string;
  large2x?: string;
  large?: string;
  medium?: string;
  small?: string;
}

interface PexelsPhoto {
  id?: number;
  width?: number;
  height?: number;
  url?: string;
  photographer?: string;
  photographer_url?: string;
  src?: PexelsPhotoSrc;
  alt?: string;
}

interface PexelsSearchResponse {
  photos?: PexelsPhoto[];
}

export interface PexelsImageResult {
  url: string;
  thumbnailUrl: string;
  photographer?: string;
  photographerUrl?: string;
  alt?: string;
  id?: number;
}

/**
 * Search Pexels for one image matching the query.
 * Returns a single image URL (large > large2x > medium) or null.
 */
export async function searchPexelsImage(query: string): Promise<string | null> {
  if (!PEXELS_API_KEY) return null;

  try {
    const params = new URLSearchParams({
      query: query.trim().slice(0, 200),
      per_page: '1',
      orientation: 'square',
    });
    const url = `${PEXELS_SEARCH_URL}?${params.toString()}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: PEXELS_API_KEY,
      },
    });

    if (!res.ok) return null;

    const json = (await res.json()) as PexelsSearchResponse;
    const photo = json?.photos?.[0];
    const src = photo?.src;
    if (!src) return null;

    return src.large || src.large2x || src.medium || null;
  } catch {
    return null;
  }
}

/**
 * Search Pexels for multiple images matching the query.
 * Used by suggest-images (preview mode) to show several choices.
 * @param query - Search query (product name, description, etc.)
 * @param perPage - Number of results (1–80, default 8)
 * @returns Array of image results with url, thumbnailUrl, and attribution
 */
export async function searchPexelsImages(
  query: string,
  perPage: number = 8
): Promise<PexelsImageResult[]> {
  if (!PEXELS_API_KEY) return [];

  try {
    const limit = Math.min(80, Math.max(1, Math.floor(perPage) || 8));
    const params = new URLSearchParams({
      query: query.trim().slice(0, 200),
      per_page: String(limit),
      orientation: 'square',
    });
    const url = `${PEXELS_SEARCH_URL}?${params.toString()}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: PEXELS_API_KEY,
      },
    });

    if (!res.ok) return [];

    const json = (await res.json()) as PexelsSearchResponse;
    const photos = json?.photos ?? [];
    return photos
      .map((photo): PexelsImageResult | null => {
        const src = photo?.src;
        const imageUrl = src?.large || src?.large2x || src?.medium || src?.original || null;
        const thumbUrl = src?.medium || src?.small || imageUrl;
        if (!imageUrl) return null;
        return {
          url: imageUrl,
          thumbnailUrl: thumbUrl,
          photographer: photo.photographer ?? undefined,
          photographerUrl: photo.photographer_url ?? undefined,
          alt: (photo as { alt?: string }).alt ?? undefined,
          id: photo.id,
        };
      })
      .filter((r): r is PexelsImageResult => r != null);
  } catch {
    return [];
  }
}
