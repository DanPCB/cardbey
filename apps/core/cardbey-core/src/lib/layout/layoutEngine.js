/**
 * General Layout Engine — universal layout for text, menus, graphics, dashboards, documents, storefronts.
 */

import { TextLayout } from './layouts/textLayout.js';
import { MenuLayout } from './layouts/menuLayout.js';
import { GraphicLayout } from './layouts/graphicLayout.js';
import { DashboardLayout } from './layouts/dashboardLayout.js';
import { DocumentLayout } from './layouts/documentLayout.js';
import { StorefrontLayout } from './layouts/storefrontLayout.js';
import {
  countMarkdownTableRows,
  looksLikeCodeOrRegex,
  scoreTextReport,
  isMarkdownTableRow,
} from './layoutDetection.js';

/** @typedef {'text' | 'menu' | 'graphic' | 'dashboard' | 'document' | 'storefront'} LayoutType */

export const LAYOUT_TYPES = ['text', 'menu', 'graphic', 'dashboard', 'document', 'storefront'];
export { isMarkdownTableRow };

const DETECTION_RULES = [
  {
    type: 'menu',
    keywords: /(?:menu|drink|food|wine|beer|coffee|tea|breakfast|lunch|dinner|appetizer|main|dessert|entree)/i,
    structure: (content) => {
      if (/Category:/i.test(content) || /\bFeatured\b/i.test(content)) return 0;
      const lines = content.split('\n').filter((l) => l.trim());
      const priced = lines.filter((l) => /\$?\d+(?:\.\d{1,2})?\s*$/.test(l.trim())).length;
      return priced >= 2 ? 3 : priced >= 1 ? 1 : 0;
    },
  },
  {
    type: 'graphic',
    keywords: /(?:design|layout|position|align|spacing|grid|flow|z-index|flexbox|css)/i,
    structure: (content) => (/(?:#[0-9a-f]{3,8}|rgb\(|rgba\(|\d+px)/i.test(content) ? 2 : 0),
  },
  {
    type: 'dashboard',
    keywords: /(?:widget|card|chart|metric|kpi|status|overview|analytics)/i,
    structure: (content) => {
      const tableRows = countMarkdownTableRows(content);
      return tableRows >= 2 ? 3 : tableRows >= 1 ? 1 : 0;
    },
  },
  {
    type: 'document',
    keywords: /(?:section|chapter|page|paragraph|heading|subheading|footnote)/i,
    structure: (content) => (/^(chapter|section|footnote)/im.test(content) ? 2 : 0),
  },
  {
    type: 'storefront',
    keywords: /(?:product|category|featured|collection|bestseller|shop|inventory|stock)/i,
    structure: (content) => {
      let score = 0;
      if (/Category:/i.test(content)) score += 3;
      if (/\bFeatured\b/i.test(content)) score += 2;
      const products = content.split('\n').filter((l) => /\d+(?:\.\d{1,2})?\s*$/.test(l.trim())).length;
      return score + (products >= 2 ? 2 : products >= 1 ? 1 : 0);
    },
  },
];

export class LayoutEngine {
  constructor() {
    /** @type {Record<LayoutType, { process: Function }>} */
    this.layouts = {
      text: new TextLayout(),
      menu: new MenuLayout(),
      graphic: new GraphicLayout(),
      dashboard: new DashboardLayout(),
      document: new DocumentLayout(),
      storefront: new StorefrontLayout(),
    };
  }

  /**
   * Detect content type from structure and keywords.
   * @param {string} content
   * @returns {LayoutType}
   */
  detectType(content) {
    const input = String(content ?? '');
    /** @type {Record<LayoutType, number>} */
    const scores = {
      text: 0,
      menu: 0,
      graphic: 0,
      dashboard: 0,
      document: 0,
      storefront: 0,
    };

    for (const rule of DETECTION_RULES) {
      if (rule.keywords.test(input)) {
        scores[rule.type] += 2;
      }
      scores[rule.type] += rule.structure(input);
    }

    scores.text += scoreTextReport(input);

    if (looksLikeCodeOrRegex(input)) {
      scores.text += 3;
      scores.dashboard = Math.max(0, scores.dashboard - 3);
    }

    if (/^#{1,6}\s/m.test(input) || /Executive Summary/i.test(input)) {
      scores.text += 2;
    }

    let best = 'text';
    let bestScore = scores.text;
    for (const type of LAYOUT_TYPES) {
      if (scores[type] > bestScore) {
        best = type;
        bestScore = scores[type];
      }
    }

    return best;
  }

  /**
   * Apply layout rules to content.
   * @param {string} content
   * @param {LayoutType | null} [type]
   * @param {Record<string, unknown>} [options]
   */
  async applyLayout(content, type = null, options = {}) {
    const input = String(content ?? '');
    const detectedType = type && LAYOUT_TYPES.includes(type) ? type : this.detectType(input);
    const layout = this.layouts[detectedType] || this.layouts.text;

    const result = await layout.process(input, options);

    return {
      type: detectedType,
      processed: result.processed,
      original: input,
      stats: result.stats,
      suggestedActions: result.suggestedActions || [],
    };
  }
}

export default LayoutEngine;
