/**
 * Universal Vision Input Module
 * Provides structured visual information for all engines (menu, loyalty, promo, signage)
 * Integrates SAM-3 segmentation and OCR
 */

import { z } from 'zod';
import { performMenuOcr } from '../menu/performMenuOcr.js';
import { runSam3Segmentation } from './sam3Adapter.js';

// ---- Core types ----

export const VisionPurposeSchema = z.enum([
  'menu',
  'loyalty',
  'promo',
  'signage',
  'document',
  'generic',
]);

export type VisionPurpose = z.infer<typeof VisionPurposeSchema>;

export const VisionInputRequestSchema = z.object({
  tenantId: z.string(),
  storeId: z.string().optional(),
  imageUrl: z.string(), // may be uploads URL, S3, etc.
  purpose: VisionPurposeSchema,
  locale: z.string().default('en'),
  // optional hints coming from UI (e.g. detected card labels)
  uiHints: z
    .object({
      labels: z.array(z.string()).optional(),
    })
    .optional(),
});

export type VisionInputRequest = z.infer<typeof VisionInputRequestSchema>;

// Basic shape for any detected region
export const BBoxSchema = z.object({
  x: z.number(), // left
  y: z.number(), // top
  width: z.number(),
  height: z.number(),
});

export type BBox = z.infer<typeof BBoxSchema>;

// Generic "block" of visual information
export const VisionBlockSchema = z.object({
  id: z.string(),
  kind: z.enum([
    'text_line',
    'price',
    'title',
    'section_header',
    'qr_code',
    'barcode',
    'logo',
    'product_tile',
    'stamp',
    'other',
  ]),
  bbox: BBoxSchema,
  text: z.string().nullable(),
  confidence: z.number().min(0).max(1).nullable(),
  // Optional mask reference if SAM-3 gives us pixel mask IDs
  maskId: z.string().optional().nullable(),
  // Arbitrary extra metadata
  meta: z.record(z.any()).optional(),
});

export type VisionBlock = z.infer<typeof VisionBlockSchema>;

// ---- Engine-specific hint views ----

export const MenuHintsSchema = z.object({
  items: z
    .array(
      z.object({
        label: z.string(), // e.g. "Flat White"
        bbox: BBoxSchema.nullable(),
        priceText: z.string().nullable(),
      })
    )
    .optional(),
  sections: z.array(z.string()).optional(), // e.g. ["Coffee", "Beverages"]
});

export type MenuHints = z.infer<typeof MenuHintsSchema>;

export const LoyaltyHintsSchema = z.object({
  punchCountApprox: z.number().optional(), // approx number of stamps/holes
  hasQrCode: z.boolean().optional(),
  qrRegion: BBoxSchema.optional().nullable(),
  cardTitle: z.string().optional(),
});

export type LoyaltyHints = z.infer<typeof LoyaltyHintsSchema>;

export const PromoHintsSchema = z.object({
  mainHeadline: z.string().optional(),
  subHeadline: z.string().optional(),
  priceHighlights: z.array(z.string()).optional(),
});

export type PromoHints = z.infer<typeof PromoHintsSchema>;

export const UniversalVisionResultSchema = z.object({
  blocks: z.array(VisionBlockSchema),
  menuHints: MenuHintsSchema.optional(),
  loyaltyHints: LoyaltyHintsSchema.optional(),
  promoHints: PromoHintsSchema.optional(),
  // raw dumps if engines want to inspect
  raw: z
    .object({
      sam3: z.any().optional(),
      ocrText: z.string().optional(),
    })
    .optional(),
});

export type UniversalVisionResult = z.infer<typeof UniversalVisionResultSchema>;

// ---- Main entrypoint ----

export async function analyseVisionInput(
  req: VisionInputRequest
): Promise<UniversalVisionResult> {
  const input = VisionInputRequestSchema.parse(req);

  console.log('[Vision] analyseVisionInput start', {
    tenantId: input.tenantId,
    storeId: input.storeId,
    purpose: input.purpose,
    imageUrl: input.imageUrl,
  });

  // 1) Call SAM-3 to segment the image into regions
  const sam3Result = await runSam3Segmentation({
    imageUrl: input.imageUrl,
    purpose: input.purpose,
  });

  // 2) Run OCR on the whole image (or on relevant regions)
  // For now we do full-image OCR; you can later optimize per-mask.
  const ocrText = await performMenuOcr(input.imageUrl).catch((err) => {
    console.error('[Vision] OCR failed, continuing with empty text', err);
    return '';
  });

  // 3) Normalize SAM-3 detections into VisionBlock[]
  const blocks = normaliseSam3ToBlocks(sam3Result, ocrText);

  // 4) Derive engine-specific hints
  const menuHints =
    input.purpose === 'menu'
      ? deriveMenuHints(blocks, ocrText, input.uiHints)
      : undefined;

  const loyaltyHints =
    input.purpose === 'loyalty'
      ? deriveLoyaltyHints(blocks, ocrText)
      : undefined;

  const promoHints =
    input.purpose === 'promo'
      ? derivePromoHints(blocks, ocrText)
      : undefined;

  const result: UniversalVisionResult = {
    blocks,
    menuHints,
    loyaltyHints,
    promoHints,
    raw: {
      sam3: sam3Result,
      ocrText,
    },
  };

  console.log('[Vision] analyseVisionInput result summary', {
    purpose: input.purpose,
    blockCount: blocks.length,
    menuItemCount: result.menuHints?.items?.length ?? 0,
    punchApprox: result.loyaltyHints?.punchCountApprox ?? 0,
  });

  return result;
}

