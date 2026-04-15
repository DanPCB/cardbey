/**
 * Menu Extraction V2 Schema
 * Future-proof contract between Vision/OCR → Parser → Review UI → Persist
 */

/**
 * @typedef {Object} MenuExtractionV2Source
 * @property {string} imageUrl - Original upload URL
 * @property {string} [imageHash] - SHA256 of bytes (for dedupe/caching)
 * @property {number} [width] - Image width
 * @property {number} [height] - Image height
 * @property {string} [mimeType] - Image MIME type
 */

/**
 * @typedef {Object} MenuExtractionV2Engine
 * @property {string} visionProvider - "openai" | "legacy" | "none"
 * @property {string} [visionModel] - Model used (e.g., "gpt-4o")
 * @property {string} [parserModel] - Parser model used
 * @property {string} startedAt - ISO timestamp
 * @property {string} completedAt - ISO timestamp
 * @property {Object} [debug] - Debug information
 * @property {number} debug.ocrTextLength - Length of OCR text
 * @property {string} [debug.ocrTextPreview] - First 500 chars of OCR text
 * @property {number} debug.blockCount - Number of text blocks detected
 */

/**
 * @typedef {Object} MenuExtractionV2Category
 * @property {string} key - Category key (e.g., "coffee", "beverages")
 * @property {string} name - Display name (e.g., "Coffee", "Beverages")
 * @property {number} [confidence] - Confidence score (0-1)
 */

/**
 * @typedef {Object} MenuExtractionV2Price
 * @property {number} amount - Price amount (e.g., 3.5)
 * @property {string} currency - Currency code (e.g., "AUD")
 * @property {string} source - "explicit" | "inferred" | "missing"
 * @property {number} [confidence] - Confidence score (0-1)
 */

/**
 * @typedef {Object} MenuExtractionV2ItemImage
 * @property {string} [url] - Image URL
 * @property {string} source - "menu_photo_crop" | "generated" | "manual" | "none"
 * @property {number} [confidence] - Confidence score (0-1)
 * @property {Object} [crop] - Crop coordinates if cropped from menu photo
 * @property {number} crop.x - X coordinate
 * @property {number} crop.y - Y coordinate
 * @property {number} crop.w - Width
 * @property {number} crop.h - Height
 */

/**
 * @typedef {Object} MenuExtractionV2ItemConfidence
 * @property {number} overall - Overall confidence (0-1)
 * @property {number} name - Name confidence (0-1)
 * @property {number} [price] - Price confidence (0-1)
 * @property {number} [category] - Category confidence (0-1)
 */

/**
 * @typedef {Object} MenuExtractionV2ItemDedupeMatch
 * @property {string} existingItemId - ID of existing item
 * @property {number} matchScore - Match score (0-1)
 * @property {string} matchedOn - "name" | "fuzzy_name"
 */

/**
 * @typedef {Object} MenuExtractionV2ItemDedupe
 * @property {string} status - "unique" | "duplicate" | "possible_duplicate"
 * @property {MenuExtractionV2ItemDedupeMatch} [match] - Match information
 * @property {string} recommendedAction - "skip" | "replace" | "create_new"
 * @property {string[]} [replaceFields] - Fields to replace: ["price", "description", "category"]
 */

/**
 * @typedef {Object} MenuExtractionV2Item
 * @property {string} tempId - Stable ID within extraction (UUID)
 * @property {string} name - Item name
 * @property {string} normalizedName - Normalized name for matching
 * @property {string} [description] - Item description
 * @property {MenuExtractionV2Price} [price] - Price information
 * @property {string} [categoryKey] - Category key (links to categories[].key)
 * @property {string[]} [tags] - Tags (e.g., ["iced", "hot", "vegan"])
 * @property {boolean} [activeDefault] - Default active state (default: false)
 * @property {MenuExtractionV2ItemImage} [image] - Image information
 * @property {MenuExtractionV2ItemConfidence} [confidence] - Confidence scores
 * @property {MenuExtractionV2ItemDedupe} [dedupe] - Deduplication information
 */

