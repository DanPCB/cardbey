/**
 * Extract entity fields from QR payloads, OCR text, and client classification.
 */

import type {
  VisionEntityType,
  VisionProcessEntityInput,
  VisionScanType,
} from './visionScanTypes.js';

export type ExtractedVisionEntity = {
  entityName: string | null;
  entityType: VisionEntityType;
  category: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  detectedUrl: string | null;
  resolvedUrl: string | null;
  domain: string | null;
  confidence: number;
  userFacingSummary: string;
  title: string;
  subtitle: string;
  isHealthRelated: boolean;
};

function titleCase(value: string): string {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

export function hostnameFromUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw.includes('://') ? raw : `https://${raw}`);
    return url.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

function normalizeOpenUrl(raw: string | null | undefined): string | null {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('mailto:') || trimmed.startsWith('tel:')) return trimmed;
  try {
    return new URL(`https://${trimmed}`).toString();
  } catch {
    return null;
  }
}

function mapClientType(type: string | undefined, scanType?: VisionScanType): VisionEntityType {
  const map: Record<string, VisionEntityType> = {
    cardbey_store: 'cardbey_store',
    external_business: 'external_business',
    service_organisation: 'service_organisation',
    product: 'product',
    event: 'event',
    personal_contact: 'personal_contact',
    unknown_link: 'unknown_link',
    unknown: 'unknown_link',
    non_business_content: 'non_business_content',
  };
  if (type && map[type]) return map[type];
  if (scanType === 'menu_photo') return 'product';
  if (scanType === 'poster_flyer') return 'event';
  if (scanType === 'product_packaging') return 'product';
  if (scanType === 'storefront_photo') return 'external_business';
  return 'unknown_link';
}

function isImageScanType(scanType?: VisionScanType): boolean {
  return Boolean(
    scanType &&
      scanType !== 'qr' &&
      scanType !== 'unknown',
  );
}

function imageScanLabel(scanType: VisionScanType): string {
  const labels: Partial<Record<VisionScanType, string>> = {
    camera_photo: 'Photo received',
    uploaded_image: 'Image received',
    storefront_photo: 'Storefront photo',
    menu_photo: 'Menu photo',
    business_card: 'Business card',
    poster_flyer: 'Flyer or poster',
    product_packaging: 'Product photo',
    website_screenshot: 'Website screenshot',
  };
  return labels[scanType] ?? 'Image received';
}

function extractEmail(text: string): string | null {
  const m = text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  return m?.[0] ?? null;
}

function extractPhone(text: string): string | null {
  const m = text.match(/(?:\+?\d[\d\s().-]{7,}\d)/);
  return m?.[0]?.trim() ?? null;
}

function domainDisplayName(hostname: string): string {
  const base = hostname.replace(/^www\./, '').split('.')[0] ?? hostname;
  return titleCase(base);
}

function subtitleForType(type: VisionEntityType, category: string | null): string {
  if (category) return category;
  switch (type) {
    case 'cardbey_store':
      return 'Cardbey store';
    case 'external_business':
      return 'Business';
    case 'service_organisation':
      return 'Service / organisation';
    case 'product':
      return 'Product';
    case 'event':
      return 'Event';
    case 'personal_contact':
      return 'Personal contact';
    default:
      return 'Web link';
  }
}

function scanTypeBoost(scanType: VisionScanType): number {
  switch (scanType) {
    case 'qr':
    case 'business_card':
    case 'storefront_photo':
    case 'camera_photo':
      return 0.15;
    case 'menu_photo':
    case 'poster_flyer':
      return 0.1;
    default:
      return 0;
  }
}

export function extractVisionEntity(input: VisionProcessEntityInput): ExtractedVisionEntity {
  const client = input.clientClassification ?? {};
  const scanType = input.scanType ?? 'unknown';
  const rawPayload = String(input.rawPayload ?? '').trim() || null;
  const detectedText = String(input.detectedText ?? '').trim() || null;
  const entityType = mapClientType(client.type, scanType);
  const imageScan = isImageScanType(scanType);
  const meta = input.imageMetadata as { lowConfidence?: boolean } | null | undefined;
  const lowConfidenceImage = imageScan && meta?.lowConfidence === true;

  const openUrl = normalizeOpenUrl(client.openUrl ?? input.detectedUrl ?? rawPayload);
  const resolvedUrl = openUrl;
  const domain = client.domain ?? hostnameFromUrl(openUrl ?? rawPayload);
  const email = extractEmail(`${detectedText ?? ''} ${rawPayload ?? ''}`);
  const phone = extractPhone(`${detectedText ?? ''} ${rawPayload ?? ''}`);

  const title =
    String(client.title ?? '').trim() ||
    (rawPayload?.startsWith('mailto:')
      ? decodeURIComponent(rawPayload.replace(/^mailto:/i, '').split('?')[0])
      : imageScan
        ? imageScanLabel(scanType)
        : domain
          ? domainDisplayName(domain)
          : 'Scanned item');

  const category = String(client.subtitle ?? '').trim() || null;
  const subtitle = subtitleForType(entityType, category);
  const userFacingSummary =
    String(client.summary ?? '').trim() ||
    (lowConfidenceImage
      ? 'We received your image but could not identify specific business details yet. Ask PIL, save it, or submit for review.'
      : openUrl
        ? `This scan opens ${title} on the web.`
        : imageScan
          ? `This looks like a ${subtitle.toLowerCase()}. We have not confirmed business details yet.`
          : 'We captured this scan but could not identify a public listing.');

  let confidence = 0.55 + scanTypeBoost(scanType);
  if (client.title && !lowConfidenceImage) confidence += 0.15;
  if (domain) confidence += 0.1;
  if (email || phone) confidence += 0.1;
  if (lowConfidenceImage) confidence = Math.min(confidence, 0.42);
  confidence = Math.min(0.98, confidence);

  return {
    entityName: title,
    entityType,
    category,
    phone,
    email,
    website: openUrl && !openUrl.startsWith('mailto:') && !openUrl.startsWith('tel:') ? openUrl : null,
    address: null,
    detectedUrl: rawPayload,
    resolvedUrl,
    domain,
    confidence,
    userFacingSummary,
    title,
    subtitle,
    isHealthRelated: client.isHealthRelated === true || entityType === 'service_organisation',
  };
}
