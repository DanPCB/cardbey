/**
 * Image vision extraction — OCR when available, honest placeholders when not.
 * Never fabricates business details on low confidence.
 */

import { runCardScanPipeline } from '../vision/cardScanPipeline.js';
import type { VisionProcessEntityInput, VisionScanType } from './visionScanTypes.js';

export type ImageVisionMetadata = {
  ocrAttempted: boolean;
  ocrProvider: string | null;
  ocrConfidence: number | null;
  extractionConfidence: 'high' | 'medium' | 'low';
  lowConfidence: boolean;
};

const SCAN_TYPE_LABELS: Record<string, { title: string; subtitle: string; summary: string; type: string }> = {
  camera_photo: {
    title: 'Photo received',
    subtitle: 'Camera capture',
    summary: 'We received your photo. We could not identify specific business details yet — you can ask PIL or save it for later.',
    type: 'unknown_link',
  },
  uploaded_image: {
    title: 'Image received',
    subtitle: 'Uploaded image',
    summary: 'We received your image. We could not identify specific business details yet — you can ask PIL or save it for later.',
    type: 'unknown_link',
  },
  storefront_photo: {
    title: 'Storefront photo',
    subtitle: 'Storefront',
    summary: 'This looks like a storefront photo. We will review extracted details before suggesting any public listing.',
    type: 'external_business',
  },
  menu_photo: {
    title: 'Menu photo',
    subtitle: 'Menu',
    summary: 'This looks like a menu photo. You can extract items or save it to your Suitcase.',
    type: 'product',
  },
  business_card: {
    title: 'Business card',
    subtitle: 'Contact card',
    summary: 'This looks like a business card. Save the contact or ask PIL for help.',
    type: 'personal_contact',
  },
  poster_flyer: {
    title: 'Flyer or poster',
    subtitle: 'Event / promotion',
    summary: 'This looks like a flyer or poster. You can save it, share it, or create an event draft.',
    type: 'event',
  },
  product_packaging: {
    title: 'Product photo',
    subtitle: 'Product',
    summary: 'This looks like a product label or packaging.',
    type: 'product',
  },
  website_screenshot: {
    title: 'Website screenshot',
    subtitle: 'Website',
    summary: 'This looks like a website screenshot.',
    type: 'unknown_link',
  },
};

function scanTypeEntityHint(scanType: VisionScanType): string {
  return SCAN_TYPE_LABELS[scanType]?.type ?? 'unknown_link';
}

function scanTypeDefaults(scanType: VisionScanType) {
  return (
    SCAN_TYPE_LABELS[scanType] ?? {
      title: 'Image received',
      subtitle: 'Photo scan',
      summary:
        'We received your image but could not identify specific business details yet. Ask PIL, save it, or submit for review.',
      type: 'unknown_link',
    }
  );
}

function mapOcrScanType(scanType: VisionScanType): string {
  if (scanType === 'product_packaging') return 'product_tag';
  if (scanType === 'business_card') return 'business_card';
  if (scanType === 'menu_photo') return 'business_card';
  return 'business_card';
}

function buildClassificationFromOcr(
  scanType: VisionScanType,
  ocrText: string,
  preview: Record<string, unknown> | null | undefined,
  confidence: number,
): VisionProcessEntityInput['clientClassification'] {
  const name = String(preview?.name ?? '').trim();
  const hasBusinessSignal = Boolean(name || preview?.website || preview?.phone || preview?.email);

  if (!hasBusinessSignal) {
    const defaults = scanTypeDefaults(scanType);
    return {
      type: scanTypeEntityHint(scanType),
      title: defaults.title,
      subtitle: defaults.subtitle,
      summary: defaults.summary,
    };
  }

  const type =
    scanType === 'menu_photo'
      ? 'product'
      : scanType === 'poster_flyer'
        ? 'event'
        : scanType === 'business_card' && preview?.email && !preview?.website
          ? 'personal_contact'
          : 'external_business';

  return {
    type,
    title: name || scanTypeDefaults(scanType).title,
    subtitle: String(preview?.category ?? scanTypeDefaults(scanType).subtitle),
    summary: name
      ? `We read "${name}" from this ${scanTypeDefaults(scanType).subtitle.toLowerCase()}.`
      : scanTypeDefaults(scanType).summary,
    openUrl: preview?.website ? String(preview.website) : null,
    domain: null,
  };
}

export async function enrichVisionInputFromImage(
  input: VisionProcessEntityInput & {
    imageBuffer?: Buffer | null;
    mimeType?: string | null;
    tenantKey?: string | null;
  },
): Promise<VisionProcessEntityInput & { imageMetadata?: ImageVisionMetadata }> {
  const scanType = (input.scanType ?? 'uploaded_image') as VisionScanType;
  const hasImage = Boolean(input.imageBuffer || input.imageAssetUrl);

  if (!hasImage && !input.imageBuffer) {
    return input;
  }

  const defaults = scanTypeDefaults(scanType);
  let imageMetadata: ImageVisionMetadata = {
    ocrAttempted: false,
    ocrProvider: null,
    ocrConfidence: null,
    extractionConfidence: 'low',
    lowConfidence: true,
  };

  if (!input.imageBuffer) {
    return {
      ...input,
      scanType,
      detectedText: input.detectedText ?? null,
      clientClassification: input.clientClassification ?? {
        type: defaults.type,
        title: defaults.title,
        subtitle: defaults.subtitle,
        summary: defaults.summary,
      },
      imageMetadata,
    };
  }

  imageMetadata.ocrAttempted = true;

  try {
    const pipeline = await runCardScanPipeline({
      buffer: input.imageBuffer,
      mimeType: input.mimeType ?? 'image/jpeg',
      scanType: mapOcrScanType(scanType),
      tenantKey: input.tenantKey ?? 'vision',
    });

    if (pipeline.ok && pipeline.ocrText) {
      const conf = pipeline.confidence ?? 0;
      imageMetadata = {
        ocrAttempted: true,
        ocrProvider: pipeline.provider ?? null,
        ocrConfidence: conf,
        extractionConfidence: conf >= 0.75 ? 'high' : conf >= 0.5 ? 'medium' : 'low',
        lowConfidence: conf < 0.5,
      };

      return {
        ...input,
        scanType,
        detectedText: pipeline.ocrText,
        clientClassification:
          input.clientClassification ??
          buildClassificationFromOcr(scanType, pipeline.ocrText, pipeline.preview, conf),
        imageMetadata,
      };
    }
  } catch {
    /* fall through to honest placeholder */
  }

  return {
    ...input,
    scanType,
    clientClassification: input.clientClassification ?? {
      type: defaults.type,
      title: defaults.title,
      subtitle: defaults.subtitle,
      summary: defaults.summary,
    },
    imageMetadata,
  };
}