/**
 * @typedef {Object} MenuExtractionV2Decision
 * @property {string} tempId - Item tempId
 * @property {string} action - "create_new" | "skip" | "replace"
 * @property {string} [targetExistingItemId] - Existing item ID if replacing
 * @property {string[]} [replaceFields] - Fields to replace
 */

/**
 * @typedef {Object} MenuExtractionV2Summary
 * @property {number} itemCount - Total items extracted
 * @property {number} categoryCount - Number of categories
 * @property {number} duplicateCount - Number of duplicates
 * @property {number} uniqueCount - Number of unique items
 */

/**
 * @typedef {Object} MenuExtractionV2
 * @property {string} extractionId - UUID for this extraction
 * @property {string} tenantId - Tenant ID
 * @property {string} storeId - Store ID
 * @property {string} locale - Locale code (e.g., "en", "vi")
 * @property {MenuExtractionV2Source} source - Source image information
 * @property {MenuExtractionV2Engine} engine - Engine information
 * @property {MenuExtractionV2Category[]} categories - Detected categories
 * @property {MenuExtractionV2Item[]} items - Extracted items
 * @property {MenuExtractionV2Summary} summary - Summary statistics
 * @property {MenuExtractionV2Decision[]} [decisions] - User decisions (for audit)
 */

/**
 * Create a MenuExtractionV2 object from extraction results
 * @param {Object} params - Parameters
 * @param {string} params.tenantId - Tenant ID
 * @param {string} params.storeId - Store ID
 * @param {string} params.imageUrl - Image URL
 * @param {Array} params.items - Extracted items
 * @param {Array} params.categories - Detected categories
 * @param {Object} params.engine - Engine information
 * @param {string} [params.locale] - Locale (default: "en")
 * @returns {MenuExtractionV2} V2 extraction object
 */
export function createMenuExtractionV2({
  tenantId,
  storeId,
  imageUrl,
  items = [],
  categories = [],
  engine = {},
  locale = 'en',
}) {
  // Generate UUID using crypto (Node.js built-in)
  const { randomUUID } = await import('crypto');
  const extractionId = randomUUID();
  const now = new Date().toISOString();

  // Calculate summary
  const duplicateCount = items.filter((item) => 
    item.dedupe && (item.dedupe.status === 'duplicate' || item.dedupe.status === 'possible_duplicate')
  ).length;
  const uniqueCount = items.length - duplicateCount;

  return {
    extractionId,
    tenantId,
    storeId,
    locale,
    source: {
      imageUrl,
    },
    engine: {
      visionProvider: engine.visionProvider || 'openai',
      visionModel: engine.visionModel,
      parserModel: engine.parserModel,
      startedAt: engine.startedAt || now,
      completedAt: engine.completedAt || now,
      debug: engine.debug,
    },
    categories: categories.map((cat) => ({
      key: typeof cat === 'string' ? cat.toLowerCase().replace(/\s+/g, '_') : cat.key,
      name: typeof cat === 'string' ? cat : cat.name,
      confidence: typeof cat === 'object' ? cat.confidence : undefined,
    })),
    items: items.map((item, index) => ({
      tempId: item.tempId || `item-${extractionId}-${index}`,
      name: item.name,
      normalizedName: item.normalizedName || item.name.toLowerCase().trim(),
      description: item.description,
      price: item.price ? {
        amount: typeof item.price === 'number' ? item.price : item.price.amount,
        currency: item.currency || 'AUD',
        source: item.priceSource || 'explicit',
        confidence: item.priceConfidence,
      } : undefined,
      categoryKey: item.categoryKey || item.category,
      tags: item.tags || [],
      activeDefault: item.activeDefault || false,
      image: item.image,
      confidence: item.confidence,
      dedupe: item.dedupe,
    })),
    summary: {
      itemCount: items.length,
      categoryCount: categories.length,
      duplicateCount,
      uniqueCount,
    },
    decisions: [], // Will be populated by UI
  };
}

