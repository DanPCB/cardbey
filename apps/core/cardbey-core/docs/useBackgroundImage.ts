/**
 * React Hook for Loading Background Images
 * 
 * Copy this file to: src/hooks/useBackgroundImage.ts (or src/utils/useBackgroundImage.ts)
 * 
 * This is a convenience wrapper around use-image that handles loading states
 * and errors for AI-generated background images.
 * 
 * Usage:
 * import { useBackgroundImage } from '@/hooks/useBackgroundImage';
 * 
 * const { image, isLoading, error } = useBackgroundImage(imageUrl);
 */

import { useMemo } from "react";
import useImage from "use-image";

export interface UseBackgroundImageResult {
  /** The loaded image object (null if not loaded yet) */
  image: HTMLImageElement | null;
  
  /** Whether the image is currently loading */
  isLoading: boolean;
  
  /** Whether the image has loaded successfully */
  isLoaded: boolean;
  
  /** Whether there was an error loading the image */
  hasError: boolean;
  
  /** Error message if loading failed */
  error: string | null;
}

/**
 * Hook to load a background image with loading and error states
 * 
 * @param imageUrl - URL of the image to load (null/empty to skip loading)
 * @returns Image loading state and result
 */
export function useBackgroundImage(
  imageUrl: string | null | undefined
): UseBackgroundImageResult {
  // use-image hook handles the actual loading
  // "anonymous" enables CORS for cross-origin images
  const [image, status] = useImage(imageUrl ?? "", "anonymous");

  // Determine states based on status
  const result = useMemo<UseBackgroundImageResult>(() => {
    if (!imageUrl) {
      return {
        image: null,
        isLoading: false,
        isLoaded: false,
        hasError: false,
        error: null,
      };
    }

    switch (status) {
      case "loading":
        return {
          image: null,
          isLoading: true,
          isLoaded: false,
          hasError: false,
          error: null,
        };

      case "loaded":
        return {
          image: image || null,
          isLoading: false,
          isLoaded: true,
          hasError: false,
          error: null,
        };

      case "failed":
        return {
          image: null,
          isLoading: false,
          isLoaded: false,
          hasError: true,
          error: `Failed to load image: ${imageUrl}`,
        };

      default:
        return {
          image: null,
          isLoading: false,
          isLoaded: false,
          hasError: false,
          error: null,
        };
    }
  }, [imageUrl, image, status]);

  return result;
}