// ---- Normalisation helpers ----

// NOTE: sam3Result type is `any` placeholder; adapt it to your actual client.
function normaliseSam3ToBlocks(
  sam3Result: any,
  ocrText: string
): VisionBlock[] {
  // For now, we do a very simple strategy:
  // - If sam3Result has regions with type/label, map them.
  // - Else, fallback to one big "document" text block from OCR.

  const blocks: VisionBlock[] = [];

  if (sam3Result && Array.isArray(sam3Result.regions)) {
    for (const region of sam3Result.regions) {
      const kind = guessBlockKindFromSam3(region);
      const block: VisionBlock = {
        id: region.id ?? `region_${blocks.length}`,
        kind,
        bbox: {
          x: region.bbox?.x ?? 0,
          y: region.bbox?.y ?? 0,
          width: region.bbox?.width ?? 1,
          height: region.bbox?.height ?? 1,
        },
        text: region.text ?? null,
        confidence:
          typeof region.confidence === 'number' ? region.confidence : null,
        maskId: region.maskId ?? null,
        meta: region.meta ?? {},
      };
      blocks.push(block);
    }
  }

  if (blocks.length === 0 && ocrText.trim().length > 0) {
    blocks.push({
      id: 'ocr_full',
      kind: 'text_line',
      bbox: { x: 0, y: 0, width: 1, height: 1 },
      text: ocrText,
      confidence: 0.7,
      maskId: null,
      meta: { source: 'ocr_full_image' },
    });
  }

  return blocks;
}

function guessBlockKindFromSam3(region: any): VisionBlock['kind'] {
  const label = (region.label || '').toLowerCase();

  if (label.includes('qr')) return 'qr_code';
  if (label.includes('barcode')) return 'barcode';
  if (label.includes('logo')) return 'logo';
  if (label.includes('stamp') || label.includes('punch')) return 'stamp';
  if (label.includes('product') || label.includes('tile'))
    return 'product_tile';
  if (label.includes('title') || label.includes('header')) return 'title';

  return 'other';
}

// ---- Hint derivation ----

function deriveMenuHints(
  blocks: VisionBlock[],
  ocrText: string,
  uiHints?: { labels?: string[] }
): MenuHints {
  const labels = uiHints?.labels ?? [];

  // Start with UI labels as items, then maybe enrich with OCR later.
  const items =
    labels.length > 0
      ? labels.map((label, index) => ({
          label,
          bbox: null,
          priceText: null,
        }))
      : [];

  // Cheap heuristic: look for lines with typical section names
  const sections: string[] = [];
  const textSource =
    ocrText ||
    blocks
      .map((b) => b.text ?? '')
      .filter(Boolean)
      .join('\n');

  const possibleSections = [
    'coffee',
    'drinks',
    'beverages',
    'food',
    'mains',
    'desserts',
    'services',
  ];

  for (const s of possibleSections) {
    if (textSource.toLowerCase().includes(s)) {
      const pretty = s[0].toUpperCase() + s.slice(1);
      sections.push(pretty);
    }
  }

  return {
    items,
    sections: sections.length > 0 ? sections : undefined,
  };
}

function deriveLoyaltyHints(
  blocks: VisionBlock[],
  ocrText: string
): LoyaltyHints {
  const punchBlocks = blocks.filter((b) => b.kind === 'stamp');
  const qrBlock = blocks.find((b) => b.kind === 'qr_code');

  let cardTitle: string | undefined;
  const firstTitle = blocks.find((b) => b.kind === 'title' && b.text);
  if (firstTitle?.text) {
    cardTitle = firstTitle.text;
  } else {
    // Fallback: first line of OCR
    const firstLine = (ocrText || '').split(/\r?\n/)[0]?.trim();
    if (firstLine) cardTitle = firstLine;
  }

  return {
    punchCountApprox: punchBlocks.length || undefined,
    hasQrCode: !!qrBlock,
    qrRegion: qrBlock?.bbox ?? undefined,
    cardTitle,
  };
}

function derivePromoHints(blocks: VisionBlock[], ocrText: string): PromoHints {
  const textSource =
    ocrText ||
    blocks
      .map((b) => b.text ?? '')
      .filter(Boolean)
      .join('\n');

  const lines = textSource
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const mainHeadline = lines[0] ?? undefined;
  const subHeadline = lines[1] ?? undefined;

  const priceHighlights = lines.filter((l) => /\d+(\.\d{1,2})?/.test(l));

  return {
    mainHeadline,
    subHeadline,
    priceHighlights,
  };
}


