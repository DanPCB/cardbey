/**
 * Lightweight authenticated tool endpoints for manual / QA testing.
 */
import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/auth.js';
import { canAccessMission } from './agentMessagesRoutes.js';
import { mergeMissionContext } from '../lib/mission.js';
import { getPrismaClient } from '../lib/prisma.js';
import {
  extractBusinessProfileFromText,
  extractCatalogItemsFromText,
  buildCatalogPreflightIntent,
} from '../lib/catalogPreflightExtract.js';
import { postAnthropicMessages } from '../lib/llm/anthropicProvider.js';

const router = Router();

const CATALOG_ACCEPT_MIMES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const catalogUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

/** Best-effort lines with trailing numeric price → catalog rows (PDF extract). */
function parsePdfCatalogItems(text) {
  const items = [];
  const raw = String(text || '');
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    const m = t.match(/^(.+?)\s+(\d+(?:\.\d+)?)\s*$/);
    if (!m) continue;
    const name = m[1].replace(/\s+/g, ' ').trim();
    const priceHint = m[2];
    if (name.length < 2) continue;
    items.push({ name, priceHint, source: 'pdf_extract' });
  }
  return items;
}

/**
 * POST /api/tools/business-image-enrich
 * Same auth as other authenticated mission/tool flows (Bearer requireAuth).
 */
router.post('/business-image-enrich', requireAuth, async (req, res, next) => {
  try {
    const body = req.body ?? {};
    const businessName = typeof body.businessName === 'string' ? body.businessName.trim() : '';
    const businessType = typeof body.businessType === 'string' ? body.businessType.trim() : '';
    if (!businessName || !businessType) {
      return res.status(400).json({ error: 'businessName and businessType are required' });
    }
    const { runBusinessImageEnricherTool } = await import('../services/draftStore/businessImageEnricher.ts');
    const result = await runBusinessImageEnricherTool({
      businessName,
      businessType,
      location: body.location != null ? String(body.location).trim() : undefined,
      classifierProfile: body.classifierProfile ?? null,
    });
    return res.json(result);
  } catch (e) {
    return next(e);
  }
});

/**
 * POST /api/tools/scrape-store-images
 * Authenticated JSON body — QA / manual testing of store image scraper.
 */
router.post('/scrape-store-images', requireAuth, async (req, res, next) => {
  try {
    const body = req.body ?? {};
    const { scrapeStoreImages } = await import('../services/draftStore/storeImageScraper.js');
    const result = await scrapeStoreImages({
      businessName: typeof body.businessName === 'string' ? body.businessName : '',
      businessType: typeof body.businessType === 'string' ? body.businessType : '',
      suburb: body.suburb != null ? String(body.suburb) : null,
      websiteUrl: body.websiteUrl != null ? String(body.websiteUrl) : null,
      facebookHandle: body.facebookHandle != null ? String(body.facebookHandle) : null,
    });
    return res.json(result);
  } catch (e) {
    return next(e);
  }
});

/**
 * POST /api/tools/catalog-preflight
 * Authenticated PDF/image upload (no mission). Returns profile + items + intent for store creation.
 */
