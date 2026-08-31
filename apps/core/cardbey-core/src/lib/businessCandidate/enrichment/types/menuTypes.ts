/**
 * Structured menu item extracted from a restaurant or F&B business.
 * All fields nullable except name — extraction is best-effort.
 */

export interface ExtractedMenuItem {
  name: string;
  description: string | null;
  price: number | null;
  priceDisplay: string | null;
  category: string | null;
  dietaryTags: string[];
  imageUrl: string | null;
  isSignatureDish: boolean;
  sourceConfidence: number;
  extractionSource:
    | 'website_menu_page'
    | 'google_places_menu'
    | 'zomato'
    | 'opentable'
    | 'foursquare_tips'
    | 'claude_synthesis'
    | 'menulog';
}

export interface ExtractedMenu {
  items: ExtractedMenuItem[];
  sections: string[];
  currency: string;
  extractedAt: string;
  source: string;
  confidence: 'high' | 'medium' | 'low';
  rawText: string | null;
}

export type FetchedMenuRecord = ExtractedMenu;

/**
 * Confidence levels:
 * high   — structured menu page with prices (≥5 items, ≥50% have prices)
 * medium — menu page found but prices incomplete or fewer items
 * low    — description-only, no structured menu, Claude synthesis
 */
