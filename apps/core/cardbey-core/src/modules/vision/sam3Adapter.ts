/**
 * SAM-3 Segmentation Adapter
 * Real SAM-3 (Segment Anything Model 3) integration using Python subprocess
 * 
 * Supports both images and videos, with automatic detection
 */

import { VisionPurpose } from './universalVisionInput.js';

export type Sam3SegmentationRequest = {
  imageUrl: string;
  purpose: VisionPurpose;
  imageBuffer?: Buffer;
  isVideo?: boolean;
};

export type Sam3Region = {
  id: string;
  label: string;
  bbox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  text?: string | null;
  confidence?: number;
  maskId?: string | null;
  meta?: Record<string, any>;
};

export type Sam3SegmentationResult = {
  regions: Sam3Region[];
};

/**
 * Run SAM-3 segmentation on an image
 * 
 * @param req - Segmentation request with image URL and purpose
 * @returns Segmentation result with detected regions
 */
export async function runSam3Segmentation(
  req: Sam3SegmentationRequest
): Promise<Sam3SegmentationResult> {
  // Import the JS implementation
  const { runSam3Segmentation: runSam3SegmentationImpl } = await import('./sam3Adapter.js');
  return runSam3SegmentationImpl(req);
}