router.post('/catalog-preflight', requireAuth, catalogUpload.single('catalog'), async (req, res, next) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({
        ok: false,
        error: 'catalog_required',
        message: 'Missing file field "catalog"',
      });
    }
    const mime = req.file.mimetype;
    if (!CATALOG_ACCEPT_MIMES.has(mime)) {
      return res.status(415).json({
        ok: false,
        error: 'unsupported_media_type',
        message: 'Accepted types: application/pdf, image/jpeg, image/png, image/webp.',
      });
    }
    if (mime !== 'application/pdf') {
      return res.json({
        ok: true,
        source: 'image',
        profile: {},
        items: [],
        intent: 'Create a store from catalog',
        note: 'Image catalogs will be processed during store creation',
        rawTextLength: 0,
      });
    }
    let pdfParse;
    try {
      const pdfParseMod = await import('pdf-parse');
      pdfParse = pdfParseMod.default ?? pdfParseMod;
    } catch (e) {
      return res.status(501).json({
        ok: false,
        error: 'pdf_parse_unavailable',
        message: 'PDF text extraction is not available on this server. Install pdf-parse or use an image catalog.',
      });
    }
    let text = '';
    try {
      const parsed = await pdfParse(req.file.buffer);
      text = parsed?.text != null ? String(parsed.text) : '';
    } catch (e) {
      return res.status(422).json({
        ok: false,
        error: String(e?.message || e || 'pdf_parse_failed'),
      });
    }

    if (!text.trim()) {
      // Vision fallback for image-based / design-tool PDFs
      // where pdf-parse finds no text layer
      try {
        const base64Pdf = req.file.buffer.toString('base64');

        const visionResponse = await postAnthropicMessages({
          model: process.env.ANTHROPIC_MODEL?.trim() || 'claude-opus-4-6',
          max_tokens: 4096,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'document',
                  source: {
                    type: 'base64',
                    media_type: 'application/pdf',
                    data: base64Pdf,
                  },
                },
                {
                  type: 'text',
                  text: `Extract business info and pricing from this document.
Return ONLY raw JSON, no markdown:
{
  "businessName": "the primary trading name shown most prominently — short form preferred (e.g. 'Wash Experts' not 'Wash Experts Hand Car Wash Pty Ltd')",
  "phone": "string or null",
  "address": "string or null",
  "suburb": "string or null",
  "website": "string or null",
  "email": "string or null",
  "category": "automotive|food|beauty|furniture|fitness|health|retail|general",
  "items": [
    { "n": "string", "p": number, "c": "string" }
  ]
}
Use short keys: n=name, p=price, c=category.
Extract every priced service. Raw JSON only.`,
                },
              ],
            },
          ],
        });

        if (visionResponse?.error) {
          throw new Error(String(visionResponse.error));
        }

        // postAnthropicMessages returns the raw Anthropic API
        // response — extract text from content[0].text
        const raw = (
          visionResponse?.content?.[0]?.text ??
          visionResponse?.text ??
          ''
        ).trim();

        const cleaned = raw
          .replace(/^```json\s*/i, '')
          .replace(/^```\s*/i, '')
          .replace(/```\s*$/i, '')
          .trim();

        let parsed;
        try {
          parsed = JSON.parse(cleaned);
        } catch (parseErr) {
          return res.status(422).json({
            ok: false,
            error: 'Vision extraction failed — response was not valid JSON',
            raw: cleaned.slice(0, 500),
          });
        }

        const items = (parsed.items ?? [])
          .map((item) => ({
            name: String(item.n ?? item.name ?? '').trim(),
            price: Number(item.p ?? item.price ?? 0),
            category: String(item.c ?? item.category ?? 'Services'),
            source: 'pdf_vision',
          }))
          .filter((i) => i.name.length > 0);

        return res.json({
          ok: true,
          source: 'pdf_vision',
          profile: {
            businessName: parsed.businessName ?? '',
            phone: parsed.phone ?? null,
            address: parsed.address ?? null,
            suburb: parsed.suburb ?? null,
            website: parsed.website ?? null,
            email: parsed.email ?? null,
            category: parsed.category ?? 'general',
          },
          items,
          intent:
            `Create a store for ${parsed.businessName ?? 'this business'}` +
            (parsed.suburb ? ` in ${parsed.suburb}` : '') +
            ` — ${parsed.category ?? 'general'} business` +
            (items.length > 0 ? ` with ${items.length} services extracted from catalog` : ''),
          rawTextLength: 0,
        });
      } catch (visionErr) {
        console.error('[CatalogPreflight] vision fallback failed:', visionErr.message);
        return res.status(422).json({
          ok: false,
          error: 'Could not extract content from PDF',
          detail: visionErr.message,
        });
      }
    }

    let profile;
    let items;
    try {
      profile = extractBusinessProfileFromText(text);
      items = extractCatalogItemsFromText(text);
    } catch (e) {
      return res.status(422).json({
        ok: false,
        error: String(e?.message || e || 'extract_failed'),
      });
    }
    const intent = buildCatalogPreflightIntent(profile, items);
    return res.json({
      ok: true,
      source: 'pdf',
      profile,
      items,
      intent,
      rawTextLength: text.length,
    });
  } catch (e) {
    return next(e);
  }
});

/**
 * POST /api/tools/catalog-upload/:missionId
 * multipart/form-data, field name: catalog. PDF → optional text extract; images → base64 on mission context.
 */
router.post('/catalog-upload/:missionId', requireAuth, catalogUpload.single('catalog'), async (req, res, next) => {
  try {
    const missionId = typeof req.params.missionId === 'string' ? req.params.missionId.trim() : '';
    if (!missionId) {
      return res.status(400).json({ ok: false, error: 'mission_id_required', message: 'missionId is required' });
    }
    const allowed = await canAccessMission(missionId, req.user);
    if (!allowed) {
      return res.status(403).json({
        ok: false,
        error: 'forbidden',
        message: 'You do not have access to this mission.',
      });
    }
    if (!req.file?.buffer) {
      return res.status(400).json({
        ok: false,
        error: 'catalog_required',
        message: 'Missing file field "catalog"',
      });
    }
    const mime = req.file.mimetype;
    if (!CATALOG_ACCEPT_MIMES.has(mime)) {
      return res.status(415).json({
        ok: false,
        error: 'unsupported_media_type',
        message: 'Accepted types: application/pdf, image/jpeg, image/png, image/webp.',
      });
    }
    const prisma = getPrismaClient();
    let items = [];
    let imageBufferBase64;
    if (mime === 'application/pdf') {
      try {
        const pdfParseMod = await import('pdf-parse');
        const pdfParse = pdfParseMod.default ?? pdfParseMod;
        const parsed = await pdfParse(req.file.buffer);
        const text = parsed?.text != null ? String(parsed.text) : '';
        items = parsePdfCatalogItems(text);
      } catch (e) {
        console.warn('[catalog-upload] pdf-parse unavailable or failed:', e?.message || e);
        items = [];
      }
    } else {
      imageBufferBase64 = req.file.buffer.toString('base64');
    }
    const uploadedCatalog = {
      items,
      mimeType: mime,
      source: 'user_upload',
      uploadedAt: new Date().toISOString(),
      ...(imageBufferBase64 ? { imageBufferBase64 } : {}),
    };
    await mergeMissionContext(
      missionId,
      {
        uploadedCatalog,
        imageEnrichmentStatus: 'user_upload',
        imageConfidenceScore: 0.95,
        uploadSuggestionNeeded: false,
      },
      { prisma },
    );
    return res.json({
      ok: true,
      itemCount: items.length,
      mimeType: mime,
      message:
        items.length > 0
          ? `Extracted ${items.length} catalog items`
          : 'File received — image content will be used for visual matching',
    });
  } catch (e) {
    return next(e);
  }
});

export default router;
